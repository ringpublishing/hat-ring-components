import {UtilsHelper_convertToInt, UtilsHelper_parsePositiveIntFromString} from "./UtilsHelper";
import {GenericListWidgetConfig} from "../components/widgets/Lists/GenericList/types";
const MAX_OFFSET = 1000;
export function WidgetHelper_calculateOffsetForGenericListPagination(widgetConfig: GenericListWidgetConfig, currentPage: number) {
    const perPageAllItems = UtilsHelper_convertToInt(widgetConfig?.perPageAllItems) || UtilsHelper_convertToInt(widgetConfig?.paginationElements);
    const postShiftValue = UtilsHelper_convertToInt(widgetConfig?.postShift) || 0;
    currentPage = UtilsHelper_parsePositiveIntFromString(currentPage) || 1;
    const totalItemsBefore = perPageAllItems * (currentPage - 1);
    const offset = totalItemsBefore + postShiftValue;

    return Math.min(MAX_OFFSET - perPageAllItems, Math.max(0, offset));
}

export function WidgetHelper_getPaginationDataForGenericList(widgetConfig: GenericListWidgetConfig, totalItems: number) {
    const perPageAllItems = UtilsHelper_convertToInt(widgetConfig?.perPageAllItems) || UtilsHelper_convertToInt(widgetConfig?.paginationElements);

    const pages = Math.ceil(totalItems / perPageAllItems);
    const lastAllowedPage = Math.ceil((MAX_OFFSET - perPageAllItems) / perPageAllItems);
    const lastPage = Math.min(pages, lastAllowedPage);


    return lastPage;
}