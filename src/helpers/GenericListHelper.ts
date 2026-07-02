import {UtilsHelper_convertToInt, UtilsHelper_parsePositiveIntFromString} from "./UtilsHelper";
import {GenericListWidgetConfig} from "../components/widgets/Lists/GenericList/types";

// FTS API limit is 1000 items by default. Enable deep pagination with DEEP_PAGINATION_ENABLED=1 env flag to allow unlimited pagination.
const isDeepPaginationEnabled = process.env.DEEP_PAGINATION_ENABLED === '1';
const MAX_OFFSET = isDeepPaginationEnabled ? undefined : 1000;
export function WidgetHelper_calculateOffsetForGenericListPagination(widgetConfig: GenericListWidgetConfig, currentPage: number, isAjaxCall: boolean, isFirstCall: boolean) {
    const perPageAllItems = UtilsHelper_convertToInt(widgetConfig?.perPageAllItems) || UtilsHelper_convertToInt(widgetConfig?.paginationElements);
    const postShiftValue = UtilsHelper_convertToInt(widgetConfig?.postShift) || 0;
    currentPage = UtilsHelper_parsePositiveIntFromString(currentPage) || 1;
    const totalItemsBefore = perPageAllItems * (currentPage - 1);
    let offset = 0;
    if (isAjaxCall) {
        if (isFirstCall) {
            offset = totalItemsBefore;
        } else {
            const shiftAdjustment = postShiftValue * (currentPage - 2);
            offset = totalItemsBefore - shiftAdjustment;
        }
    } else {
        offset = totalItemsBefore + postShiftValue;
    }

    if (MAX_OFFSET === undefined) {
        return Math.max(0, offset);
    }

    return Math.min(MAX_OFFSET - perPageAllItems, Math.max(0, offset));
}

export function WidgetHelper_getPaginationDataForGenericList(widgetConfig: GenericListWidgetConfig, totalItems: number) {
    const perPageAllItems = UtilsHelper_convertToInt(widgetConfig?.perPageAllItems) || UtilsHelper_convertToInt(widgetConfig?.paginationElements);

    const pages = Math.ceil(totalItems / perPageAllItems);

    if (MAX_OFFSET === undefined) {
        return pages;
    }

    const lastAllowedPage = Math.ceil((MAX_OFFSET - perPageAllItems) / perPageAllItems);
    const lastPage = Math.min(pages, lastAllowedPage);


    return lastPage;
}
