import React, {ComponentState} from "react";
import {UrlWithParsedQuery} from "url";

export enum SiteContentType {
    Search = "Search",
    Homepage = "Homepage",
    SiteNode = "SiteNode",
    Story = "Story",
    Author = "Author",
    CustomAction = "CustomAction",
    Source = "Source",
    Topic = "Topic",
    Error404 = "Error404",
}

export interface AppContext {
    siteContentType: SiteContentType | undefined | null,
    id: string | undefined | null,
    siteNodeId: string | undefined | null,
    url: string,
    customData: any,
    hatControllerParams: HatControllerParams,
    cssModules?: any,
    websiteManagerVariant: string
    domain: string
}

export interface HatControllerParams {
    gqlResponse: any;
    customData: any;
    urlWithParsedQuery: UrlWithParsedQuery
    isMobile: boolean
    websiteManagerVariant: string
    domain: string
    ringDataLayer: any
}

export interface ComponentParams {
    context: AppContext,
    config: any
}


export interface AbstractWidget extends React.ComponentClass<WidgetParams> {

}

export interface WidgetParams {
    context: AppContext,
    readonly widgetConfig: Readonly<AbstractWidgetConfig>,
}


export interface AbstractWidgetConfig {
    readonly module?: string,
    readonly widgetType?: string,
    readonly platformDesktop?: boolean,
    readonly platformMobile?: boolean,
    readonly customClass?: string,
    readonly customPosition?: 'none' | 'left' | 'center' | 'right',
    readonly customWidth?: 'none' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
}

export interface AbstractAdditionalComponent {
    AdditionalComponent?: Function;
    config?: {
        widgetType?: string;
    };
    customCssClass?: string;
}
