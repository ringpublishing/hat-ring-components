import {gql} from '@ringpublishing/graphql-api-client-got';
import {WebsitesApiClient} from '@ringpublishing/graphql-api-client-got';
import {DocumentNode} from "graphql/language/ast";
import {
    CacheHelper_set, CacheHelper_getDecoratedCachedObject, CacheHelper_isExpired, CacheHelper_normalizeTtl
} from "../helpers/CacheHelper";
import {MonitoringProvider} from "./MonitoringProvider";
import {LogHelper_error, LogHelper_info} from "../helpers/LogHelper";

if (!global.HATCacheInCallInProgress) global.HATCacheInCallInProgress = {};
let gqlResetCachesTimestamp = new Date().getTime();
const GQL_CACHE_RESET_INTERVAL_SECONDS = Number(process.env.GQL_CACHE_RESET_INTERVAL_SECONDS) || 300;
// Responses that carry GraphQL errors are cached only briefly instead of for the full TTL
const DEGRADED_RESPONSE_TTL_SECONDS = Number(process.env.CACHE_TTL_DEGRADED_RESPONSE) > 0
    ? Number(process.env.CACHE_TTL_DEGRADED_RESPONSE)
    : 60;
// Responses without any entity (e.g. {data: {story: null}}) are a stable negative result (404, not yet visible):
// cached longer than an error, but never for a 31-day TTL that would hide the entity once it appears
const NOT_FOUND_RESPONSE_TTL_SECONDS = Number(process.env.CACHE_TTL_NOT_FOUND_RESPONSE) > 0
    ? Number(process.env.CACHE_TTL_NOT_FOUND_RESPONSE)
    : 300;

export class WebsiteApiProvider {
    /**
     * @param cacheTtl        logical TTL in seconds; null = CACHE_TTL default, 0 = do not cache
     * @param additionalTags  extra cache tags for invalidation (e.g. `story_<uuid>` for a stories() query
     *                        whose variables do not carry the story id in a recognised variable name)
     */
    static async call(query: DocumentNode, variables, cacheTtl: null | number = null, additionalTags: string[] = []): Promise<any> {
        const cacheKeyString = JSON.stringify({query: query.loc?.source.body, variables});
        const queryType = this._determineQueryType(query);
        const tags = this._mergeTags(this.determineQueryTags(query, variables, queryType), additionalTags);

        try {
            const decoratedObject = await CacheHelper_getDecoratedCachedObject(cacheKeyString);
            const isExpired = CacheHelper_isExpired(decoratedObject, cacheTtl);

            if (decoratedObject.value && !isExpired) {
                MonitoringProvider.counter('info.WebsitesApiProvider.call.cachedResponse');
                return decoratedObject.value;
            }

            if (decoratedObject.value && isExpired) {
                MonitoringProvider.counter('info.WebsitesApiProvider.call.staleResponse');

                if (!global.HATCacheInCallInProgress[cacheKeyString]) {
                    MonitoringProvider.counter('info.WebsitesApiProvider.call.staleResponseRefreshing');
                    const refreshPromise = this._call(query, variables, 'no-cache', queryType)
                        .then((response) => {
                            if (response) {
                                CacheHelper_set(cacheKeyString, response, this._cacheTtlForResponse(response, cacheTtl), tags);
                            } else {
                                MonitoringProvider.counter('error.WebsitesApiProvider.call.emptyResponse');
                            }
                            return response;
                        })
                        .finally(() => {
                            delete global.HATCacheInCallInProgress[cacheKeyString];
                        });

                    global.HATCacheInCallInProgress[cacheKeyString] = refreshPromise;
                    MonitoringProvider.gauge('info.WebsitesApiProvider.call.HATCacheInCallInProgressLength', Object.keys(global.HATCacheInCallInProgress).length);
                }

                return decoratedObject.value;
            }

            if (global.HATCacheInCallInProgress[cacheKeyString]) {
                MonitoringProvider.counter('info.WebsitesApiProvider.call.staleResponseRefreshingInProgress');
                return await global.HATCacheInCallInProgress[cacheKeyString];
            }

            MonitoringProvider.counter('info.WebsitesApiProvider.call.nonCachedResponse');
            const callPromise = this._call(query, variables, 'no-cache', queryType)
                .then((response) => {
                    if (response) {
                        CacheHelper_set(cacheKeyString, response, this._cacheTtlForResponse(response, cacheTtl), tags);
                    } else {
                        MonitoringProvider.counter('error.WebsitesApiProvider.call.emptyResponse');
                    }
                    return response;
                })
                .finally(() => {
                    delete global.HATCacheInCallInProgress[cacheKeyString];
                });

            global.HATCacheInCallInProgress[cacheKeyString] = callPromise;
            return await callPromise;

        } catch (e) {
            MonitoringProvider.counter('error.WebsitesApiProvider.call.catch');
            LogHelper_error('WebsitesApiProvider.call error:', e);
            return null;
        }
    }

