import React from 'react';
import {AppContext} from "../../../../../types/types";
import {WidgetHelper_renderEmptyComponent} from "../../../../../helpers/WidgetHelper";
import {StoryAuthorsWidgetConfig} from "../types";
import {Author} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";

export default function Tagline(
    {context, widgetConfig, author}:
        {
            context: AppContext,
            widgetConfig: StoryAuthorsWidgetConfig,
            author: Author
        }) {

    return (
        <div className={['Tagline'].join(' ')}>
            {author.tagline}
        </div>
    )
}

