import {CacheAdapterInterface} from "./types";
import {RedisProvider} from "../../providers/RedisProvider";
import _ from "lodash";

export class RedisCacheAdapter implements CacheAdapterInterface {
    private redisProvider: RedisProvider;

    constructor() {
        const redisProvider = new RedisProvider();
        redisProvider.initialize();
        this.redisProvider = redisProvider;
    }


    async set(key: any, value: any, TTL: number | null | undefined, tags: string[] | null | boolean = null): Promise<void> {
        await this.redisProvider.set({key, value, ttl: TTL, tags: tags});
    }

    async get(key: any): Promise<any> {
        const data = await this.redisProvider.get({key});
        return data;
    }

    async getDecoratedCachedObject(key: any): Promise<{ttl: number | undefined, value: any, expirationTimestamp: number | undefined}> {
        const data = await this.redisProvider.getDecoratedCachedObject({key});

        return {
            ttl: _.get(data,'ttl', undefined),
            value: _.get(data,'data', undefined),
            expirationTimestamp: _.get(data,'expirationTimestamp', undefined),
        };
    }

    async flushAll(): Promise<void> {
        const res = await this.redisProvider.flushAll();
    }

    async keys(): Promise<string[]> {
        return await this.redisProvider.keys();
    }

    async mget(keys: string[]): Promise<{ [p: string]: unknown }> {
        return await this.redisProvider.mget(keys);
    }

    async del(key: any): Promise<number> {
        return await this.redisProvider.del(key);
    }

    async getTtl(key: any): Promise<number | undefined> {
        const data = await this.redisProvider.getTtl(key);
        return data;
    }

    async getExpirationTimestamp(key: any): Promise<number | undefined> {
        const data = await this.redisProvider.getExpirationTimestamp(key);
        return data;
    }

    async keysByGlob(globKey: string): Promise<string[]> {
        return await this.redisProvider.keysByGlob(globKey);
    }

    async scan(cursor:number, match: string, count?:number) {
        return await this.redisProvider.scan(cursor, match, count);
    }

    async getKeysByTag(tag: string): Promise<string[]> {
        return await this.redisProvider.getKeysByTag(tag);
    }

    async addTag(tag: string, key: string): Promise<void> {
        return await this.redisProvider.addTag(tag, key);
    }

    async removeTag(tag: string): Promise<void> {
        return await this.redisProvider.removeTag(tag);
    }

    async purgeTagMembers(tag: string, keys: string[]): Promise<number> {
        return await this.redisProvider.purgeTagMembers(tag, keys);
    }

    async unlink(key: string): Promise<void> {
        await this.redisProvider.unlink(key);
    }

    async flushAllAsync(): Promise<any> {
        return this.redisProvider.flushAllAsync();
    }
}
