
export interface CacheAdapterInterface {
    set(key: any, value: any, TTL: null | number | undefined, tags?: string[] | null | boolean): Promise<void>;
    get(key: any): Promise<any>;
    getDecoratedCachedObject(key: any): Promise<{ttl: number | undefined, value: any, expirationTimestamp: number | undefined}>;
    del(key: any): Promise<number>;
    unlink?(key: string): Promise<void>;
    getTtl(key: any): Promise<number|undefined>;
    getExpirationTimestamp(key: any): Promise<number|undefined>;
    flushAll(): Promise<any>;
    keys(): Promise<string[]>;
    keysByGlob?(globKey: string): Promise<string[]>;
    /** SCAN cursor is a string ('0' = end of iteration); numbers are accepted for backwards compatibility. */
    scan?(cursor: number | string, match: string, count?: number): Promise<{keys: string[], cursor: string}>;
    mget(keys: string[]): Promise<{ [p: string]: unknown }>;
    getKeysByTag?(tag: string): Promise<string[]>;
    /** Deletes all data keys registered under the tag atomically per batch, keeps the tag set itself. */
    clearByTag?(tag: string): Promise<{deleted: number, members: number}>;
    removeTag?(tag: string): Promise<void>;
    /** Removes a single member (data key or relation marker) from a tag set. */
    removeKeyFromTag?(tag: string, key: string): Promise<void>;
    addTag?(tag: string, key:string): Promise<void>;
}
