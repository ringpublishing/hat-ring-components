import {UtilsHelper_convertToInt} from "./UtilsHelper";

import {RedisCacheAdapter} from "../adapters/cache/RedisCacheAdapter";
import {CacheAdapterInterface} from "../adapters/cache/types";
import {NodeCacheAdapter} from "../adapters/cache/NodeCacheAdapter";
import {MonitoringProvider} from "../providers/MonitoringProvider";
import {LogHelper_error} from "./LogHelper";

const stdTTL = process.env.CACHE_TTL ? UtilsHelper_convertToInt(process.env.CACHE_TTL) : 60;

let cacheAdapter: CacheAdapterInterface = new NodeCacheAdapter();
if (process.env.USE_REDIS == '1') {
    cacheAdapter = new RedisCacheAdapter();
}

export function CacheHelper_getCacheAdapter() {
    return cacheAdapter;
}

export async function CacheHelper_set(key: any, value: any, TTL: null | number | undefined = null, tags: string[] | null | boolean = null) {
    if (process.env.CACHE_TTL === '0' && !TTL) {
        return;
    }

    if (TTL === 0) {
        return;
    }

    const ttl = TTL || stdTTL;
    if (typeof key !== 'string') {
        key = JSON.stringify(key);
    }
    await cacheAdapter.set(key, value, ttl, tags);
}

export async function CacheHelper_get(key: any, removeOnExpire = false) {
    if (typeof key !== 'string') {
        key = JSON.stringify(key);
    }
    const value = await cacheAdapter.get(key);
    if (removeOnExpire) {
        const expirationTimestamp = await cacheAdapter.getExpirationTimestamp(key);
        if (!expirationTimestamp) {
            return value;
        }

        const expired = expirationTimestamp ? expirationTimestamp - new Date().getTime() < 0 : true;
        if (expired) {
            await cacheAdapter.del(key);
        }
    }
    handleCleanCache();
    return value;
}

export async function CacheHelper_getDecoratedCachedObject(key: any): Promise<{ttl: number | undefined, value: any, expirationTimestamp: number | undefined}> {
    if (typeof key !== 'string') {
        key = JSON.stringify(key);
    }
    const value = await cacheAdapter.getDecoratedCachedObject(key);
    return value;
}

export function CacheHelper_isExpired(
    rawCachedObject: { ttl: number | undefined, value: any, expirationTimestamp: number | undefined },
    currentTtl?: number | null
): boolean {
    const { expirationTimestamp, ttl: cachedTtl } = rawCachedObject;

    if (!expirationTimestamp) {
        return true;
    }

    const timeExpired = expirationTimestamp - new Date().getTime() < 0;
    if (timeExpired) {
        return true;
    }

    if (currentTtl !== undefined && currentTtl !== null) {
        const ttlChanged = cachedTtl === null || cachedTtl === undefined || currentTtl !== cachedTtl;
        return ttlChanged;
    }

    return false;
}

export async function CacheHelper_flush() {
    return await cacheAdapter.flushAll();
}

export async function CacheHelper_getTtl(key: any) {
    return await cacheAdapter.getTtl(key);
}

export async function CacheHelper_getExpirationTimestamp(key: any) {
    return await cacheAdapter.getExpirationTimestamp(key);
}

export function CacheHelper_del(keys: any) {
    return cacheAdapter.del(keys);
}

export function CacheHelper_keys() {
    return cacheAdapter.keys();
}

export async function CacheHelper_getKeysByTag(tag: string) {
    if(!cacheAdapter.getKeysByTag) {
        LogHelper_error('CacheAdapter does not support getKeysByTag');
        return false;
    }
    return await cacheAdapter.getKeysByTag(tag);
}


export async function CacheHelper_clearByTag(tag: string): Promise<{ keys: number, responses: number } > {
    const deleteCount = {
        keys: 0,
        responses: 0,
    }

    if (!cacheAdapter.purgeTagMembers) {
        LogHelper_error('CacheAdapter does not support purgeTagMembers');
        return deleteCount;
    }

    // Not routed through CacheHelper_getKeysByTag: its lazy-cleanup SREM for dead
    // members is fire-and-forget, so purgeTagMembers takes its own raw snapshot instead.
    try {
        deleteCount.keys = await cacheAdapter.purgeTagMembers(tag);
    } catch (e) {
        LogHelper_error('CacheHelper_clearByTag.failed', {
            tag,
            errorMessage: e instanceof Error ? e.message : String(e),
            errorStack: e instanceof Error ? e.stack : undefined,
        });
        MonitoringProvider.counter('error.CacheHelper_clearByTag.failed');
    }

    return deleteCount;
}

function handleCleanCache() {
    const currentTime = new Date().getTime();
    if (!global.lastHATCacheClean) {
        global.lastHATCacheClean = currentTime;
    }

    const TTL = process.env.CACHE_CLEAN_INTERVAL ? UtilsHelper_convertToInt(process.env.CACHE_CLEAN_INTERVAL) : 60;
    if (currentTime - global.lastHATCacheClean > (TTL * 1000)) {
        MonitoringProvider.counter('info.CacheHelper_handleCleanCache.CacheHelper_flush');
        CacheHelper_flush();
        global.lastHATCacheClean = currentTime;
        global.HATCacheInCallInProgress = {};
    }
}

export function CacheHelper_createParentChildRelation(parentId, childrenIds) {
    const getingKeysMode = process.env.GET_KEYS_MODE || 'tags'; //keys
    switch (getingKeysMode) {
        case 'tags':
            childrenIds.forEach((childrenId) => {
                if (childrenId && cacheAdapter.addTag) {
                    cacheAdapter.addTag(`story_${parentId}`, `child_${childrenId}`);
                    cacheAdapter.addTag(`story_${childrenId}`, `parent_${parentId}`);
                } else if(childrenId) {
                    CacheHelper_set(`parent_${parentId}_child_${childrenId}`, '');
                }
            })
            break;
        case 'keys':
            childrenIds.forEach((childrenId) => {
                if (childrenId) {
                    CacheHelper_set(`parent_${parentId}_child_${childrenId}`, '');
                }
            })
            break;
    }
}
