import {APIContext} from "astro";
import {MonitoringProvider} from "../providers/MonitoringProvider";
import { UtilsHelper_generateRandomString, UtilsHelper_getCurrentUrl} from "./UtilsHelper";
import {CacheHelper_clearByTag, CacheHelper_getKeysByTag, CacheHelper_getCacheAdapter} from "./CacheHelper";
import {LogHelper_error, LogHelper_debug} from "./LogHelper";

enum NotificationType {
    variantConfigurationChanged = "variantConfigurationChanged",
}

interface NotificationWebsiteApi {
    notificationType: string;
    namespaceId: string;
    variantName?: string;
    variantVersion?: string;
    portalStructureUuid?: string;
    user: string;
    modifiedSections?: string[];
};

interface HatDone {
    hatDone?: boolean;
}

interface NotificationContentApi {
    events: Event[];
}

interface PublicationPoint {
    id: string;
    websiteId: string;
    url: string;
    canonical: boolean;
}

interface Websites {
    [key: string]: {
        status: string;
        message: string | null;
        type: string;
    };
}

interface EventData {
    userId: string;
    objectType: string;
    revision: number;
    status: string;
    objectId: string;
    namespaceId: string;
    message: string;
    type: string;
    publicationId: string;
    firstPublicationDate: string;
    canonicalWebsiteId: string;
    publicationPoints: PublicationPoint[];
    websites: Websites;
}

interface Event {
    clientId: string;
    sourceId: string;
    topicName: string;
    topicVersion: string;
    hookId: string;
    eventTime: string;
    eventId: string;
    eventData: EventData;
}

const podName = process.env.HOSTNAME;
const userAgent = 'RingPublishing HatBot';

export async function WebhookHelper_POST(context: APIContext) {
    // Processing is intentionally fire-and-forget (the CMS only needs the 200); never let it become an unhandled rejection
    handleNotification(context).catch((e) => {
        LogHelper_error('WebhookHelper: unhandled error in handleNotification', e);
        MonitoringProvider.counter('error.WebhookHelper.handleNotification');
    });
    MonitoringProvider.counter(`info.WebhookHelper.response_send_200`);
    return new Response('ok ' + podName, {});
}

async function handleNotification(context: APIContext) {
    // Build thisUrl from forwarded headers (reverse proxy) or fallback to context.url
    const thisUrl = UtilsHelper_getCurrentUrl(context);
    // console.info(`WebhookHelper: received notification at ${thisUrl} with href:`, context.url.href);
    const origin = new URL(thisUrl).origin;

    const timer0 = MonitoringProvider.timer(`info.WebhookHelper.requestJson`);
    let req: any = null;
    try {
        req = await context.request.json() as NotificationWebsiteApi & NotificationContentApi & HatDone;
    } catch (e) {
        MonitoringProvider.counter(`info.WebhookHelper.response_send_500`);
        LogHelper_error('WebhookHelper: error parsing request', e);
        LogHelper_debug('WebhookHelper: request body:', context.request.body);
    }
    if (timer0) {
        timer0.done();
    }
    if (!req) {
        return;
    }

    if (req.notificationType === NotificationType.variantConfigurationChanged && req.variantName) {
        const timer = MonitoringProvider.timer(`info.WebhookHelper.variantConfigurationChanged_CacheHelper_clearByTag`);
        try {
            const cacheCleaner = await CacheHelper_clearByTag('config_' + req.variantName);
            MonitoringProvider.gauge('info.WebhookHelper.variantConfigurationChanged', cacheCleaner.keys);
        } catch (e) {
            LogHelper_error('WebhookHelper: error variantConfigurationChanged', e);
            MonitoringProvider.counter('error.WebhookHelper.variantConfigurationChanged');
        } finally {
            if (timer) {
                timer.done();
            }
        }

        // Repeats are scheduled even after a failed purge, so a transient Redis problem is retried at +70 s / +305 s
        if (!req.hatDone) {
            scheduleRepeats(req, thisUrl, origin);
        }
    }


    if (req.events) {
        const sourceId = req.events[0]?.sourceId;
        if (sourceId === 'RING::ContentAPI') {
            try {
                const resourceIds = req.events.map((event) => {
                    return {
                        resourceId: event.eventData.objectId,
                        publicationPoints: event.eventData.publicationPoints,
                        objectType: event.eventData.objectType,
                        isNew: !event.eventData.firstPublicationDate
                    }
                });

                let processedAnyEvent = false;
                for (const {resourceId, publicationPoints, objectType, isNew} of resourceIds) {
                    if (isNew) {
                        continue;
                    }
                    processedAnyEvent = true;
                    try {
                        await handleContentApiEvent(resourceId, publicationPoints || [], objectType);
                    } catch (e) {
                        // One failing event must not abort the purge of the remaining events in this delivery
                        LogHelper_error('WebhookHelper: error processing RING::ContentAPI event', {
                            resourceId,
                            objectType,
                            errorMessage: e instanceof Error ? e.message : String(e),
                        });
                        MonitoringProvider.counter('error.WebhookHelper.contentApiEvent');
                    }
                }

                // Scheduled once per delivery, after every event was attempted, so a failing event cannot skip the repeats
                if (processedAnyEvent && !req.hatDone) {
                    scheduleRepeats(req, thisUrl, origin);
                }

            } catch (e) {
                LogHelper_error('WebhookHelper: error RING::ContentAPI', e);
            }
        }
    }
    MonitoringProvider.counter(`info.WebhookHelper.${req.hatDone ? 'request_for_repeat_end' : 'request_normal_end'}`);
}

