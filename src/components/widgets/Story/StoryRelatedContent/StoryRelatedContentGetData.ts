import * as ItemParts from "../../Lists/GenericList/itemParts";
import {gql} from "graphql-tag";
import {WebsiteApiProvider} from "../../../../providers/WebsiteApiProvider";
import {AppContext} from "../../../../types/types";
import _ from "lodash";
import {StoryRelatedContentAutocompleteFromEnum, StoryRelatedContentWidgetConfig} from "./types";
import {GenericListResponse} from "../../Lists/GenericList/types";
import {Story, StoryEdge} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import {UtilsHelper_convertToInt, UtilsHelper_getCurrentNodeCategoryId} from "../../../../helpers/UtilsHelper";
import {ConfigHelper_getMainCategoryUuid} from "../../../../helpers/ConfigHelper";
import {CacheHelper_createParentChildRelation} from "../../../../helpers/CacheHelper";

export async function StoryRelatedContent_getData(context: AppContext, widgetConfig: StoryRelatedContentWidgetConfig): Promise<GenericListResponse> {
    if (!context.id) {
        console.warn('StoryRelatedContent_getData: siteNodeId is not defined for url:', context.url);
        return {data: {stories: {edges: [], total: 0}}};
    }

    let dynamicVariablesTypes: any = {};
    let dynamicVariables: any = {};
    let dynamicFragmentsNames = '';


    const dynamicFragments = (widgetConfig.showOptions || []).map((showOption) => {
        const allItemParts = ItemParts;

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


    let mappedDynamicVariablesTypes = Object.keys(dynamicVariablesTypes).map((key) => {
        return `, ${key}: ${dynamicVariablesTypes[key]}`;
    }).join(' ');


    const query = gql`
        query($storyId: UUID, $relatedContentRole: String! ${mappedDynamicVariablesTypes}){
            story(id:$storyId){
                topics{
                    topic {
                        kind {
                            code
                        }
                        id
                    }
                }
                stories(role: $relatedContentRole){
                    story {
                        id
                        mainPublicationPoint {
                            url
                        }
                        ${dynamicFragmentsNames}
                    }

                }
            }
        }
        ${dynamicFragments}
    `;

    const variables = {
        storyId: context.id,
        relatedContentRole: widgetConfig.relatedContentCodeName,
        ...dynamicVariables,
    };

    let res: GenericListResponse = {data: {stories: {edges: [], total: widgetConfig.paginationElements || 0}}};

    const result = await WebsiteApiProvider.call(query, variables, widgetConfig?.cacheTTL);

    res.data.stories.edges = res.data.stories.edges.concat(_.get(result, 'data.story.stories', []).map(story => {
        return {node: story.story}
    }));    
    CacheHelper_createParentChildRelation(context.id, res.data.stories.edges.map((edge) => edge?.node?.id));

    if (widgetConfig.autocomplete && (widgetConfig.paginationElements || 0) > res.data.stories.edges.length) {
        switch (widgetConfig.autocompleteFrom) {
            case StoryRelatedContentAutocompleteFromEnum.FirstStoryTag:
                const storiesNodes = await autocompleteByFirstStoryTag(context, widgetConfig, result, dynamicVariables, dynamicFragments, dynamicFragmentsNames, dynamicVariablesTypes);
                res.data.stories.edges = res.data.stories.edges.concat(storiesNodes);
                break;
        }
    }


    res.data.stories.edges = res.data.stories.edges.slice(0, widgetConfig.paginationElements);

    return res;
}

async function autocompleteByFirstStoryTag(context: AppContext, widgetConfig: StoryRelatedContentWidgetConfig, result, dynamicVariables, dynamicFragments, dynamicFragmentsNames, dynamicVariablesTypes): Promise<StoryEdge[]> {

    const tags = _.get(result, 'data.story.topics', []).filter(topic => {
        const topicCodeName = _.get(topic, 'topic.kind.code', null);
        return topicCodeName === 'tag';
    });

    if (tags.length == 0) {
        return [];
    }
    const firstTagUuid = tags[0].topic?.id;

    if (!firstTagUuid) {
        return [];
    }

    const excludedFlags = widgetConfig.excludedFlags ? widgetConfig.excludedFlags.map(flag => {
        return flag.excludedFlag
    }) : null;

    const mainCategoryUuid = await ConfigHelper_getMainCategoryUuid(context);
    if (!mainCategoryUuid) {
        console.warn('no main category uuid configured in developers settings in Website Manager');
        return [];
    }

    const contentTypeFilter = 'topic: {in: [$topicId]}, category: {in: [$nodeCategoryId]}';
    dynamicVariablesTypes.$nodeCategoryId = 'UUID!';
    dynamicVariables.nodeCategoryId = mainCategoryUuid;

    let mappedDynamicVariablesTypes = Object.keys(dynamicVariablesTypes).map((key) => {
        return `, ${key}: ${dynamicVariablesTypes[key]}`;
    }).join(' ');
    const excludedIds = _.get(result, 'data.story.stories', []).map((story) => story?.story?.id);
    const variables: any = {
        ...dynamicVariables,
        topicId: firstTagUuid,
        limit: UtilsHelper_convertToInt(widgetConfig.paginationElements || 0),
        excludedFlags: excludedFlags,
        excludedIds: [context.id, ...excludedIds],
    };

    const query = gql`
        query($topicId: UUID!, $limit: Int!, $excludedFlags: [String!], $excludedIds: [UUID!], ${mappedDynamicVariablesTypes}){
            stories(filter:{${contentTypeFilter}, flag: {notIn:$excludedFlags}, id:{notIn:$excludedIds}} ,limit: $limit ){
                total
                edges {
                    node {
                        mainPublicationPoint {
                            url
                        }
                        ${dynamicFragmentsNames}
                    }
                }
            }
        }
        ${dynamicFragments}
    `;
    //console.log(query.loc?.source.body, JSON.stringify(variables));
    const response = await WebsiteApiProvider.call(query, variables);
    const res = _.get(response, 'data.stories.edges', []);

    return res;
}
