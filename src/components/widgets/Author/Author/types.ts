import {Author, AuthorEdge} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import {StoryAuthorsParams, StoryAuthorsWidgetConfig} from "../../Story/StoryAuthors/types";
import {WidgetParams} from "../../../../types/types";

export interface AuthorResponse {
    "data": {
        "author": Author
    }
}

export interface AuthorWidgetConfig extends Omit<StoryAuthorsWidgetConfig, 'response'>   {
    response: AuthorResponse,
}

export interface AuthorParams extends WidgetParams {
    widgetConfig: AuthorWidgetConfig
}
