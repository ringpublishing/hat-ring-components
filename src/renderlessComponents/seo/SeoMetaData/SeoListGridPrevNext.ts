import {AppContext, SiteContentType} from "../../../types/types";
import _ from "lodash"
import {
    UtilsHelper_getDomain, UtilsHelper_getQueryParam,
    UtilsHelper_parsePositiveIntFromString
} from "../../../helpers/UtilsHelper";
import {WidgetHelper_findWidgetConfig} from "../../../helpers/WidgetHelper";
import {GenericList_getData} from "../../../components/widgets/Lists/GenericList/GenericListGetData";
import {
    WidgetHelper_calculateOffsetForGenericListPagination,
    WidgetHelper_getPaginationDataForGenericList,
} from "../../../helpers/GenericListHelper";

export async function SeoListGridPrevNext(context: AppContext) {
    // FTS API limit is 1000 items by default. Enable deep pagination with DEEP_PAGINATION_ENABLED=1 env flag to allow unlimited pagination.
    const isDeepPaginationEnabled = process.env.DEEP_PAGINATION_ENABLED === '1';
    const MAX_OFFSET = isDeepPaginationEnabled ? undefined : 1000;
    const actualPageType = context.siteContentType;
    if (actualPageType !== SiteContentType.SiteNode || context.url === '/') {
        return {};
    }
    const containers = context.customData.gridContainers ? context.customData.gridContainers : ["ListExtendedWidgets1", "ListExtendedWidgets2"];

    const foundGenericList = await WidgetHelper_findWidgetConfig(context, {
        module: "genericList_wdg",
        mainSeoList: true
    }, containers);

    if (!foundGenericList) {
        return {};
    }
    const currentPage = UtilsHelper_parsePositiveIntFromString(UtilsHelper_getQueryParam('page', context)) || 1;
    const isAjaxCall = UtilsHelper_getQueryParam('gridLocationWidgetType', context) === 'genericList';
    const isFirstCall = UtilsHelper_getQueryParam('isFirstCall', context) === '1';
    const offset = WidgetHelper_calculateOffsetForGenericListPagination(foundGenericList, currentPage, isAjaxCall, isFirstCall);

    if (MAX_OFFSET !== undefined && offset >= MAX_OFFSET) {
        return {}
    }

    const data = await GenericList_getData(context, '', foundGenericList, {itemParts: []}, currentPage);
    let totalItems = _.get(data, 'data.stories.total', false);
    if (MAX_OFFSET !== undefined && totalItems > MAX_OFFSET) {
        totalItems = MAX_OFFSET;
    }
    const lastPage = WidgetHelper_getPaginationDataForGenericList(data, totalItems);

    const currentUrlPath = _.get(context, 'hatControllerParams.urlWithParsedQuery.path');
    const prevUrl = new URL(UtilsHelper_getDomain(context) + currentUrlPath);
    prevUrl.searchParams.set('page', `${currentPage - 1}`);

    if (currentPage - 1 === 1) {
        prevUrl.searchParams.delete('page');
    }

    const nextUrl = new URL(UtilsHelper_getDomain(context) + currentUrlPath);
    nextUrl.searchParams.set('page', `${currentPage + 1}`);

    var links: any = [];
    if (currentPage != 1) {
        links.push({rel: "prev", href: prevUrl.toString()});
    }
    if (currentPage < lastPage) {
        links.push({rel: "next", href: nextUrl.toString()});
    }

    return {
        extend: {
            link: links,
        },
    };

}


