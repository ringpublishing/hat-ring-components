import {AbstractWidgetConfig, ComponentParams, WidgetParams} from "../../../../types/types";

export interface StoryMainImageResponse {
    "data": {
        "story": {
            "image": {
                "caption": string | null
                "crop": {
                    x: number
                },
                "image": {
                    "url": string,
                    "description": string | null
                    "width": number
                    "height": number
                }
            }
        }
    }
}

export interface  StoryMainImageWidgetConfig extends AbstractWidgetConfig {
    response?: StoryMainImageResponse,
    standardImageSize?: string,
    imageSizeMobile?: string,
    useOriginalImage?: boolean,
    cacheTTL?: number,
    imageResizeCropMode?: "cover" | "contain",
}

export interface StoryMainImageParams extends WidgetParams {
    widgetConfig: StoryMainImageWidgetConfig
}