    static _mergeTags(determinedTags: string[], additionalTags: string[] | null | undefined): string[] {
        const merged = new Set<string>(determinedTags || []);
        for (const tag of additionalTags || []) {
            if (typeof tag === 'string' && tag.length > 0) {
                merged.add(tag);
            }
        }
        return [...merged];
    }

    /** A response is "degraded" when it carries GraphQL errors (partial data or a malformed payload). */
    static _isDegradedResponse(response: any): boolean {
        if (!response || typeof response !== 'object') {
            return true;
        }
        if (response.errors || response.error) {
            return true;
        }
        const data = response.data;
        return !data || typeof data !== 'object';
    }

    /** A response is "not found" when `data` holds no entity at all, e.g. `{data: {story: null}}`. */
    static _isNotFoundResponse(response: any): boolean {
        const data = response?.data;
        if (!data || typeof data !== 'object') {
            return false;
        }
        const values = Object.values(data);
        return values.length === 0 || values.every((value) => value === null || value === undefined);
    }

    /**
     * TTL to store a response with. Errors and empty results would otherwise be cached for the full TTL
     * (31 days on long-TTL sites) and keep a page broken, or hide an entity, until the next republish.
     * Because CacheHelper_isExpired only forces expiry when the stored TTL is LONGER than the requested one,
     * an entry stored with this shorter TTL simply expires on time and is then refreshed.
     */
    static _cacheTtlForResponse(response: any, cacheTtl: null | number): null | number {
        let shortTtl: number | null = null;
        if (this._isDegradedResponse(response)) {
            shortTtl = DEGRADED_RESPONSE_TTL_SECONDS;
            MonitoringProvider.counter('info.WebsitesApiProvider.call.degradedResponse');
        } else if (this._isNotFoundResponse(response)) {
            shortTtl = NOT_FOUND_RESPONSE_TTL_SECONDS;
            MonitoringProvider.counter('info.WebsitesApiProvider.call.notFoundResponse');
        }
        if (shortTtl === null) {
            return cacheTtl;
        }
        const requestedTtl = CacheHelper_normalizeTtl(cacheTtl);
        if (requestedTtl === 0) {
            return 0;
        }
        MonitoringProvider.counter('info.WebsitesApiProvider.call.shortTtlResponseCached');
        return requestedTtl !== null ? Math.min(requestedTtl, shortTtl) : shortTtl;
    }

    static _determineQueryType(query: DocumentNode): string {
        const queryTypeDef = {
            'story(': 'Story',
            'config(': 'Config',
            'node(': 'Node',
            'author(': 'Author',
            'stories(': 'Stories',
            'site(': 'Site',
            'section(': 'Section',
            'sectionGroup(': 'SectionGroup',
        };

        const queryBody = query.loc?.source.body || '';
        let counterType = 'Unspecified';
        for (const [queryType, counterName] of Object.entries(queryTypeDef)) {
            if (queryBody.includes(queryType)) {
                counterType = counterName;
                break;
            }
        }

        return counterType;
    }

