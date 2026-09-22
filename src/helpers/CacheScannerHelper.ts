import _ from "lodash";
import {LogHelper_error, LogHelper_info} from "./LogHelper";
import {MonitoringProvider} from "../providers/MonitoringProvider";

type ScannerStatus = 'running' | 'stopping' | 'done' | 'stopped' | null;

interface ScannerState {
    status: ScannerStatus;
    keys: string[];
    totalKeys: number;
    cursor: string;
    error: any | null;
    values: any;
    /** true when the run was cut by the wall-clock timeout, i.e. the result may be incomplete */
    timedOut: boolean;
    iterations: number;
    durationMs: number;
    keysDeleted: number;
    deleteFailed: number;
}

// Redis SCAN reports the end of a full keyspace traversal with cursor "0".
// node-redis v5 returns the cursor as a string (v4 used a number), so the comparison is done on strings only.
const SCAN_END_CURSOR = '0';

if (!global['_scanners']) {
    global['_scanners'] = new Map<string, ScannerState>();
}

export function CacheScannerHelper_getData(match: string) {
    const state = getScannerState(match);
    const dataToSend = {
        keys: [...state.keys],
        totalKeys: state.totalKeys,
        cursor: state.cursor,
        status: state.status,
        error: state.error,
        values: _.cloneDeep(state.values),
        timedOut: state.timedOut,
        iterations: state.iterations,
        durationMs: state.durationMs,
        keysDeleted: state.keysDeleted,
        deleteFailed: state.deleteFailed,
    };
    state.keys = [];
    state.values = {};
    return dataToSend;
}

function getScannerState(id: string): ScannerState {
    if (!global['_scanners'].has(id)) {
        global['_scanners'].set(id, {
            status: null,
            keys: [],
            totalKeys: 0,
            cursor: SCAN_END_CURSOR,
            error: null,
            values: {},
            timedOut: false,
            iterations: 0,
            durationMs: 0,
            keysDeleted: 0,
            deleteFailed: 0,
        });
    }
    return global['_scanners'].get(id)!;
}

export function CacheScannerHelper_removeScanner(id: string) {
    const state = global['_scanners'].get(id);
    if (state) {
        global['_scanners'].delete(id);
    }
}

export function CacheScannerHelper_stopScanning(id: string) {
    if (CacheScannerHelper_getStatus(id) !== 'stopping') {
        CacheScannerHelper_setStatus(id, 'stopping');
        CacheScannerHelper_removeScanner(id);
    }
}

export function CacheScannerHelper_getStatus(id: string): ScannerStatus {
    if (!global['_scanners'].has(id)) {
        return null;
    }
    return getScannerState(id).status;
}

export function CacheScannerHelper_setStatus(id: string, status: ScannerStatus) {
    getScannerState(id).status = status;
}

async function scanKeys(
    cacheAdapter,
    startCursor,
    match,
    count,
    timeout,
    sleep,
    processKeys:  (keys: string[])  => Promise<void>,
) {
    if (CacheScannerHelper_getStatus(match) === 'running') {
        LogHelper_info('CacheScannerHelper scan skipped, already running on this pod', match);
        MonitoringProvider.counter('info.CacheScannerHelper.scan_skipped_already_running');
        return;
    }
    CacheScannerHelper_setStatus(match, 'running');
    const state = getScannerState(match);
    state.totalKeys = 0;
    state.error = null;
    state.timedOut = false;
    state.iterations = 0;
    state.durationMs = 0;
    state.keysDeleted = 0;
    state.deleteFailed = 0;

    const startTime = Date.now();
    try {
        let cursor = String(startCursor ?? SCAN_END_CURSOR);

        do {
            if (Date.now() - startTime > timeout) {
                // The run is reported as 'done' with timedOut=true: the keyspace was NOT fully traversed.
                state.timedOut = true;
                LogHelper_error('CacheScannerHelper scan timeout, result is incomplete', {
                    match,
                    timeoutMs: timeout,
                    cursor,
                    iterations: state.iterations,
                    totalKeys: state.totalKeys,
                });
                MonitoringProvider.counter('error.CacheScannerHelper.scan_timeout');
                break;
            }
            if (['stopping', null].includes(CacheScannerHelper_getStatus(match))) {
                break;
            }

            if (cacheAdapter.scan) {
                const scan = await cacheAdapter.scan(cursor, match, count);
                cursor = String(scan.cursor);
                if (scan.keys.length > 0) {
                    await processKeys(scan.keys);
                    state.keys.push(...scan.keys);
                }

                state.totalKeys += scan.keys.length;
                state.cursor = cursor;
            } else {
                const keys = await cacheAdapter.keys();
                await processKeys(keys);
                cursor = SCAN_END_CURSOR;
                state.cursor = SCAN_END_CURSOR;
                state.totalKeys = keys.length;
                state.keys = keys;
            }
            state.iterations += 1;

            if (cursor !== SCAN_END_CURSOR) {
                await new Promise((resolve) => setTimeout(resolve, sleep));
            }
        } while (cursor !== SCAN_END_CURSOR);

    } catch (e: any) {
        LogHelper_error('CacheScannerHelper scan error:', e);
        MonitoringProvider.counter('error.CacheScannerHelper.scan_error');
        state.error = { stack: e?.stack };
    } finally {
        state.durationMs = Date.now() - startTime;
        MonitoringProvider.gauge('info.CacheScannerHelper.scan_durationMs', state.durationMs);
        MonitoringProvider.gauge('info.CacheScannerHelper.scan_iterations', state.iterations);
        const currentStatus = CacheScannerHelper_getStatus(match);
        if (currentStatus === 'running') {
            CacheScannerHelper_setStatus(match, 'done');
        } else if (currentStatus === 'stopping') {
            CacheScannerHelper_setStatus(match, 'stopped');
        }
    }
}

