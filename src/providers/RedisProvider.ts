import {createClient, RedisClientType} from "redis";
import {SignatureV4} from "@aws-sdk/signature-v4";
import {fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {Sha256} from "@aws-crypto/sha256-js";
import {HttpRequest} from '@aws-sdk/protocol-http';
import {formatUrl} from "@aws-sdk/util-format-url";
import {createHash} from "node:crypto";
import {MonitoringProvider} from "./MonitoringProvider";
import {LogHelper_error, LogHelper_info} from "../helpers/LogHelper";


interface RedisCacheValue {
    data: string;
    ttl: number | undefined;
    expirationTimestamp: number | undefined;
    tags?: string[];
}

export interface RedisScanResult {
    cursor: string;
    keys: string[];
}

export interface RedisClearByTagResult {
    deleted: number;
    members: number;
}

const DEFAULT_TAG_REFRESH_INTERVAL_SECONDS = 3600;
// A tag set is TOUCHed at most this often per pod while any of its members is being read, which keeps its
// LRU age at or below the age of its most recently read member (see the lifecycle note on the class).
const TAG_TOUCH_INTERVAL_MS = 60 * 1000;
const TAG_KEY_PREFIX = 'tag:';
// Pseudo-members written by CacheHelper_createParentChildRelation. They are not Redis keys,
// so they must never be EXISTS-filtered, deleted or SREM-ed as if they were data keys.
const PARENT_MARKER_PREFIX = 'parent_';
const CHILD_MARKER_PREFIX = 'child_';
const RELATION_MARKER_PREFIXES = [PARENT_MARKER_PREFIX, CHILD_MARKER_PREFIX];
const MAX_TAG_REFRESH_ENTRIES = 100000;
const TAG_REFRESH_PRUNE_TARGET = Math.floor(MAX_TAG_REFRESH_ENTRIES * 0.8);
const BATCH_SIZE = 500;
const SCAN_END_CURSOR = '0';
const LOGGED_KEY_MAX_LENGTH = 300;
// During a Redis outage every cache operation fails; log one sample per scope per interval instead of one line per call
const ERROR_LOG_THROTTLE_MS = 10000;

// Lua keeps this atomic: removes members from a tag set only if their key does not exist at that very moment
// (no EXISTS -> SREM race with a concurrent re-write of the key).
const LUA_SREM_IF_KEY_MISSING = `local removed = 0
for i = 1, #ARGV do
  if redis.call('EXISTS', ARGV[i]) == 0 then removed = removed + redis.call('SREM', KEYS[1], ARGV[i]) end
end
return removed`;

export function RedisProvider_isRelationMarker(member: string): boolean {
    return typeof member === 'string' && RELATION_MARKER_PREFIXES.some((prefix) => member.startsWith(prefix));
}

/**
 * Key lifecycle contract
 * ----------------------
 * No key in the cache database ever carries a Redis TTL, and this is not configurable. The `ttl` and
 * `expirationTimestamp` inside a cached object say when the entry should be REFRESHED (stale-while-revalidate),
 * never when it should be deleted. Entries disappear in exactly two ways: an explicit invalidation, or
 * maxmemory eviction replacing the least recently used keys. A stale hit is always preferred over a miss.
 *
 * A tag set (`tag:<tag>`, the bag of keys an invalidation deletes) and its members are kept in step so that
 * eviction cannot separate them:
 *  - both are written without a TTL, in one MULTI, so a key never exists outside its bag;
 *  - every read of a member TOUCHes the bag (throttled per pod), so under LRU the bag is never older than
 *    its most recently read member and eviction takes the members before it takes the bag;
 *  - a member evicted on its own leaves a dead entry that getKeysByTag/clearByTag remove lazily;
 *  - should the bag be evicted anyway, the next read of any member re-registers it (SADD is idempotent),
 *    and clearByTag counts the empty bag (`info.RedisProvider.clearByTag.emptyTagSet`) so this stays visible.
 *
 * REQUIRES an allkeys-* maxmemory-policy: with no TTL anywhere, a volatile-* policy has nothing to evict and
 * writes fail with OOM once maxmemory is reached.
 */
export class RedisProvider {
    client: RedisClientType;
    url: string;
    replicationGroupId: string;
    service: string;
    region: string;
    username: string;
    maxReInitialize: number;
    currentReInitialize: number;
    isReconnecting: boolean;
    /** Throttle (ms) for re-asserting tag membership on reads, per (tag, key). */
    tagRefreshInterval: number;
    /** Throttle state for read-side housekeeping: `<tag>|<keyHash>` membership refreshes and `touch|<tag>` TOUCHes. */
    lastTagRefresh: Map<string, number>;
    lastErrorLog: Map<string, {at: number; suppressed: number}>;
    initPromise: Promise<void> | null;

    constructor() {
        this.url = process.env.REDIS_RW;
        this.replicationGroupId = process.env.REDIS_REPLICATION_GROUP_ID;
        this.username = process.env.REDIS_USERNAME ||'iam-user';
        this.region = process.env.REDIS_REGION || 'eu-central-1';
        this.service = 'elasticache';
        this.maxReInitialize = 10;
        this.currentReInitialize = 0;
        this.isReconnecting = false;
        this.lastTagRefresh = new Map();
        this.lastErrorLog = new Map();
        this.initPromise = null;
        this._configureTtls();

        setInterval(async () => {
            if (!this.client) {
                return;
            }
            try {
                const token = await this.getToken();
                if (!token) {
                    MonitoringProvider.counter('error.RedisProvider.token_refresh');
                    return;
                }

                await this.client.auth({
                    username: process.env.REDIS_USERNAME ||'iam-user',
                    password: token,
                });
            } catch (err) {
                MonitoringProvider.counter('error.RedisProvider.token_refresh');
                this._logErrorThrottled('auth', 'RedisProvider periodic AUTH failed', {
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
            }
        }, 10 * 1000);
    }

    /**
     * Reads the one tunable of the read-side housekeeping (how often a read re-asserts a key's tag
     * membership). Expiry itself is not configurable: see the lifecycle contract on the class. Env vars that
     * used to select an expiry (CACHE_TAG_TTL from 4.14, CACHE_KEY_EXPIRE_GRACE_SECONDS from an unreleased
     * 4.20 draft) are reported once and ignored.
     */
    _configureTtls(): void {
        this.tagRefreshInterval = this._parsePositiveIntOrDefault(
            process.env.CACHE_TAG_REFRESH_INTERVAL,
            DEFAULT_TAG_REFRESH_INTERVAL_SECONDS
        ) * 1000; // ms

        for (const ignored of ['CACHE_TAG_TTL', 'CACHE_KEY_EXPIRE_GRACE_SECONDS']) {
            if (process.env[ignored] !== undefined) {
                LogHelper_info(`RedisProvider: ${ignored} is ignored; cache keys and tag sets never carry a Redis TTL`, {
                    [ignored]: process.env[ignored],
                });
            }
        }
    }

    async createRedisClient() {
        const token = await this.getToken();
        this.client = createClient({
            username: this.username,
            password: token,
            database: 1,
            socket: {
                host: this.url,
                tls: true,
                reconnectStrategy: function (retries) {
                    if (retries > 20) {
                        LogHelper_error("Too many attempts to reconnect. Redis connection was terminated");
                        return new Error("Too many retries.");
                    } else {
                        MonitoringProvider.counter('error.RedisProvider.reconnectStrategy');
                        return retries * 500;
                    }
                },
            },
        }) as RedisClientType;
    }

    attachRedisErrorsHandler() {
        this.client.on('error', async (error) => {
            MonitoringProvider.counter(`error.RedisProvider.onError`);
            LogHelper_error(`Redis Client Error:`, error);

            const errorMessage = error.message?.toString() || '';
            const shouldReconnect = errorMessage.includes('ECONNRESET') ||
                                    errorMessage.includes('The client is closed') ||
                                    errorMessage.includes('Socket closed unexpectedly');

            if (shouldReconnect) {
                await this.handleReconnect('error');
            }
        });

        this.client.on('end', async () => {
            MonitoringProvider.counter('info.RedisProvider.onEnd');
            LogHelper_info('Redis connection ended');
            await this.handleReconnect('end');
        });
    }

    async handleReconnect(reason: string): Promise<void> {
        if (this.isReconnecting) {
            return;
        }

        if (this.currentReInitialize >= this.maxReInitialize) {
            MonitoringProvider.counter('error.RedisProvider.reachedMaxReinitialize');
            process.exit(1);
            return;
        }

        LogHelper_info('Redis connection reconnecting...');
        this.isReconnecting = true;
        this.currentReInitialize += 1;
        MonitoringProvider.counter(`info.RedisProvider.reinitialize_started_${reason}`);

        try {
            if (this.client) {
                try {
                    await this.client.disconnect();
                } catch (e) {

                }
            }

            await this.createRedisClient();
            this.attachRedisErrorsHandler();
            await this.client.connect();

            this.currentReInitialize = 0;
            MonitoringProvider.counter(`info.RedisProvider.reinitialize_ended_${reason}`);
            LogHelper_info('Redis connection reconnected');
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.reinitialize_failed');
            LogHelper_error('Redis reinitialize failed:', err);
        } finally {
            this.isReconnecting = false;
        }
    }

    async initialize() {
        try {
            await this.createRedisClient();
            this.attachRedisErrorsHandler();
            await this.client.connect();
            MonitoringProvider.counter('info.RedisProvider.initialize');
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.initialize');
        }

    }

    /**
     * Makes sure a client exists, sharing one in-flight initialize() between concurrent callers so an
     * unreachable Redis does not trigger one SigV4 presign + connect attempt per cache operation.
     * Returns false when no client is available; callers then degrade (cache miss / no-op) instead of throwing TypeError.
     */
    async _ensureClient(): Promise<boolean> {
        if (this.client) {
            return true;
        }
        if (!this.initPromise) {
            this.initPromise = this.initialize().finally(() => {
                this.initPromise = null;
            });
        }
        await this.initPromise;
        if (!this.client) {
            MonitoringProvider.counter('error.RedisProvider.clientUnavailable');
        }
        return !!this.client;
    }

    async getToken(): Promise<string | undefined> {

        const signer = new SignatureV4({
            service: this.service,
            region: this.region,
            credentials: fromNodeProviderChain(),
            sha256: Sha256,
        });

        const request = new HttpRequest({
            hostname: this.replicationGroupId,
            query: {
                Action: 'connect',
                User: this.username,
            },
            headers: {
                host: this.replicationGroupId,
            },
        });

        const presigned = await signer.presign(request, {
            expiresIn: 900,
        });

        return formatUrl(presigned).replace(`${request.protocol}//`, '');
    }

    /**
     * Writes a data key together with its tag membership in ONE MULTI/EXEC, so a key can never exist
     * without being a member of its tag sets (and vice versa). Neither gets a Redis TTL (see the lifecycle
     * contract on the class); the tag sets are PERSISTed to strip the EXPIRE that versions 4.14 to 4.19 put on
     * them, the plain SET does the same for the key.
     */
    async set({
                  key,
                  ttl,
                  value,
                  tags,
              }: {
        key: string;
        ttl?: number | string | null | undefined;
        value: string;
        tags?: string[] | null | boolean;
    }): Promise<void> {
        if (!(await this._ensureClient())) {
            MonitoringProvider.counter('error.RedisProvider.set');
            return;
        }

        const ttlSeconds = this._toPositiveSeconds(ttl);
        const expirationTimestamp: null | number = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        const tagsArray = this._normalizeTags(tags);
        const setValue = JSON.stringify({
            data: value,
            ttl: ttlSeconds,
            expirationTimestamp,
            tags: tagsArray,
        } as RedisCacheValue);
        try {
            const multi = this.client.multi();
            multi.set(key, setValue);
            if (tagsArray) {
                for (const tag of tagsArray) {
                    multi.sAdd(TAG_KEY_PREFIX + tag, key);
                    multi.persist(TAG_KEY_PREFIX + tag);
                }
            }
            await multi.exec();
            this._markRefreshed(tagsArray || [], key);
            MonitoringProvider.counter('info.RedisProvider.set');
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.set');
            this._logErrorThrottled('set', 'RedisProvider.set failed', {
                key: this._keyForLog(key),
                tags: tagsArray,
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }


    async get({key}: {
        key: string;
    }): Promise<string | null> {
        if (!(await this._ensureClient())) {
            MonitoringProvider.counter('error.RedisProvider.get');
            return null;
        }

        try {
            const data = await this.client.get(key);
            if (!data) {
                return null;
            }
            const parsedData = this._parseResponse(data, key);
            this._afterRead(parsedData, key);
            MonitoringProvider.counter('info.RedisProvider.get');
            return parsedData.data;
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.get');
            this._logErrorThrottled('get', 'RedisProvider.get failed', {
                key: this._keyForLog(key),
                errorMessage: err instanceof Error ? err.message : String(err),
            });
            return null;
        }

    }

    async getDecoratedCachedObject({key}: {
        key: string;
    }): Promise<RedisCacheValue | null> {
        if (!(await this._ensureClient())) {
            MonitoringProvider.counter('error.RedisProvider.getDecoratedCachedObject');
            return null;
        }

        try {
            const data = await this.client.get(key);
            if (!data) {
                return null;
            }
            const parsedData = this._parseResponse(data, key);
            this._afterRead(parsedData, key);
            MonitoringProvider.counter('info.RedisProvider.getDecoratedCachedObject');
            return parsedData;
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.getDecoratedCachedObject');
            this._logErrorThrottled('getDecoratedCachedObject', 'RedisProvider.getDecoratedCachedObject failed', {
                key: this._keyForLog(key),
                errorMessage: err instanceof Error ? err.message : String(err),
            });
            return null;
        }

    }

    async del(key: string): Promise<number> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.del: Redis client unavailable');
        }
        MonitoringProvider.counter('info.RedisProvider.del');
        return await this.client.del(key);
    }

    async unlink(key: string): Promise<number> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.unlink: Redis client unavailable');
        }
        MonitoringProvider.counter('info.RedisProvider.unlink');
        return await this.client.unlink(key);
    }

    async flushAll(): Promise<any> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.flushAll: Redis client unavailable');
        }
        MonitoringProvider.counter('info.RedisProvider.flushAll');
        return this.client.flushAll();
    }

    async keys(): Promise<string[]> {
        if (!(await this._ensureClient())) {
            return [];
        }
        MonitoringProvider.counter('info.RedisProvider.keys');
        const keysFromRedis = await this.client.keys("*");
        return keysFromRedis;
    }


    /**
     * node-redis v5 takes and returns the SCAN cursor as a string (v4 used numbers).
     * Both directions are normalized so callers can compare against '0' regardless of client version.
     */
    async scan(cursor: number | string, match: string, count: number = 1000): Promise<RedisScanResult> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.scan: Redis client unavailable');
        }
        MonitoringProvider.counter('info.RedisProvider.scan');
        const reply = await this.client.scan(String(cursor ?? SCAN_END_CURSOR), {MATCH: match, COUNT: count});
        return {
            cursor: String(reply.cursor),
            keys: (reply.keys || []).map((scannedKey) => String(scannedKey)),
        };
    }

    async keysByGlob(globKey: string): Promise<string[]> {
        if (!(await this._ensureClient())) {
            return [];
        }

        MonitoringProvider.counter('info.RedisProvider.keysByGlob');
        const keysFromRedis = await this.client.keys(globKey);
        return keysFromRedis;
    }

    async getTtl(key: string): Promise<number | undefined> {
        if (!(await this._ensureClient())) {
            return undefined;
        }
        MonitoringProvider.counter('info.RedisProvider.getTtl');
        const data = await this.client.get(key);
        const parsedData = this._parseResponse(data, key);

        return parsedData.ttl;

    }

    async getExpirationTimestamp(key: string): Promise<number | undefined> {
        if (!(await this._ensureClient())) {
            return undefined;
        }
        MonitoringProvider.counter('info.RedisProvider.getExpirationTimestamp');
        const data = await this.client.get(key);
        const parsedData = this._parseResponse(data, key);

        return parsedData.expirationTimestamp;

    }

    _parseResponse(data: any, key?: string): RedisCacheValue {
        let parsedData = data;
        try {
            if (typeof data === 'string') {
                parsedData = JSON.parse(data);
            }
            return (parsedData && typeof parsedData === 'object' && 'data' in parsedData)
                ? parsedData
                : {
                    data: parsedData,
                    ttl: undefined,
                    expirationTimestamp: undefined,
                };
        } catch (e) {
            LogHelper_error('Redis Error parsing data for key:', key);
            return {
                data: data,
                ttl: undefined,
                expirationTimestamp: undefined,
            }
        }
    }

    _parsePositiveIntOrDefault(value: string | undefined, fallback: number): number {
        const parsedValue = Number.parseInt(value || '', 10);
        return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
    }

    _toPositiveSeconds(ttl: number | string | null | undefined): number | undefined {
        if (ttl === null || ttl === undefined || ttl === '') {
            return undefined;
        }
        const seconds = Number(ttl);
        return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
    }

    _normalizeTags(tags: string[] | null | boolean | undefined): string[] | undefined {
        if (!tags || typeof tags !== 'object' || !Array.isArray(tags)) {
            return undefined;
        }
        const normalized = tags.filter((tag) => typeof tag === 'string' && tag.length > 0);
        return normalized.length > 0 ? normalized : undefined;
    }

    _keyForLog(key: string): string {
        return typeof key === 'string' && key.length > LOGGED_KEY_MAX_LENGTH
            ? key.slice(0, LOGGED_KEY_MAX_LENGTH) + `…(${key.length} chars)`
            : key;
    }

    /** Logs at most one error per scope per ERROR_LOG_THROTTLE_MS, reporting how many were suppressed in between. */
    _logErrorThrottled(scope: string, message: string, data: Record<string, unknown>): void {
        const now = Date.now();
        const last = this.lastErrorLog.get(scope);
        if (last && now - last.at < ERROR_LOG_THROTTLE_MS) {
            last.suppressed += 1;
            return;
        }
        LogHelper_error(message, {...data, suppressedSinceLastLog: last?.suppressed ?? 0});
        this.lastErrorLog.set(scope, {at: now, suppressed: 0});
    }

    _hashKey(key: string): string {
        return createHash('sha1').update(key).digest('base64url').slice(0, 20);
    }

    /** Throttle-map key for the per-(tag, key) membership refresh. */
    _refreshMapKey(tag: string, keyHash: string): string {
        return tag + '|' + keyHash;
    }

    /** Throttle-map key for the per-tag TOUCH (key hashes are base64url, so 'touch|' cannot collide). */
    _touchMapKey(tag: string): string {
        return 'touch|' + tag;
    }

    _isRecentlyRefreshed(mapKey: string, now: number): boolean {
        const last = this.lastTagRefresh.get(mapKey);
        return !!last && (now - last) < this.tagRefreshInterval;
    }

    /** A write just did SADD (membership + access) on these tags: nothing to redo on the next reads for a while. */
    _markRefreshed(tags: string[], key: string, now: number = Date.now()): void {
        const keyHash = this._hashKey(key);
        for (const tag of tags) {
            this.lastTagRefresh.set(this._refreshMapKey(tag, keyHash), now);
            this.lastTagRefresh.set(this._touchMapKey(tag), now);
        }
        this._pruneTagRefreshMap();
    }

    /**
     * Bounds the throttle map. Map iteration order is insertion order, so dropping from the front removes the
     * entries that were inserted longest ago; this is amortized O(k) for k removed entries and only runs when
     * the cap is exceeded (never a full scan on every write).
     */
    _pruneTagRefreshMap(): void {
        if (this.lastTagRefresh.size <= MAX_TAG_REFRESH_ENTRIES) {
            return;
        }
        for (const mapKey of this.lastTagRefresh.keys()) {
            this.lastTagRefresh.delete(mapKey);
            if (this.lastTagRefresh.size <= TAG_REFRESH_PRUNE_TARGET) {
                break;
            }
        }
        MonitoringProvider.gauge('info.RedisProvider.tagRefreshMapSize', this.lastTagRefresh.size);
    }

    /**
     * Fire-and-forget housekeeping after a successful read of a tagged key:
     *  - TOUCHes every tag set the key belongs to, at most once per TAG_TOUCH_INTERVAL_MS per tag per pod.
     *    Under LRU this keeps the bag at least as recent as its most recently read member, so eviction
     *    removes members before it removes the bag that an invalidation needs to find them;
     *  - re-asserts the key's membership with SADD (idempotent) and PERSISTs the bag, at most once per
     *    tagRefreshInterval per (tag, key), so a key that lost its bag (eviction, purge race, partial write)
     *    heals on the next read and no EXPIRE from versions 4.14 to 4.19 survives.
     */
    _afterRead(parsedData: RedisCacheValue, key: string): void {
        if (!this.client) {
            return;
        }
        const tags = (parsedData.tags || []).filter((tag) => typeof tag === 'string' && tag.length > 0);
        if (tags.length === 0) {
            return;
        }
        const now = Date.now();
        const keyHash = this._hashKey(key);
        const dueTags = tags.filter((tag) => !this._isRecentlyRefreshed(this._refreshMapKey(tag, keyHash), now));
        const touchTags = tags.filter((tag) => {
            const last = this.lastTagRefresh.get(this._touchMapKey(tag));
            return !last || (now - last) >= TAG_TOUCH_INTERVAL_MS;
        });
        if (dueTags.length === 0 && touchTags.length === 0) {
            return;
        }

        const touched: string[] = [];
        for (const tag of dueTags) {
            touched.push(this._refreshMapKey(tag, keyHash));
        }
        for (const tag of touchTags) {
            touched.push(this._touchMapKey(tag));
        }
        for (const mapKey of touched) {
            this.lastTagRefresh.set(mapKey, now);
        }
        this._pruneTagRefreshMap();

        const multi = this.client.multi();
        for (const tag of dueTags) {
            multi.sAdd(TAG_KEY_PREFIX + tag, key);
            multi.persist(TAG_KEY_PREFIX + tag);
        }
        // SADD already counts as an access; TOUCH covers the tags whose membership was refreshed recently
        const touchOnly = touchTags.filter((tag) => !dueTags.includes(tag));
        if (touchOnly.length > 0) {
            multi.touch(touchOnly.map((tag) => TAG_KEY_PREFIX + tag));
        }
        multi.exec()
            .then(() => {
                MonitoringProvider.counter('info.RedisProvider.afterRead.refreshed');
            })
            .catch((err) => {
                MonitoringProvider.counter('error.RedisProvider.afterRead.refresh');
                this._logErrorThrottled('afterRead', 'RedisProvider read-side tag refresh failed', {
                    key: this._keyForLog(key),
                    tags: dueTags,
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
                // Allow the next read to retry instead of waiting a full interval
                for (const mapKey of touched) {
                    this.lastTagRefresh.delete(mapKey);
                }
            });
    }


    async stats() {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.stats: Redis client unavailable');
        }
        MonitoringProvider.counter('info.RedisProvider.stats');
        return this.client.info();
    }

    async mget(keys: string[]): Promise<{ [p: string]: unknown }> {
        if (!(await this._ensureClient())) {
            return {};
        }
        MonitoringProvider.counter('info.RedisProvider.mGet');
        const values = await this.client.mGet(keys);
        const result = {};
        keys.forEach((key, index) => {
            result[key] = values[index];
        });
        return result;
    }

    /**
     * Returns the members of a tag set that are still alive: data keys that EXIST plus relation markers
     * (parent_/child_), which are not keys and are therefore never EXISTS-checked or removed here.
     * Dead data keys are lazily removed with LUA_SREM_IF_KEY_MISSING (fire-and-forget, atomic per member,
     * so a key re-created between the EXISTS check and the cleanup is never stripped from its tag).
     */
    async getKeysByTag(tag: string): Promise<string[]> {
        if (!(await this._ensureClient())) {
            return [];
        }
        const tagKey = TAG_KEY_PREFIX + tag;
        const members = await this.client.sMembers(tagKey);

        if (!members || members.length === 0) {
            return members || [];
        }

        const relationMarkers: string[] = [];
        const dataKeys: string[] = [];
        for (const member of members) {
            if (RedisProvider_isRelationMarker(member)) {
                relationMarkers.push(member);
            } else {
                dataKeys.push(member);
            }
        }
        if (dataKeys.length === 0) {
            return relationMarkers;
        }

        // Lazy cleanup: check which keys still exist in Redis (single pipeline round-trip)
        const pipeline = this.client.multi();
        for (const key of dataKeys) {
            pipeline.exists(key);
        }
        const existsResults = (await pipeline.exec()) as unknown as number[];

        const aliveKeys: string[] = [];
        const deadKeys: string[] = [];

        for (let i = 0; i < dataKeys.length; i++) {
            if (existsResults[i]) {
                aliveKeys.push(dataKeys[i]);
            } else {
                deadKeys.push(dataKeys[i]);
            }
        }

        if (deadKeys.length > 0) {
            MonitoringProvider.gauge('info.RedisProvider.getKeysByTag.staleKeysRemoved', deadKeys.length);
            for (let i = 0; i < deadKeys.length; i += BATCH_SIZE) {
                const batch = deadKeys.slice(i, i + BATCH_SIZE);
                this.client.eval(LUA_SREM_IF_KEY_MISSING, {keys: [tagKey], arguments: batch}).catch(() => {
                    MonitoringProvider.counter('error.RedisProvider.getKeysByTag.sRemFailed');
                });
            }
        }

        return [...aliveKeys, ...relationMarkers];
    }

    async getValuesByTag(tag: string) {
        const keys = (await this.getKeysByTag(tag)).filter((member) => !RedisProvider_isRelationMarker(member));
        if (keys.length === 0) return [];
        return await this.client.mGet(keys);
    }

    /**
     * Purges every data key registered under a tag.
     * Each batch runs DEL <keys> + SREM <tag> <keys> in one MULTI/EXEC, and only the members seen in the
     * SMEMBERS snapshot are touched. The tag set itself is never deleted, so:
     *  - a key written concurrently (SET + SADD land after the snapshot) keeps its membership and is
     *    purged by the next invalidation instead of becoming an orphan,
     *  - parent_<uuid> markers survive and parent invalidation keeps working (they are removed one by one by
     *    the webhook after use; child_<uuid> markers are informational and dropped here, the parent's next
     *    render re-creates them),
     *  - a failed DEL leaves the member in the set for the next purge instead of orphaning the key.
     * Errors are logged (throttled) and re-thrown so the caller knows the purge did not complete.
     */
    async clearByTag(tag: string): Promise<RedisClearByTagResult> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.clearByTag: Redis client unavailable');
        }
        const tagKey = TAG_KEY_PREFIX + tag;
        try {
            const members = (await this.client.sMembers(tagKey)) || [];
            if (members.length === 0) {
                // A story tag without members usually means the tag set was lost (evicted/expired) before the purge
                MonitoringProvider.counter('info.RedisProvider.clearByTag.emptyTagSet');
            }
            const dataKeys = members.filter((member) => !RedisProvider_isRelationMarker(member));
            const childMarkers = members.filter((member) => member.startsWith(CHILD_MARKER_PREFIX));

            let deleted = 0;
            for (let i = 0; i < dataKeys.length; i += BATCH_SIZE) {
                const batch = dataKeys.slice(i, i + BATCH_SIZE);
                const multi = this.client.multi();
                multi.del(batch);
                multi.sRem(tagKey, batch);
                const replies = await multi.exec();
                deleted += Number(replies?.[0]) || 0;
            }
            if (childMarkers.length > 0) {
                await this.client.sRem(tagKey, childMarkers);
            }

            MonitoringProvider.counter('info.RedisProvider.clearByTag');
            MonitoringProvider.gauge('info.RedisProvider.clearByTag.deletedKeys', deleted);
            return {deleted, members: members.length};
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.clearByTag');
            this._logErrorThrottled('clearByTag', 'RedisProvider.clearByTag failed', {
                tag,
                errorMessage: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    async removeKeyFromTag(tag: string, key: string): Promise<void> {
        if (!(await this._ensureClient())) {
            return;
        }
        try {
            await this.client.sRem(TAG_KEY_PREFIX + tag, key);
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.removeKeyFromTag');
            this._logErrorThrottled('removeKeyFromTag', 'RedisProvider.removeKeyFromTag failed', {
                tag,
                key: this._keyForLog(key),
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /** Deletes the whole tag set including relation markers. Prefer clearByTag(), which keeps the set consistent. */
    async removeTag(tag: string): Promise<void> {
        if (!(await this._ensureClient())) {
            return;
        }
        try {
            await this.client.del(TAG_KEY_PREFIX + tag);
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.removeTag');
            this._logErrorThrottled('removeTag', 'RedisProvider.removeTag failed', {
                tag,
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }


    /** Adds a member (data key or relation marker) to a tag set; the set stays without a TTL. */
    async addTag(tag: string, key: string): Promise<void> {
        if (!(await this._ensureClient())) {
            MonitoringProvider.counter('error.RedisProvider.addTag');
            return;
        }
        try {
            const multi = this.client.multi();
            multi.sAdd(TAG_KEY_PREFIX + tag, key);
            multi.persist(TAG_KEY_PREFIX + tag);
            await multi.exec();
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.addTag');
            this._logErrorThrottled('addTag', 'RedisProvider.addTag failed', {
                tag,
                key: this._keyForLog(key),
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    async flushAllAsync(): Promise<any> {
        if (!(await this._ensureClient())) {
            throw new Error('RedisProvider.flushAllAsync: Redis client unavailable');
        }
        return this.client.sendCommand(['FLUSHALL', 'ASYNC']);
    }
}
