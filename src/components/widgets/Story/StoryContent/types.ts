import {AbstractWidgetConfig, AppContext, ComponentParams, WidgetParams} from "../../../../types/types";

export interface StoryContentWidgetConfig extends AbstractWidgetConfig {
    standardImageWidth?: string | number,
    standardImageHeight?: string | number,
    mobileImageWidth?: string | number,
    mobileImageHeight?: string | number,
    displayFrom?: string | number,
    displayTo?: string | number,
    ignoredFrameBlocksNames?: string,
    additionalComponents?: string
}

export interface StoryContentExtendableAttributes {
    customGroupBlocks?: any,
    render?: (defaultStyles) => JSX.Element | null,
    getCssModule?: (defaultStyles) => string | null,
    getDataQueryStoryFragment?: string | null,
    contentTextTransformers?: Array<(
        params: {
            context: AppContext,
            text: string,
            blockData?: any,
            blockType?: string,
        }
    ) => Promise<string> | string>,
}

export interface StoryContentParams extends WidgetParams {
    widgetConfig: StoryContentWidgetConfig,
    extendableAttributes?: StoryContentExtendableAttributes,
}

export interface StoryContentSwitcherParams {
    content: any[];
    context: AppContext;
    widgetConfig: StoryContentWidgetConfig,
    extendableAttributes?: StoryContentExtendableAttributes,
}


export interface ImageBlockParams {
    blockData: {
        type: string;
        title: string;
        url: string;
        alt: string;
        link: {
            url: string;
        }
        alignment: string,
        image: {
            description: string;
            title: string;
            width: number;
            height: number;
            sources: [
                {
                    source: {
                        name: string;
                        link?: {
                            url: string
                        }
                    }
                }
            ],
            license: {
                note: string;
            }
        }
    }
    widgetConfig: StoryContentWidgetConfig,
    context: AppContext
    extendableAttributes?: StoryContentExtendableAttributes,
}
