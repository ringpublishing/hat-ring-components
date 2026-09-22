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

const DEFAULT_DATA_TTL_SECONDS = 60; // mirrors CacheHelper stdTTL default
const DEFAULT_TAG_REFRESH_INTERVAL_SECONDS = 3600;
// 0 = persistent mode (the design default): nothing in the cache database carries a Redis TTL, entries are
// reclaimed only by maxmemory eviction. See the "Expiry modes" note on the class.
const DEFAULT_KEY_EXPIRE_GRACE_SECONDS = 0;
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

// Lua keeps these operations atomic and version-independent (EXPIRE GT/NX would need Redis >= 7).
// Sets EXPIRE only when the key has no TTL or a shorter one: a tag set must never be shortened below the
// physical lifetime of its longest-lived member.
const LUA_EXPIRE_IF_LONGER = `local ttl = redis.call('TTL', KEYS[1])
if ttl == -2 then return 0 end
if ttl == -1 or ttl < tonumber(ARGV[1]) then return redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return 0`;
// Backfills an EXPIRE on a legacy data key written without one (pre-4.20 SET without EX).
const LUA_EXPIRE_IF_PERSISTENT = `if redis.call('TTL', KEYS[1]) == -1 then return redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return 0`;
// Removes members from a tag set only if their key does not exist at that very moment (no EXISTS -> SREM race).
const LUA_SREM_IF_KEY_MISSING = `local removed = 0
for i = 1, #ARGV do
  if redis.call('EXISTS', ARGV[i]) == 0 then removed = removed + redis.call('SREM', KEYS[1], ARGV[i]) end
end
return removed`;

export function RedisProvider_isRelationMarker(member: string): boolean {
    return typeof member === 'string' && RELATION_MARKER_PREFIXES.some((prefix) => member.startsWith(prefix));
}

