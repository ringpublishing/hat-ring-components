import * as ItemParts from "./itemParts";
import {gql} from "graphql-tag";
import {
    UtilsHelper_convertToInt,
    UtilsHelper_getQueryParam,
    UtilsHelper_getSearchQueryParamKey, UtilsHelper_parsePositiveIntFromString,
    UtilsHelper_stripHtmlTags
} from "../../../../helpers/UtilsHelper";
import {WebsiteApiProvider} from "../../../../providers/WebsiteApiProvider";
import {AppContext, SiteContentType} from "../../../../types/types";
import _ from "lodash";
import {
    GenericListHelper_isDeepPaginationEnabled,
    WidgetHelper_calculateOffsetForGenericListPagination
} from "../../../../helpers/GenericListHelper";

export async function GenericList_getData(context: AppContext, queryNodeFragment, widgetConfig, extendableAttributes, currentPage) {
    const searchPhrase = UtilsHelper_stripHtmlTags(UtilsHelper_getQueryParam(UtilsHelper_getSearchQueryParamKey(), context) || '');
    currentPage = UtilsHelper_parsePositiveIntFromString(currentPage) || 1;
    let dynamicVariablesTypes: any = {};
    let dynamicVariables: any = {};
    let dynamicFragmentsNames = '';

    const dynamicFragments = (widgetConfig.showOptions || []).map((showOption) => {
        const allItemParts = (extendableAttributes ? extendableAttributes.itemParts : null) || ItemParts;

        const ItemPart = allItemParts[_.upperFirst(showOption)];

        if (ItemPart) {
            let getFragment = ItemPart.getFragment;
            if (!getFragment) {
                const ItemPart = allItemParts[_.upperFirst(showOption) + '_getFragment'];
                if (ItemPart) {
                    getFragment = ItemPart;
                }
            }
            if (getFragment) {
                const fragment = getFragment(widgetConfig);
                if (fragment.variables) {
                    dynamicVariables = {...dynamicVariables, ...fragment.variables}
                }

                if (fragment.variablesTypes) {
                    dynamicVariablesTypes = {...dynamicVariablesTypes, ...fragment.variablesTypes}
                }

                if (fragment.query) {
                    dynamicFragmentsNames += ` ...${fragment.query.definitions[0].name.value} \n`;
                    return `${fragment.query.loc?.source.body}`
                }
            } else {
                console.error(`ItemPart getFragment ${showOption} not found`);
            }

        }
    }).join('\n');

    let contentFilterId = widgetConfig.customListUuid || _.get(context, 'hatControllerParams.gqlResponse.data.site.data.content.category.id') || _.get(context, 'hatControllerParams.gqlResponse.data.site.data.content.id') ||  _.get(context, 'hatControllerParams.gqlResponse.data.site.data.node.category.id');
    const nodeCategoryId = _.get(context, 'hatControllerParams.gqlResponse.data.site.data.node.category.id');

    let contentTypeFilter = '';

    // Needed before the switch: with deep pagination the Story case declares $topicId only when the header uses it.
    const queryForDynamicName = getQueryForDynamicName(context, widgetConfig);
    // DEEP_PAGINATION_ENABLED=1 also switches the stories filter to the deep-pagination shape: canonical: true, no
    // category filter on topic/author/story pages, $topicId declared only where used. Off = the historical query,
    // byte for byte, so existing cache keys stay valid.
    const isDeepPaginationQuery = GenericListHelper_isDeepPaginationEnabled();

    switch (context.siteContentType) {
        case SiteContentType.Topic:
            if (isDeepPaginationQuery) {
                contentTypeFilter = 'topic: {in: [$topicId]}, canonical: true';
                dynamicVariablesTypes.$topicId = 'UUID!';
                dynamicVariables.topicId = contentFilterId;
            } else {
                contentTypeFilter = 'topic: {in: [$topicId]}, category: {in: [$nodeCategoryId]}';
                dynamicVariablesTypes.$nodeCategoryId = 'UUID!';
                dynamicVariables.nodeCategoryId = nodeCategoryId;
            }
            break;
        case SiteContentType.Author:
            if (!widgetConfig.customListUuid) {
                contentTypeFilter = isDeepPaginationQuery
                    ? 'author:{in:[$authorId]}, canonical: true'
                    : 'category: {in: [$topicId]}, author:{in:[$authorId]}';
                dynamicVariablesTypes.$authorId = 'UUID!';
                contentFilterId = nodeCategoryId;
                dynamicVariables.authorId = context.id;
            } else if (isDeepPaginationQuery) {
                contentTypeFilter = 'category: {in: [$topicId]}, canonical: true';
                dynamicVariablesTypes.$topicId = 'UUID!';
                dynamicVariables.topicId = contentFilterId;
            } else {
                contentTypeFilter = 'category: {in: [$topicId]}';
            }
            break;
        case SiteContentType.Story:
            dynamicVariablesTypes.$storyUuid = 'UUID!';
            dynamicVariables.storyUuid = contentFilterId;
            contentFilterId = nodeCategoryId;
            if (isDeepPaginationQuery) {
                contentTypeFilter = 'id:{notIn: [$storyUuid]}, canonical: true';
                // $topicId is only needed when the dynamicName header reads the topic
                if (queryForDynamicName.includes('$topicId')) {
                    dynamicVariablesTypes.$topicId = 'UUID!';
                    dynamicVariables.topicId = contentFilterId;
                }
            } else {
                contentTypeFilter = 'category: {in: [$topicId]}, id:{notIn: [$storyUuid]}';
            }
            break;
        default:
            if (isDeepPaginationQuery) {
                contentTypeFilter = 'category: {in: [$topicId]}, canonical: true';
                dynamicVariablesTypes.$topicId = 'UUID!';
                dynamicVariables.topicId = contentFilterId;
            } else {
                contentTypeFilter = 'category: {in: [$topicId]}';
            }
            break;
    }
    const searchPhraseFragment = searchPhrase ? `, phrase: $searchPhrase` : '';

    if (searchPhrase) {
        dynamicVariablesTypes.$searchPhrase = 'String!';
    }
    let mappedDynamicVariablesTypes = Object.keys(dynamicVariablesTypes).map((key) => {
        return `, ${key}: ${dynamicVariablesTypes[key]}`;
    }).join(' ');


    const excludedFlags = widgetConfig.excludedFlags ? widgetConfig.excludedFlags.map(flag => {
        return flag.excludedFlag
    }) : null;

    const isAjaxCall = UtilsHelper_getQueryParam('gridLocationWidgetType', context) === 'genericList';
    const isFirstCall = UtilsHelper_getQueryParam('isFirstCall', context) === '1';
    const offset = WidgetHelper_calculateOffsetForGenericListPagination(widgetConfig, currentPage, isAjaxCall, isFirstCall);

    // Historical shape keeps $topicId in the operation header and `topicId` right after the spread (key order is part
    // of the cache key); the deep-pagination shape carries topicId inside dynamicVariables only where it is declared.
    const variables: any = isDeepPaginationQuery
        ? {
            ...dynamicVariables,
            limit: UtilsHelper_convertToInt(widgetConfig.paginationElements),
            offset: offset,
            excludedFlags: excludedFlags,
        }
        : {
            ...dynamicVariables,
            topicId: contentFilterId,
            limit: UtilsHelper_convertToInt(widgetConfig.paginationElements),
            offset: offset,
            excludedFlags: excludedFlags,
        };

    if (searchPhrase) {
        variables.searchPhrase = searchPhrase;
    }

    const topicIdDeclaration = isDeepPaginationQuery ? '' : '$topicId: UUID!, ';

    const query = gql`
        query(${topicIdDeclaration}$limit: Int!, $excludedFlags: [String!], $offset: Int! ${mappedDynamicVariablesTypes}){
            stories: stories(filter:{${contentTypeFilter}, flag: {notIn:$excludedFlags}},limit: $limit, offset: $offset ${searchPhraseFragment} ){
                total
                genericListReqTotal: total
                edges {
                    node {
                        kind {
                            code
                        }
                        id
                        mainPublicationPoint {
                            url
                        }
                        ${dynamicFragmentsNames}
                        ${queryNodeFragment}
                    }
                }
            }
            ${queryForDynamicName}
        }
        ${dynamicFragments}
    `;

    //console.log(query.loc?.source.body, JSON.stringify(variables));
    const result = await WebsiteApiProvider.call(query, variables, widgetConfig?.cacheTTL);
    return result;
}

function getQueryForDynamicName(context, widgetConfig) {
    const isDynamicNameInHeader = (widgetConfig.generalShowOptions || []).includes("header") && widgetConfig.headerText?.includes('{{dynamicName}}');

    if (isDynamicNameInHeader) {
        switch (context.siteContentType) {
            case SiteContentType.SiteNode:
            case SiteContentType.Story:
            case SiteContentType.Topic:
                return `
                        dynamicName: topic(id: $topicId) {
                            name
                        }
                    `;
            case SiteContentType.Author:
                return `
                        dynamicName: author(id: $authorId) {
                            name
                        }
                    `
            default:
                return "";
        }
    }
    return "";
}