/**
 * Purges everything cached for one Content API event: lists of parent stories that embed this story,
 * the story's own tag, and the page-level (pubId_) entries of each publication point, then warms the pages up.
 */
async function handleContentApiEvent(resourceId: string, publicationPoints: PublicationPoint[], objectType: string) {
    const deleteCount = {
        keys: 0,
        responses: 0,
    }

    if (objectType === 'Story') {
        const timer = MonitoringProvider.timer(`info.WebhookHelper.contentApiStory_clearStoryParentsByTag`);
        const cacheParentCleaner = await clearStoryParentsByTag('story_' + resourceId);
        deleteCount.keys += cacheParentCleaner.keys;
        if (timer) {
            timer.done();
        }
    }

    const timer = MonitoringProvider.timer(`info.WebhookHelper.contentApiStory_CacheHelper_clearByTag`);
    const cacheCleaner = await CacheHelper_clearByTag('story_' + resourceId);
    deleteCount.keys += cacheCleaner.keys;

    if (timer) {
        timer.done();
    }

    MonitoringProvider.gauge('info.WebhookHelper.publicationPoints', publicationPoints.length);
    for (const publicationPoint of publicationPoints) {
        if (!publicationPoint?.url) {
            continue;
        }
        const arrUrl = publicationPoint.url.split('/');
        const pubId = arrUrl[arrUrl.length - 1];
        const timer2 = MonitoringProvider.timer(`info.WebhookHelper.contentApiStory_pubPoint_CacheHelper_clearByTag`);

        const pubPointsCacheCleaner = await CacheHelper_clearByTag('pubId_' + `${pubId}`);
        if (timer2) {
            timer2.done();
        }
        deleteCount.keys += pubPointsCacheCleaner.keys;

        const url = `${publicationPoint.url}?antyCache=${UtilsHelper_generateRandomString()}`;
        fetchWithStatusCheck(url, {method: 'HEAD', headers: {'User-Agent': userAgent}}, {
            label: 'warm-up HEAD',
            errorCounter: 'info.WebhookHelper.contentApiStory_pubPoint_CacheHelper_clearByTag_fetch_error',
            retryErrorCounter: 'info.WebhookHelper.contentApiStory_pubPoint_CacheHelper_clearByTag_fetch_error_catch',
            httpErrorCounter: 'error.WebhookHelper.warmUp_http_error',
        });
    }
    MonitoringProvider.gauge('info.WebhookHelper.contentApiStory', deleteCount.keys);
}