    static determineQueryTags(query: DocumentNode, variables: any, queryType): string[] {
        let tags: any = [];
        if (variables) {
            if (queryType === 'Story') {
                const storyUuid = this._findStoryUuidInQuery(query, variables);
                if (storyUuid) {
                    tags.push(`story_${storyUuid}`);
                }
            }
            // Works only for parent-child relation (parent story -> related child stories) used by cache invalidation
            if (queryType === 'Stories') {
                const storyUuid = this._findStoryUuidInQuery(query, variables);
                if (storyUuid) {
                    tags.push(`story_${storyUuid}`);
                }
            }           
            if (queryType === 'Config' && variables.variant) {
                tags.push(`config_${variables.variant}`);
            }

            if (queryType === 'Section' || queryType === 'SectionGroup') {
                tags.push(`section_${variables.codeName}`);
            }
        }

        return tags;
    }

    static _findStoryUuidInQuery(query: DocumentNode, variables: any): string | null {
        let storyUuid = null;
        const potentialVariables = ['storyId', 'storyID', 'storyUUID', 'storyUuid', 'id', 'ID', 'uuid', 'UUID', 'Uuid'];
        if (variables) {
            for (const variable of potentialVariables) {
                if (variables[variable]) {
                    storyUuid = variables[variable];
                    break;
                }
            }
        }

        return storyUuid;
    }


    static async _call(query: DocumentNode, variables, fetchPolicy = 'no-cache', queryType: string = 'Unspecified'): Promise<any> {
        try {
            if (gqlResetCachesTimestamp < new Date().getTime()) {
                gql.resetCaches();
                gqlResetCachesTimestamp = new Date().getTime() + GQL_CACHE_RESET_INTERVAL_SECONDS * 1000;
            }
            //console.log('call', JSON.stringify(query.loc?.source.body).replace(/\s/g, ''), variables);
            // console.log('call');
            const accessKey = process.env.WEBSITE_API_PUBLIC!;
            const secretKey = process.env.WEBSITE_API_SECRET!;
            const spaceUuid = process.env.WEBSITE_API_NAMESPACE_ID!;
            const timeout = process.env.WEBSITE_API_TIMEOUT ? Number(process.env.WEBSITE_API_TIMEOUT) : 10000;

            if (!global.websitesApiGotClient) {
                global.websitesApiGotClient = new WebsitesApiClient({
                    accessKey,
                    secretKey,
                    spaceUuid,
                    timeout: timeout,
                    connectTimeout: timeout
                });
            }

            const currentTime = new Date().getTime();
            const timer = MonitoringProvider.timer(
                `info.WebsitesApiProvider.call.hitApiTimer`
            );

            MonitoringProvider.counter(`info.WebsitesApiProvider.call.apiCall_${queryType}`);

            const rawRequest = await global.websitesApiGotClient.query(query, variables);
            const response = rawRequest.body ? rawRequest.body : rawRequest;

            if (response.errors || response.error) {
                const errorMsg = response.errors?.[0]?.message || response.error?.message || 'Unknown API error';
                LogHelper_error('Websites Api _call error:', errorMsg);
                MonitoringProvider.counter('error.WebsitesApiProvider.call.apiCallError');

                if (response.data) {
                    return response;
                }
                MonitoringProvider.counter('error.WebsitesApiProvider.call.apiCallNoDataInResponse');

                return null;
            }

            if (timer) {
                timer.done();
            }
            const timeDifference = new Date().getTime() - currentTime;
            if (timeDifference > 4000) {
                LogHelper_info('Websites Api long query ', query.loc?.source.body, variables);
            }
            MonitoringProvider.gauge('info.WebsitesApiProvider.call.hitApiTime', timeDifference);
            return response;

        } catch (e) {
            LogHelper_error('Websites Api _call catch error:', e);
            MonitoringProvider.counter('error.WebsitesApiProvider.call.apiCallCatchError');
            return null;
        }
    }
}
