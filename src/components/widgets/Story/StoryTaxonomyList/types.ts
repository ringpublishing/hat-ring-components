import {AbstractWidgetConfig, AppContext, ComponentParams, WidgetParams} from "../../../../types/types";
import {Topic} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";

export interface StoryTaxonomyListWidgetConfig extends AbstractWidgetConfig {
    taxonomyKind: string,
    listPrefix: string,
    links: boolean,
    excludedUuids: string,
    cacheTTL?: number,
}

export interface StoryTaxonomyListParams extends WidgetParams {
    widgetConfig: StoryTaxonomyListWidgetConfig
}

export interface StoryTaxonomyListTopicResponse {
    "__typename": string,
    "topic": Topic
}

export interface StoryTaxonomyListResponse {
    "data": {
        "story": {
            "__typename": string,
            "topics": StoryTaxonomyListTopicResponse[],
        }
    }
}