/** Re-POSTs the same notification to this site after 70 s and 305 s (marked hatDone so it is not repeated again). */
function scheduleRepeats(req: HatDone, thisUrl: string, origin: string) {
    req.hatDone = true;
    const stringifiedReq = JSON.stringify(req);
    req.hatDone = false;
    setTimeout(async () => {
        repeatRequest(stringifiedReq, thisUrl, origin);
    }, 1000 * 70);
    setTimeout(async () => {
        repeatRequest(stringifiedReq, thisUrl, origin);
    }, 1000 * 305);
}

/**
 * Fire-and-forget fetch that reports non-2xx responses (previously invisible) and retries once after 70 s
 * on a network error. With redirect:'manual' a redirect surfaces as status 0 / type 'opaqueredirect'.
 */
function fetchWithStatusCheck(
    url: string,
    options: RequestInit,
    counters: {label: string; errorCounter: string; retryErrorCounter: string; httpErrorCounter: string},
    isRetry: boolean = false,
): void {
    fetch(url, options)
        .then((res) => {
            if (!res.ok) {
                LogHelper_error(`WebhookHelper: ${counters.label} got a non-2xx response`, {
                    url,
                    status: res.status,
                    type: res.type,
                    isRetry,
                });
                MonitoringProvider.counter(counters.httpErrorCounter);
            }
        })
        .catch((err) => {
            LogHelper_error(`WebhookHelper: ${counters.label} fetch error${isRetry ? ' (retry)' : ''}`, err);
            MonitoringProvider.counter(isRetry ? counters.retryErrorCounter : counters.errorCounter);
            if (!isRetry) {
                setTimeout(() => {
                    fetchWithStatusCheck(url, options, counters, true);
                }, 1000 * 70);
            }
        });
}

async function repeatRequest(req: string, thisUrl: string, origin: string) {
    if (thisUrl) {
        try {
            const options: RequestInit = {
                method: "POST",
                body: req,
                redirect: "manual",
                headers: {
                    'Content-Type': 'application/json',
                    origin: origin,
                    'User-Agent': userAgent,
                }
            }
            fetchWithStatusCheck(thisUrl, options, {
                label: 'repeatRequest',
                errorCounter: 'info.WebhookHelper.repeatRequest_fetch_error',
                retryErrorCounter: 'info.WebhookHelper.repeatRequest_fetch_error_catch',
                httpErrorCounter: 'error.WebhookHelper.repeatRequest_http_error',
            });
        } catch (e) {
            LogHelper_error('WebhookHelper: error repeatRequest', e);
            MonitoringProvider.counter(`info.WebhookHelper.repeatRequest_error`);
        }
        MonitoringProvider.counter('info.WebhookHelper.repeat_done');
    }
}

const PARENT_MARKER_PREFIX = 'parent_';

/**
 * Invalidates the parent stories that embed the given story (related-content / similar-stories lists).
 * Parents are recorded as `parent_<uuid>` members of the story's tag set by CacheHelper_createParentChildRelation.
 * A marker is removed once its parent was purged: the parent re-registers itself on its next render, so the
 * relation stays bounded to parents that actually rendered since the last republish.
 */
async function clearStoryParentsByTag(tag: string) {
    const keys = await CacheHelper_getKeysByTag(tag);

    const deleteCount = {
        keys: 0,
        responses: 0
    }
    if (keys) {
        const cacheAdapter = CacheHelper_getCacheAdapter();
        for (const key of keys) {
            if (typeof key === 'string' && key.startsWith(PARENT_MARKER_PREFIX)) {
                const parentId = key.slice(PARENT_MARKER_PREFIX.length).replaceAll('"', '');
                if (!parentId) {
                    continue;
                }
                try {
                    const res = await CacheHelper_clearByTag('story_' + parentId);
                    deleteCount.keys += res.keys;
                    if (cacheAdapter.removeKeyFromTag) {
                        await cacheAdapter.removeKeyFromTag(tag, key);
                    }
                } catch (e) {
                    LogHelper_error('WebhookHelper: clearStoryParentsByTag error parent', e);
                }
            }
        }
    }

    return deleteCount;
}