/**
 * Expiry modes
 * ------------
 * PERSISTENT (default, CACHE_KEY_EXPIRE_GRACE_SECONDS=0) — the framework's original design:
 *   No key in the cache database ever carries a Redis TTL. The TTL lives only inside the cached object
 *   (`ttl` / `expirationTimestamp`) and says when the entry should be REFRESHED, never when it should be
 *   deleted. Entries disappear only when maxmemory is reached and eviction replaces the least recently used
 *   ones, and when an invalidation deletes them explicitly. A stale hit is always preferred over a miss.
 *   The invariant that matters for invalidation is that a tag set and its members share that lifecycle:
 *   both are persistent, so a tag can never expire out from under keys it is responsible for. When eviction
 *   does take a tag set, the next read of any member re-registers it (see _afterRead).
 *   NOTE: this mode requires an allkeys-* maxmemory-policy. Under a volatile-* policy nothing in the
 *   database is evictable and writes start failing with OOM once maxmemory is reached.
 *
 * VOLATILE (CACHE_KEY_EXPIRE_GRACE_SECONDS > 0) — opt-in:
 *   Data keys are written with EX (logical ttl + grace) and tag sets always outlive their longest-lived
 *   member. The keyspace is bounded by Redis itself and an orphaned key disappears on its own, at the cost
 *   of turning a long-unread entry into a hard miss instead of a stale hit. The grace is the
 *   stale-while-revalidate window.
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
    /** Logical TTL applied by CacheHelper when a caller passes none (CACHE_TTL), in seconds. */
    dataTTL: number;
    /** Volatile mode only: base Redis EXPIRE (s) of tag sets; always >= physical life of a default-TTL member. */
    tagTTL: number;
    /** Throttle (ms) for re-asserting tag membership / expiry housekeeping on reads, per (tag, key). */
    tagRefreshInterval: number;
    /** Extra physical lifetime (seconds) of a data key after its logical TTL. 0 = persistent mode, no TTL at all. */
    keyExpireGraceSeconds: number;
    /** True when data keys and tag sets carry a Redis TTL (CACHE_KEY_EXPIRE_GRACE_SECONDS > 0). */
    physicalExpiryEnabled: boolean;
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
     * Derives the expiry mode and TTL settings from env (see the "Expiry modes" note on the class).
     * In volatile mode it enforces the invariants that keep tag sets consistent:
     *   tagTTL             >= CACHE_TTL + grace   (a tag set physically outlives a default-TTL member)
     *   tagRefreshInterval <= tagTTL / 2          (reads refresh a tag well before it can expire)
     * A misconfigured CACHE_TAG_TTL (empty, non-numeric, or lower than CACHE_TTL) is logged and ignored
     * instead of silently shrinking the tag lifetime.
     */
    _configureTtls(): void {
        this.dataTTL = this._parsePositiveIntOrDefault(process.env.CACHE_TTL, DEFAULT_DATA_TTL_SECONDS);
        this.keyExpireGraceSeconds = this._parsePositiveIntOrDefault(
            process.env.CACHE_KEY_EXPIRE_GRACE_SECONDS,
            DEFAULT_KEY_EXPIRE_GRACE_SECONDS
        );
        this.physicalExpiryEnabled = this.keyExpireGraceSeconds > 0;

        if (!this.physicalExpiryEnabled) {
            // Persistent mode: nothing expires, so there is no tag TTL to configure and no need to beat it
            // with frequent refreshes. CACHE_TAG_TTL is meaningless here and is reported if someone set it.
            this.tagTTL = 0;
            this.tagRefreshInterval = this._parsePositiveIntOrDefault(
                process.env.CACHE_TAG_REFRESH_INTERVAL,
                DEFAULT_TAG_REFRESH_INTERVAL_SECONDS
            ) * 1000;
            if (process.env.CACHE_TAG_TTL !== undefined) {
                LogHelper_info('RedisProvider: CACHE_TAG_TTL is ignored in persistent mode (CACHE_KEY_EXPIRE_GRACE_SECONDS=0); tag sets never expire', {
                    CACHE_TAG_TTL: process.env.CACHE_TAG_TTL,
                });
            }
            return;
        }

        let tagTTL = this.dataTTL;
        if (process.env.CACHE_TAG_TTL !== undefined) {
            const requestedTagTTL = this._parsePositiveIntOrDefault(process.env.CACHE_TAG_TTL, 0);
            if (requestedTagTTL === 0) {
                LogHelper_error('RedisProvider: CACHE_TAG_TTL is set but is not a positive integer, falling back to CACHE_TTL', {
                    CACHE_TAG_TTL: process.env.CACHE_TAG_TTL,
                    fallbackSeconds: this.dataTTL,
                });
                MonitoringProvider.counter('error.RedisProvider.config.invalidTagTtl');
            } else if (requestedTagTTL < this.dataTTL) {
                LogHelper_error('RedisProvider: CACHE_TAG_TTL is lower than CACHE_TTL; tag sets must outlive their keys, using CACHE_TTL', {
                    CACHE_TAG_TTL: requestedTagTTL,
                    CACHE_TTL: this.dataTTL,
                });
                MonitoringProvider.counter('error.RedisProvider.config.tagTtlBelowDataTtl');
            } else {
                tagTTL = requestedTagTTL;
            }
        }
        this.tagTTL = tagTTL + this.keyExpireGraceSeconds;

        const requestedRefreshInterval = this._parsePositiveIntOrDefault(
            process.env.CACHE_TAG_REFRESH_INTERVAL,
            DEFAULT_TAG_REFRESH_INTERVAL_SECONDS
        );
        const maxRefreshInterval = Math.max(1, Math.floor(this.tagTTL / 2));
        if (requestedRefreshInterval > maxRefreshInterval) {
            LogHelper_info('RedisProvider: CACHE_TAG_REFRESH_INTERVAL clamped to half of the tag TTL', {
                requestedSeconds: requestedRefreshInterval,
                usedSeconds: maxRefreshInterval,
                tagTtlSeconds: this.tagTTL,
            });
        }
        this.tagRefreshInterval = Math.min(requestedRefreshInterval, maxRefreshInterval) * 1000; // ms
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
     * without being a member of its tag sets (and vice versa).
     * Persistent mode (default): neither the key nor its tag sets get a Redis TTL. The logical TTL inside the
     * value only says when the entry should be refreshed; removal is left to maxmemory eviction and to
     * explicit invalidation. A plain SET also clears a TTL left over from a volatile deployment, and the tag
     * sets are PERSISTed for the same reason.
     * Volatile mode: the key gets EX (ttl + grace) and the tag sets are lengthened (never shortened) so they
     * always outlive their longest-lived member.
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
        // Volatile mode only. A key without a logical TTL is treated as expired on every read (legacy
        // behaviour) but must still be reclaimed physically, otherwise it could outlive its tag set.
        const physicalTtl = (ttlSeconds ?? this.dataTTL) + this.keyExpireGraceSeconds;

        try {
            const multi = this.client.multi();
            if (this.physicalExpiryEnabled) {
                multi.set(key, setValue, {EX: physicalTtl});
            } else {
                // No KEEPTTL: a plain SET also drops a TTL left over from a volatile deployment
                multi.set(key, setValue);
            }
            if (tagsArray) {
                const tagExpire = this._tagExpireSeconds(physicalTtl);
                for (const tag of tagsArray) {
                    multi.sAdd(TAG_KEY_PREFIX + tag, key);
                    this._queueTagExpire(multi, TAG_KEY_PREFIX + tag, tagExpire);
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

    /** Tag sets must outlive their members: never shorter than tagTTL, never shorter than the member's physical life. */
    _tagExpireSeconds(memberPhysicalTtl?: number): number {
        return Math.max(this.tagTTL, memberPhysicalTtl ?? 0);
    }

    /**
     * Queues the tag set's expiry housekeeping: a non-shortening EXPIRE in volatile mode
     * (see LUA_EXPIRE_IF_LONGER), a PERSIST in persistent mode so a tag set can never expire while the keys
     * it is responsible for are still there (including after a switch back from volatile mode).
     */
    _queueTagExpire(multi: any, tagKey: string, seconds: number): void {
        if (!this.physicalExpiryEnabled) {
            multi.persist(tagKey);
            return;
        }
        multi.eval(LUA_EXPIRE_IF_LONGER, {keys: [tagKey], arguments: [String(Math.ceil(seconds))]});
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

    /** Throttle-map key; an empty tag denotes the key-level entry (EX backfill). */
    _refreshMapKey(tag: string, keyHash: string): string {
        return tag + '|' + keyHash;
    }

    _isRecentlyRefreshed(mapKey: string, now: number): boolean {
        const last = this.lastTagRefresh.get(mapKey);
        return !!last && (now - last) < this.tagRefreshInterval;
    }

    _markRefreshed(tags: string[], key: string, now: number = Date.now()): void {
        const keyHash = this._hashKey(key);
        this.lastTagRefresh.set(this._refreshMapKey('', keyHash), now);
        for (const tag of tags) {
            this.lastTagRefresh.set(this._refreshMapKey(tag, keyHash), now);
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
     * Fire-and-forget housekeeping after a successful read, throttled per (tag, key) and per key:
     *  - re-asserts that the key is a member of every tag stored in its value (SADD is idempotent), so a key
     *    that lost its tag (evicted tag set, purge race, partial write) heals on the next read and tag sets
     *    stay "hot" under LRU while their keys are being served;
     *  - keeps the expiry of key and tag set consistent with the configured mode: lengthens them in volatile
     *    mode (including a backfill on keys written before data keys carried an EXPIRE), and PERSISTs a key
     *    that still carries a TTL from a volatile deployment in persistent mode.
     */
    _afterRead(parsedData: RedisCacheValue, key: string): void {
        if (!this.client) {
            return;
        }
        const now = Date.now();
        const keyHash = this._hashKey(key);
        const tags = (parsedData.tags || []).filter((tag) => typeof tag === 'string' && tag.length > 0);
        const dueTags = tags.filter((tag) => !this._isRecentlyRefreshed(this._refreshMapKey(tag, keyHash), now));
        const keyDue = !this._isRecentlyRefreshed(this._refreshMapKey('', keyHash), now);
        if (dueTags.length === 0 && !keyDue) {
            return;
        }

        const touched: string[] = [];
        if (keyDue) {
            touched.push(this._refreshMapKey('', keyHash));
        }
        for (const tag of dueTags) {
            touched.push(this._refreshMapKey(tag, keyHash));
        }
        for (const mapKey of touched) {
            this.lastTagRefresh.set(mapKey, now);
        }
        this._pruneTagRefreshMap();

        const remainingLogicalSeconds = typeof parsedData.expirationTimestamp === 'number'
            ? Math.max(0, Math.ceil((parsedData.expirationTimestamp - now) / 1000))
            : this.dataTTL;
        const physicalTtl = remainingLogicalSeconds + this.keyExpireGraceSeconds;

        const multi = this.client.multi();
        if (keyDue) {
            if (this.physicalExpiryEnabled) {
                multi.eval(LUA_EXPIRE_IF_PERSISTENT, {keys: [key], arguments: [String(physicalTtl)]});
            } else {
                // Persistent mode: drop a TTL left over from a volatile deployment so the key cannot expire
                // before the tag set that indexes it
                multi.persist(key);
            }
        }
        const tagExpire = this._tagExpireSeconds(physicalTtl);
        for (const tag of dueTags) {
            multi.sAdd(TAG_KEY_PREFIX + tag, key);
            this._queueTagExpire(multi, TAG_KEY_PREFIX + tag, tagExpire);
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


    /** Adds a member (data key or relation marker) to a tag set without ever shortening the set's EXPIRE. */
    async addTag(tag: string, key: string): Promise<void> {
        if (!(await this._ensureClient())) {
            MonitoringProvider.counter('error.RedisProvider.addTag');
            return;
        }
        try {
            const multi = this.client.multi();
            multi.sAdd(TAG_KEY_PREFIX + tag, key);
            this._queueTagExpire(multi, TAG_KEY_PREFIX + tag, this.tagTTL);
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
