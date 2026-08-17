import {gql} from '@ringpublishing/graphql-api-client-got';
import {WebsitesApiClient} from '@ringpublishing/graphql-api-client-got';
import {DocumentNode} from "graphql/language/ast";
import {
    CacheHelper_set, CacheHelper_getDecoratedCachedObject, CacheHelper_isExpired
} from "../helpers/CacheHelper";
import {MonitoringProvider} from "./MonitoringProvider";
import {LogHelper_error, LogHelper_info} from "../helpers/LogHelper";

if (!global.HATCacheInCallInProgress) global.HATCacheInCallInProgress = {};
let gqlResetCachesTimestamp = new Date().getTime();
const GQL_CACHE_RESET_INTERVAL_SECONDS = Number(process.env.GQL_CACHE_RESET_INTERVAL_SECONDS) || 300;

export class WebsiteApiProvider {
    static async call(query: DocumentNode, variables, cacheTtl: null | number = null): Promise<any> {
        const cacheKeyString = JSON.stringify({query: query.loc?.source.body, variables});
        const queryType = this._determineQueryType(query);
        const tags = this.determineQueryTags(query, variables, queryType);

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
                                CacheHelper_set(cacheKeyString, response, cacheTtl, tags);
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
                        CacheHelper_set(cacheKeyString, response, cacheTtl, tags);
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
