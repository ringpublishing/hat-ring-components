import {AbstractWidgetConfig, WidgetParams} from "../../../../types/types";
import {
    Content,
    PublicationPoint,
    Story,
    StoryEdge,
    Topic
} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";

export enum GenericListGeneralShowOptions {
    Items = "items",
    Header = "header",
    Pagination = "pagination",
    InfiniteScrollButton = "infiniteScrollButton",
    Button = "button",
}

export enum GenericListShowOptions {
    Image = "image",
    Title = "title",
    Authors = "authors",
    CreationTime = "creationTime",
    ModificationTime = "modificationTime",
    Lead = "lead",
    TitleAddons = "titleAddons",
    Taxonomies = "taxonomies",
}

export interface GenericListWidgetConfig extends AbstractWidgetConfig {
    generalShowOptions?: Array<GenericListGeneralShowOptions>,
    "showOptions": Array<GenericListShowOptions>,
    "headerText": string,
    "headerTag": string,
    "columns": number | string,
    "paginationElements": number | string,
    "perPageAllItems": number | string,
    "postShift": number | string,
    "customListUuid": string,
    "imageSize": string,
    "imageSizeMobile": string,
    "preloadImagesCount": number,
    "mobilePreloadImagesCount": number,
    "excludedFlags": Array<{
        excludedFlag: string
    }>,
    "linkLabel": string,
    "mainSeoList": boolean,
    "useOriginalImage"?: boolean,
    customTeasers?: Array<{
        'Teaser code name'?: string,
        'For mobile'?: 'on',
        // for future
        // 'For big image'?: 'on'
    }>,
    moreText?: string,
    moreUrl?: string,
}

export interface GenericListExtendableAttributes {
    generalParts?: any,
    itemParts?: any,
    render?: (cssModules) => JSX.Element | null,
    getCssModule?: (defaultStyles) => string | null,
    getDataQueryNodeFragment?: string | null,
}

export interface GenericListParams extends WidgetParams {
    widgetConfig: GenericListWidgetConfig,
    extendableAttributes?: GenericListExtendableAttributes,
}

export interface GenericListResponseNode extends Story {

}


export interface GenericListResponse {
    data: {
        stories: {
            total: number,
            edges: Array<{ node: GenericListResponseNode }>
        },
        dynamicName?: {
            name?: string,
        }
    }
}
