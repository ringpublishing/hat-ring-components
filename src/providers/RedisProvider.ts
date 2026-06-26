import {createClient, RedisClientType} from "redis";
import {SignatureV4} from "@aws-sdk/signature-v4";
import {fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {Sha256} from "@aws-crypto/sha256-js";
import {HttpRequest} from '@aws-sdk/protocol-http';
import {formatUrl} from "@aws-sdk/util-format-url";
import {MonitoringProvider} from "./MonitoringProvider";
import {ScanReply} from "@redis/client/dist/lib/commands/SCAN";
import {LogHelper_error, LogHelper_info} from "../helpers/LogHelper";


interface RedisCacheValue {
    data: string;
    ttl: number | undefined;
    expirationTimestamp: number | undefined;
    tags?: string[];
}

const DEFAULT_TAG_TTL_SECONDS = 60;
const DEFAULT_TAG_REFRESH_INTERVAL_SECONDS = 3600;

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
    tagTTL: number;
    tagRefreshInterval: number;
    lastTagRefresh: Map<string, number>;

    constructor() {
        this.url = process.env.REDIS_RW;
        this.replicationGroupId = process.env.REDIS_REPLICATION_GROUP_ID;
        this.username = process.env.REDIS_USERNAME ||'iam-user';
        this.region = process.env.REDIS_REGION || 'eu-central-1';
        this.service = 'elasticache';
        this.maxReInitialize = 10;
        this.currentReInitialize = 0;
        this.isReconnecting = false;
        this.tagTTL = this._parsePositiveIntOrDefault(
            process.env.CACHE_TAG_TTL ?? process.env.CACHE_TTL,
            DEFAULT_TAG_TTL_SECONDS
        );
        this.tagRefreshInterval = this._parsePositiveIntOrDefault(
            process.env.CACHE_TAG_REFRESH_INTERVAL,
            DEFAULT_TAG_REFRESH_INTERVAL_SECONDS
        ) * 1000; // ms
        this.lastTagRefresh = new Map();

        setInterval(async () => {
            if (!this.client) {
                return;
            }
            const token = await this.getToken();
            if (!token) {
                MonitoringProvider.counter('error.RedisProvider.token_refresh');
                return;
            }

            await this.client.auth({
                username: process.env.REDIS_USERNAME ||'iam-user',
                password: token,
            });


        }, 10 * 1000);
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

    async set({
                  key,
                  ttl,
                  value,
                  tags,
              }: {
        key: string;
        ttl?: number | null | undefined;
        value: string;
        tags?: string[] | null | boolean;
    }): Promise<void> {
        if (!this.client) {
            await this.initialize();
        }

        let expirationTimestamp: null | number = null;
        if (ttl) {
            expirationTimestamp = Date.now() + ttl * 1000;
        }
        const tagsArray = (tags && typeof tags === 'object') ? tags as string[] : undefined;
        const setValue = JSON.stringify({data: value, ttl, expirationTimestamp, tags: tagsArray} as RedisCacheValue);
        try {
            await this.client.set(key, setValue);
            if (tagsArray) {
                for (const tag of tagsArray) {
                    await this.client.sAdd('tag:' + tag, key);
                    await this.client.expire('tag:' + tag, this.tagTTL);
                }
            }
            MonitoringProvider.counter('info.RedisProvider.set');
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.set');
        }
    }


    async get({key}: {
        key: string;
    }): Promise<string | null> {
        if (!this.client) {
            await this.initialize();
        }

        try {
            const data = await this.client.get(key);
            if (!data) {
                return null;
            }
            const parsedData = this._parseResponse(data, key);
            this._refreshTagsExpire(parsedData.tags);
            MonitoringProvider.counter('info.RedisProvider.get');
            return parsedData.data;
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.get');
            return null;
        }

    }

    async getDecoratedCachedObject({key}: {
        key: string;
    }): Promise<RedisCacheValue | null> {
        if (!this.client) {
            await this.initialize();
        }

        try {
            const data = await this.client.get(key);
            if (!data) {
                return null;
            }
            const parsedData = this._parseResponse(data, key);
            this._refreshTagsExpire(parsedData.tags);
            MonitoringProvider.counter('info.RedisProvider.getDecoratedCachedObject');
            return parsedData;
        } catch (err) {
            MonitoringProvider.counter('error.RedisProvider.getDecoratedCachedObject');
            return null;
        }

    }

    async del(key: string): Promise<number> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.del');
        return await this.client.del(key);
    }

    async unlink(key: string): Promise<number> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.unlink');
        return await this.client.unlink(key);
    }

    async flushAll(): Promise<any> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.flushAll');
        return this.client.flushAll();
    }

    async keys(): Promise<string[]> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.keys');
        const keysFromRedis = await this.client.keys("*");
        return keysFromRedis;
    }


    async scan(cursor: number, match: string, count: number = 1000): Promise<ScanReply> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.scan');
        const keysFromRedis = await this.client.scan(cursor, {MATCH: match, COUNT: count});
        return keysFromRedis;
    }

    async keysByGlob(globKey: string): Promise<string[]> {
        if (!this.client) {
            await this.initialize();
        }

        MonitoringProvider.counter('info.RedisProvider.keysByGlob');
        const keysFromRedis = await this.client.keys(globKey);
        return keysFromRedis;
    }

    async getTtl(key: string): Promise<number | undefined> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.getTtl');
        const data = await this.client.get(key);
        const parsedData = this._parseResponse(data, key);

        return parsedData.ttl;

    }

    async getExpirationTimestamp(key: string): Promise<number | undefined> {
        if (!this.client) {
            await this.initialize();
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

    /**
     * Fire-and-forget: refresh EXPIRE on tag sets associated with a cached value.
     * Keeps tags "hot" in LRU as long as their data keys are being read.
     * Throttled per tag — only refreshes once per tagRefreshInterval (default 1h).
     */
    _refreshTagsExpire(tags?: string[]): void {
        if (!tags || tags.length === 0 || !this.client) {
            return;
        }
        const now = Date.now();
        for (const tag of tags) {
            const lastRefresh = this.lastTagRefresh.get(tag);
            if (lastRefresh && (now - lastRefresh) < this.tagRefreshInterval) {
                continue;
            }
            this.lastTagRefresh.set(tag, now);
            this.client.expire('tag:' + tag, this.tagTTL).catch(() => {
                // Silent fail — non-critical operation
            });
        }
    }


    async stats() {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.stats');
        return this.client.info();
    }

    async mget(keys: string[]): Promise<{ [p: string]: unknown }> {
        if (!this.client) {
            await this.initialize();
        }
        MonitoringProvider.counter('info.RedisProvider.mGet');
        const values = await this.client.mGet(keys);
        const result = {};
        keys.forEach((key, index) => {
            result[key] = values[index];
        });
        return result;
    }

    async getKeysByTag(tag) {
        if (!this.client) {
            await this.initialize();
        }
        const keys = await this.client.sMembers(`tag:${tag}`);

        if (!keys || keys.length === 0) {
            return keys;
        }

        // Lazy cleanup: check which keys still exist in Redis (single pipeline round-trip)
        const pipeline = this.client.multi();
        for (const key of keys) {
            pipeline.exists(key);
        }
        const existsResults = (await pipeline.exec()) as unknown as number[];

        const aliveKeys: string[] = [];
        const deadKeys: string[] = [];

        for (let i = 0; i < keys.length; i++) {
            if (existsResults[i]) {
                aliveKeys.push(keys[i]);
            } else {
                deadKeys.push(keys[i]);
            }
        }

        // Fire-and-forget: remove dead keys from the tag set
        if (deadKeys.length > 0) {
            MonitoringProvider.gauge('info.RedisProvider.getKeysByTag.staleKeysRemoved', deadKeys.length);
            this.client.sRem(`tag:${tag}`, deadKeys).catch(() => {
                MonitoringProvider.counter('error.RedisProvider.getKeysByTag.sRemFailed');
            });
        }

        return aliveKeys;
    }

    async getValuesByTag(tag) {
        const keys = await this.getKeysByTag(tag);
        if (keys.length === 0) return [];
        return await this.client.mGet(keys);
    }

    async removeKeyFromTag(tag, key) {
        if (!this.client) {
            await this.initialize();
        }
        await this.client.sRem(`tag:${tag}`, key);
    }

    async removeTag(tag) {
        await this.client.del(`tag:${tag}`);
    }


    async addTag(tag, key) {
        await this.client.sAdd('tag:' + tag, key);
        await this.client.expire('tag:' + tag, this.tagTTL);
    }

    async flushAllAsync(): Promise<any> {
        return this.client.sendCommand(['FLUSHALL', 'ASYNC']);
    }
}