export async function CacheScannerHelper_getAllKeysByScan(cacheAdapter, startCursor, match, getValue, count, timeout, sleep) {
    LogHelper_info('CacheScannerHelper_getAllKeysByScan_start', match);
    await scanKeys(cacheAdapter, startCursor, match, count, timeout, sleep, async (keys: string[]) => {
        if (getValue) {
            const scannerState = global['_scanners'].get(match);
            for (const key of keys) {
                scannerState.values[key] = await cacheAdapter.getDecoratedCachedObject(key);
            }
        }
    });
    const state = getScannerState(match);
    LogHelper_info('CacheScannerHelper_getAllKeysByScan_end', {
        match,
        totalKeys: state.totalKeys,
        iterations: state.iterations,
        durationMs: state.durationMs,
        timedOut: state.timedOut,
    });
}

export async function CacheScannerHelper_clearKeysByScan(cacheAdapter, startCursor, match, count, timeout, sleep) {
    LogHelper_info('CacheScannerHelper_clearKeysByScan_start', match);

    await scanKeys(cacheAdapter, startCursor, match, count, timeout, sleep, async (keys: string[]) => {
        const state = getScannerState(match);
        const results = await Promise.allSettled(
            keys.map((key) => cacheAdapter.unlink ? cacheAdapter.unlink(key) : cacheAdapter.del(key))
        );
        let failedInBatch = 0;
        let firstFailure: {key: string; errorMessage: string} | null = null;
        for (const [index, result] of results.entries()) {
            if (result.status === 'rejected') {
                failedInBatch += 1;
                if (!firstFailure) {
                    const reason = result.reason;
                    firstFailure = {key: keys[index], errorMessage: reason instanceof Error ? reason.message : String(reason)};
                }
            } else {
                state.keysDeleted += 1;
            }
        }
        if (failedInBatch > 0) {
            // one line per batch (up to COUNT keys), not one per failed key
            state.deleteFailed += failedInBatch;
            LogHelper_error('CacheScannerHelper_clearKeysByScan.delete_failed', {
                match,
                failedInBatch,
                batchSize: keys.length,
                firstFailedKey: firstFailure?.key,
                firstErrorMessage: firstFailure?.errorMessage,
            });
        }
    });
    const state = getScannerState(match);
    MonitoringProvider.gauge('info.CacheScannerHelper.clearKeysByScan_keysDeleted', state.keysDeleted);
    if (state.deleteFailed > 0) {
        MonitoringProvider.gauge('error.CacheScannerHelper.clearKeysByScan_deleteFailed', state.deleteFailed);
    }
    LogHelper_info('CacheScannerHelper_clearKeysByScan_end', {
        match,
        keysDeleted: state.keysDeleted,
        deleteFailed: state.deleteFailed,
        totalKeys: state.totalKeys,
        iterations: state.iterations,
        durationMs: state.durationMs,
        timedOut: state.timedOut,
    });
}
