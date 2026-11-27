import {AbstractWidgetConfig, WidgetParams} from "../../../../types/types";

export interface GooglePreferredSourceWidgetConfig extends AbstractWidgetConfig {
    readonly text?: string,
    readonly domain?: string,
    readonly displayType?: 'link' | 'button',
}

export interface GooglePreferredSourceParams extends WidgetParams {
    widgetConfig: GooglePreferredSourceWidgetConfig
}
