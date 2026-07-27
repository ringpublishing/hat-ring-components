import { AuthorEdge } from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import {AbstractWidgetConfig, ComponentParams, WidgetParams} from "../../../../types/types";

export interface StoryAuthorsResponse {
    "data": {
        "story": {
            "authors": AuthorEdge
        }
    }
}
export enum StoryAuthorsShowOptions {
    Image = 'image',
    Name = 'name',
    LinkOverlay = 'linkOverlay',
    Description = 'description',

}
export interface  StoryAuthorsWidgetConfig extends AbstractWidgetConfig {
    response?: StoryAuthorsResponse,
    standardImageSize?: string,
    imageSizeMobile?: string,
    showOptions?: Array<StoryAuthorsShowOptions>
    nameTag?: string
}

export interface StoryAuthorsParams extends WidgetParams {
    widgetConfig: StoryAuthorsWidgetConfig
}
