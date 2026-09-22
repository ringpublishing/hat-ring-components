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

/**
 * Normalizes a TTL coming from code, env or CMS (numberfield may deliver '', '300' or 300).
 * Returns null when no usable TTL was provided, otherwise a finite non-negative number (0 = do not cache).
 */
export function CacheHelper_normalizeTtl(ttl: unknown): number | null {
    if (ttl === null || ttl === undefined || ttl === '') {
        return null;
    }
    const seconds = Number(ttl);
    if (!Number.isFinite(seconds) || seconds < 0) {
        return null;
    }
    // Whole seconds everywhere (Redis EXPIRE is integral), so stored and requested TTLs compare equal
    return Math.ceil(seconds);
}

export async function CacheHelper_set(key: any, value: any, TTL: null | number | string | undefined = null, tags: string[] | null | boolean = null) {
    const requestedTtl = CacheHelper_normalizeTtl(TTL);
    if (process.env.CACHE_TTL === '0' && requestedTtl === null) {
        return;
    }

    if (requestedTtl === 0) {
        return;
    }

    const ttl = requestedTtl ?? stdTTL;
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

    // A configuration change that SHORTENED the TTL must take effect immediately, so an entry stored with a
    // longer TTL than the one requested now is treated as expired. An entry stored with a shorter TTL (e.g. a
    // degraded GraphQL response, or a widget whose TTL was raised) simply expires on its own via
    // expirationTimestamp, so it is not "changed". Compared numerically: the cached ttl may have been written
    // as a string by older versions or CMS numberfields.
    const requestedTtl = CacheHelper_normalizeTtl(currentTtl);
    if (requestedTtl !== null) {
        const storedTtl = CacheHelper_normalizeTtl(cachedTtl);
        const ttlShortened = storedTtl === null || storedTtl > requestedTtl;
        return ttlShortened;
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

    // Preferred path (Redis): DEL + SREM of the snapshotted members in one transaction, tag set is kept,
    // so concurrently written keys and parent/child relation markers are never dropped from the tag.
    // Errors are counted here and re-thrown: the caller (webhook event loop, admin endpoint) decides how to
    // degrade, and must not report a purge that did not happen as a success.
    if (cacheAdapter.clearByTag) {
        try {
            const result = await cacheAdapter.clearByTag(tag);
            deleteCount.keys = result.deleted;
            return deleteCount;
        } catch (e) {
            LogHelper_error('CacheHelper_clearByTag.failed', {
                tag,
                errorMessage: e instanceof Error ? e.message : String(e),
                errorStack: e instanceof Error ? e.stack : undefined,
            });
            MonitoringProvider.counter('error.CacheHelper_clearByTag.failed');
            throw e;
        }
    }

    // Fallback for adapters without an atomic clearByTag. Same contract as the Redis path: only the members
    // seen in the snapshot are deleted and removed from the tag, the tag set itself is never dropped (a
    // DEL of the whole set would orphan every key registered under the tag while this purge was running).
    const keys = await CacheHelper_getKeysByTag(tag);
    if (!keys) {
        return deleteCount;
    }
    const dataKeys = keys.filter((key) => typeof key === 'string' && !key.startsWith('parent_') && !key.startsWith('child_'));

    const results = await Promise.allSettled(dataKeys.map((key) => cacheAdapter.del!(key)));
    const deletedKeys: string[] = [];
    for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
            const reason = result.reason;
            LogHelper_error('CacheHelper_clearByTag.del_failed', {
                tag,
                key: dataKeys[index],
                errorMessage: reason instanceof Error ? reason.message : String(reason),
                errorStack: reason instanceof Error ? reason.stack : undefined,
            });
            MonitoringProvider.counter('error.CacheHelper_clearByTag.del_failed');
        } else {
            deleteCount.keys += result.value ?? 0;
            deletedKeys.push(dataKeys[index]);
        }
    }

    // Only members that were actually deleted leave the tag; a failed DEL stays registered for the next purge.
    if (cacheAdapter.removeKeyFromTag) {
        await Promise.allSettled(deletedKeys.map((key) => cacheAdapter.removeKeyFromTag!(tag, key)));
    }

    return deleteCount;
}

/**
 * Periodic full flush of the in-process NodeCache, which is created with deleteOnExpire:false and
 * checkperiod:0 and therefore never reclaims expired entries on its own.
 * Never runs against Redis: memory there is reclaimed by maxmemory eviction, and a FLUSHALL would wipe the cache
 * shared by every pod (blocking the Redis server while doing so).
 */
function handleCleanCache() {
    if (cacheAdapter instanceof RedisCacheAdapter) {
        return;
    }

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
                    // fire-and-forget: a Redis outage must not surface as unhandled rejections on every story render
                    const onAddTagError = () => MonitoringProvider.counter('error.CacheHelper_createParentChildRelation.addTag');
                    Promise.resolve(cacheAdapter.addTag(`story_${parentId}`, `child_${childrenId}`)).catch(onAddTagError);
                    Promise.resolve(cacheAdapter.addTag(`story_${childrenId}`, `parent_${parentId}`)).catch(onAddTagError);
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
