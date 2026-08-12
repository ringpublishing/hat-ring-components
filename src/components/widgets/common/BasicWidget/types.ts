import {AbstractWidgetConfig, WidgetParams} from "../../../../types/types";

export enum BasicWidgetGeneralShowOptions {
    SectionElements = "sectionElements",
    ListElements = "listElements",
    Description = "description",
    Header = "header",
    Button = "button"
}

export enum BasicWidgetShowOptions {
    Image = 'image',
    Title = 'title',
    PublicationDate = 'publicationDate',
    ModificationDate = 'modificationDate',
    Lead = 'lead',
    // Flags = 'flags',
    Authors = 'authors',
    TitleAddons = 'titleAddons',
    // AlternativeTeasers = 'alternativeTeasers',
    // OrdinalNumber = 'ordinalNumber',
    Taxonomies = 'taxonomies',
}

export enum BasicWidgetAdditionalOptions {
    "HideWhenNoSectionItems" = 'Hide when no section items',
}

export interface BasicWidgetConfig extends AbstractWidgetConfig {
    generalShowOptions?: Array<BasicWidgetGeneralShowOptions>,
    showOptions?: Array<BasicWidgetShowOptions>,
    sectionGroup?: string,
    section_name?: string,
    listElements?: [],
    count?: string,
    offset?: number,
    countBig?: number,
    columns?: string,
    labelValue?: string,
    headerSeoTag?: string,
    labelLink?: string,
    description?: string,
    moreText?: string,
    moreUrl?: string,
    bigImageSize?: string,
    bigImageSizeMobile?: string,
    standardImageSize?: string,
    standardImageSizeMobile?: string,
    listElementsImageSize?: string,
    listElementsImageSizeMobile?: string,
    preloadImagesCount?: number,
    mobilePreloadImagesCount?: number,
    titleAddonsCodeNames?: string,
    alternativeTeasersCodeNames?: string,
    classificationList?: string,
    useOriginalImage?: boolean,
    additionalOptions?: Array<BasicWidgetAdditionalOptions>
    linkLabel?: string,
    customTeasers?: Array<{
        'Teaser code name'?: string,
        'For mobile'?: 'on',
        'For big image'?: 'on'
    }>,
}

export interface BasicWidgetExtendableAttributes {
    generalParts?: any,
    itemParts?: any,
    render?: (generalComponents, defaultStyles) => JSX.Element | null,
    getCssModule?: (defaultStyles) => string | null,
    getDataQueryNodeFragment?: string | null,
}

export interface BasicWidgetParams extends WidgetParams {
    widgetConfig: BasicWidgetConfig,
    extendableAttributes?: BasicWidgetExtendableAttributes
}

export interface BasicWidgetResponseNode {
    title?: string,
    url?: string,
    lead?: string,
    creationTime?: string,
    modificationTime?: string,
    topics?: Array<string>
    titles?: Array<{
        role?: {
            code?: string
        }
        text?: string
    }>,
    originalContent?: {
        kind?: {
            code?: string,
        }
        image?: {
            url?: string,
            caption?: string
        }
        creationTime?: string,
        modificationTime?: string,
        authors?: Array<{
            author?: {
                name?: string,
                image?: {
                    url?: string
                    caption?: string
                }
            }
        }>,
        topics?: Array<{
            topic?: {
                name?: string,
                kind?: {
                    code?: string
                }
                publicationPoint?: {
                    url? : string
                }
            }
        }>,
        titles?: Array<{
            role?: {
                code?: string
            }
            text?: string
        }>,
    },
    image?: { url?: string, caption?: string, }
    leads?: Array<{
        role?: {
            code?: string
        }
        image?: {
            url?: string
        }
    }>
}

export interface ListElementsData {
    text: string,
    Text: string,
    children: [],
    Title: string,
    Description: string,
    'Image src': string,
    'Image dimensions (eg. 600x300)': string,
    'Image src mobile': string,
    'Image dimensions mobile (eg. 600x300)': string,
    'Preload image': boolean,
    'Link url': string,
    'Custom CSS Class': string
}

export interface ListElementImageData {
    url: string,
    caption: string,
    priority: boolean
    imageDim: { width: number | `${number}`; height: number | `${number}`; },
    customAlt: string,
}

export interface BasicWidgetResponse {
    "data": {
        "section"?: {
            "items"?: {
                "edges"?: Array<{ node: BasicWidgetResponseNode }>
            }
        }
        "sectionGroup"?: {
            "sections"?: Array<{
                "items"?: {
                    "edges"?: Array<{ node: BasicWidgetResponseNode }>
                }
            }>
        }
    }
}
