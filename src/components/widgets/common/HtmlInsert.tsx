import React from "react";
import {AbstractWidgetConfig, WidgetParams} from "../../../types/types";
import {WidgetHelper_getWidgetCssClasses, WidgetHelper_getWidgetId} from "../../../helpers/WidgetHelper";


interface HtmlInsertParams extends WidgetParams {
    widgetConfig: HtmlInsertConfig
}
interface HtmlInsertConfig extends AbstractWidgetConfig {
    plainHtml: string
};

export function HtmlInsert({widgetConfig, context}: HtmlInsertParams) {
    return <div id={WidgetHelper_getWidgetId(widgetConfig)} suppressHydrationWarning={true} className={WidgetHelper_getWidgetCssClasses('HtmlInsert', widgetConfig, context)} dangerouslySetInnerHTML={{__html: widgetConfig.plainHtml}}/>;
}
