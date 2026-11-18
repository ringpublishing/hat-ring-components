import React from "react";
import {AbstractWidgetConfig, AppContext} from "../types/types";
import {UtilsHelper_getQueryParam, UtilsHelper_isDevelopmentMode, UtilsHelper_isMobile} from "./UtilsHelper";
import {gql} from "graphql-tag";
import {WebsiteApiProvider} from "../providers/WebsiteApiProvider";
import _ from "lodash";
import {ConfigHelper_getDeveloperSettingsConfig} from "./ConfigHelper";
import {BasicWidgetConfig} from "../components/widgets/common/BasicWidget/types";
import {GenericListWidgetConfig} from "../components/widgets/Lists/GenericList/types";

export function WidgetHelper_shouldHideWidget(widgetConfig, context) {
    const isMobile = UtilsHelper_isMobile(context);
    const gridLocationParam = UtilsHelper_getQueryParam('gridLocation', context);
    if (gridLocationParam !== null && gridLocationParam !== widgetConfig.gridLocation) {
        return true;
    }

    if (typeof isMobile === 'boolean'
        && typeof widgetConfig.platformDesktop === 'boolean'
        && typeof widgetConfig.platformMobile === 'boolean'
    ) {
        return !(
            (isMobile && widgetConfig.platformMobile)
            || (!isMobile && widgetConfig.platformDesktop)
        );
    }
    return false;
}

export function WidgetHelper_renderEmptyWidget(widgetConfig, text = '') {
    return (WidgetHelper_renderEmptyComponent(_.upperFirst(widgetConfig.widgetType), text));
}

export function WidgetHelper_renderEmptyComponent(componentClassName: any, text: string = '', isReact: boolean = false) {
    const str = `<div class="${componentClassName}" style="display: none">${text}</div>`;
    return isReact ? <div className={componentClassName} style={{display: 'none'}}>{text}</div> : str;
}

export function WidgetHelper_getWidgetCssClasses(componentName: string, widgetConfig: AbstractWidgetConfig, context: AppContext, additionalCssClasses: Array<string> = []): string {
    const cssClasses = [] as Array<string>;
    componentName = _.upperFirst(componentName);

    cssClasses.push(componentName);

    if (_.get(context, `cssModules.${componentName}`, false)) {
        cssClasses.push(_.get(context, `cssModules.${componentName}`));
    }

    if (widgetConfig) {
        if (widgetConfig.customWidth && widgetConfig.customWidth !== 'none') {
            cssClasses.push(`widgetWidth${widgetConfig.customWidth}`);
        }

        if (widgetConfig.customPosition && widgetConfig.customPosition !== 'none') {
            cssClasses.push(`widgetPosition${_.upperFirst(widgetConfig.customPosition)}`);
        }

        if (widgetConfig.customClass && widgetConfig.customClass !== '') {
            cssClasses.push(widgetConfig.customClass);
        }
    }

    return [...additionalCssClasses, ...cssClasses].join(' ');
}

export async function WidgetHelper_findWidgetConfig(context: AppContext, objToCompare, containers: string[], boxes: string[] = ['box_top', 'box_left', 'box_middle', 'box_right', 'box_bottom']): Promise<any> {
    return new Promise(async (resolve, reject) => {
        const variant = context.websiteManagerVariant;
        let configQuery = '';
        containers.forEach(section => {
            configQuery += section + ':config(codeName: "' + section + '"){ data } ';
        })

        const query = gql`
            query($nodeID: ID!, $variant:ID!){
                node(id: $nodeID){
                    config(variantId: $variant){
                        ${configQuery}
                    }
                }
            }
        `;
        const variables = {
            nodeID: context.siteNodeId,
            variant: variant,
        };

        if (!variant || !variables.nodeID) {
            console.warn('WidgetHelper_findWidgetConfig: variant or nodeID is not defined for url:', context.url);
            return null;
        }

        const response = await WebsiteApiProvider.call(query, variables);
        const sectionsConfig = _.get(response, 'data.node.config');

        if (!sectionsConfig) {
            return null;
        }

        let widgetFound: any = null;
        containers.forEach(container => {
            const sectionConfig = _.get(sectionsConfig, `${container}.0.data`);
            if (sectionConfig) {
                boxes.forEach(box => {
                    widgetFound = _.find(sectionConfig[box], objToCompare);
                    if (widgetFound) {
                        resolve(widgetFound);
                    }

                })
            }
        })

        resolve(widgetFound)
    });
}

export async function WidgetHelper_getAppropriateTeaserCode(widgetConfig: BasicWidgetConfig | GenericListWidgetConfig, context: AppContext, isBig = false): Promise<string | null> {
    let customRole: string | null = null;

    if (widgetConfig.customTeasers) {
        const teaser = widgetConfig.customTeasers.find((child) => {
            return !!child['For big image'] === isBig && !!child['For mobile'] === UtilsHelper_isMobile(context);
        })
        if (teaser && teaser['Teaser code name']) {
            customRole = teaser['Teaser code name'];
        }
    }
    if (!customRole) {
        const devSettingsConfig = await ConfigHelper_getDeveloperSettingsConfig(context);
        if (devSettingsConfig.globalCustomTeasers) {
            const teaser = devSettingsConfig.globalCustomTeasers.find((child) => {
                return child['Widget type']?.toLowerCase().trim() === widgetConfig.widgetType?.toLowerCase() && !!child['For big image'] === isBig && !!child['For mobile'] === UtilsHelper_isMobile(context);
            })
            if (teaser && teaser['Teaser code name']) {
                customRole = teaser['Teaser code name'];
            }
        }
    }

    return customRole;
}


export async function WidgetHelper_getAppropriateTeaserImage(widgetConfig: BasicWidgetConfig | GenericListWidgetConfig, context: AppContext, leads: Array<any>, isBig = false): Promise<string | null> {
    let customTeaserImageUrl = null;
    let customRole = await WidgetHelper_getAppropriateTeaserCode(widgetConfig, context, isBig);
    if (customRole && customRole !== 'none') {
        const lead: any = leads?.find((lead) => lead?.role?.code === customRole);
        customTeaserImageUrl = lead?.image?.url;
    }

    return customTeaserImageUrl;
}

export function WidgetHelper_buildWidgetLocation(sectionName: string, boxName: string, index: number) {
    return [sectionName, boxName, index].join('--');
}
