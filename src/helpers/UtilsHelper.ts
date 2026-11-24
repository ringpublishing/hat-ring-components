// Libraries
import _ from 'lodash';
import {APIContext} from "astro";
import {AppContext, SiteContentType} from "../types/types";

/**
 * Build URL from forwarded headers (reverse proxy) or fallback to context.url
 * Works correctly for both ringpublishing.com and www.upday.com
 */
export function UtilsHelper_getCurrentUrl(context: APIContext): string {
    const forwardedProto = context.request.headers.get('x-forwarded-proto') || context.url.protocol.replace(':', '');
    const forwardedHost = context.request.headers.get('x-forwarded-host') || context.url.host;
    const forwardedUri = context.request.headers.get('x-forwarded-uri') || context.url.pathname;

    return `${forwardedProto}://${forwardedHost}${forwardedUri}`;
}

export function UtilsHelper_convertToInt(input: string | number | undefined) {
    return input ? typeof input === "number" ? input : parseInt(input) : 0;
}

export function UtilsHelper_parsePositiveIntFromString(input: string | number | undefined | null) {
    if (typeof input === "number") {
        return Number.isInteger(input) && input > 0 ? input : 0;
    }
    if (typeof input === "string") {
        return (/^[1-9]\d*$/.test(input)) ? parseInt(input, 10) : 0;
    }
}

export function UtilsHelper_getValueIfExists(value, defaultValue) {
    return _.isNil(value) ? defaultValue : value;
}

export function UtilsHelper_isDevelopmentMode() {
    return process.env.NODE_ENV !== 'production';
}

export function UtilsHelper_isMobile(context) {
    return !!context.hatControllerParams?.isMobile;
}

export function UtilsHelper_getExtension(src: string): string | null {
    const ext = src ? src.split('.').pop() : null;
    return ext ? ext.toLowerCase() : null;
}

export async function UtilsHelper_asyncSequentialForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

export async function UtilsHelper_asyncParallelForEach(arr, callback) {
    return await Promise.all(arr.map(callback));
}

export function UtilsHelper_isHomepage(context) {
    return context.url === '/';
}

export function UtilsHelper_getCurrentPageType(context) {
    const isHomePage = UtilsHelper_isHomepage(context);
    return isHomePage ? SiteContentType.Homepage : (context.siteContentType || null);
}


export function UtilsHelper_getCurrentNodeName(context) {
    try {
        const content = context?.hatControllerParams?.gqlResponse?.data?.site?.data?.content;
        if (content) {
            const pageType = UtilsHelper_getCurrentPageType(context);
            if (pageType === SiteContentType.SiteNode) {
                const categoryName = _.get(context, 'hatControllerParams.gqlResponse.data.site.data.node.category.data.name', '');
                if (categoryName) return categoryName;
                const slug = content.slug || '';
                return _.capitalize(UtilsHelper_slugify(slug));
            } else if (pageType === SiteContentType.Story) {
                return content.title || '';
            } else if (pageType === SiteContentType.CustomAction) {
                return content.action || '';
            } else if ([SiteContentType.Source, SiteContentType.Topic].includes(pageType)) {
                return content.name || '';
            } else if (pageType === SiteContentType.Author) {
                return content.name || '';
            }
        }
    } catch (e) {
        // Using inline console to avoid circular dependency with LogHelper
        if ((process.env.LOG_LEVEL || 'info') !== 'silent') {
            console.error('Error when getting current node name', e instanceof Error ? e.message : e);
        }
    }

    return '';
}

export function UtilsHelper_ensureHttps(url: string): string {
    return url.replace('http://', 'https://');
}

export function UtilsHelper_getDomain(context: AppContext, alwaysProduction = false) {
    return alwaysProduction ? context.domain : UtilsHelper_isDevelopmentMode() ? 'http://localhost' : context.domain;
}

export function UtilsHelper_getCurrentUrlWithDomain(context: AppContext, alwaysProduction = false) {
    return UtilsHelper_getDomain(context, alwaysProduction) + context.url;
}
export function UtilsHelper_getCurrentNodeCategoryId(context: AppContext) {
    return _.get(context, 'hatControllerParams.gqlResponse.data.site.data.node.category.id', null);
}

export function UtilsHelper_generateRandomString(length = 8) {
    return Math.random().toString(20).substr(2, length);
}
export function UtilsHelper_getQueryParam(param: string, context: AppContext): string | null {
    let val = _.get(context, ['hatControllerParams', 'urlWithParsedQuery', 'query', param], null) as string | null;
    if (val && typeof val === 'string') {
        val = UtilsHelper_stripHtmlTags(val);
    }
    return val;
}

export function UtilsHelper_getSearchQueryParamKey(): string {
    return _.get(global, 'searchQueryParamKey', 'q');
}

export function UtilsHelper_stripHtmlTags(userInput: string): string {
    return userInput.replace(/(<([^>]+)>)/gi, "");
}

export function UtilsHelper_slugify(slug: string): string {
    return slug
      .normalize('NFKD') // split accented characters into their base characters and diacritical marks
      .replace(/[\u0300-\u036f]/g, '') // remove all the accents, which happen to be all in the \u03xx UNICODE block.
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '') // remove non-alphanumeric characters
      .replace(/\s+/g, '-') // replace spaces with hyphens
      .replace(/-+/g, '-') // remove consecutive hyphens
  }

export function UtilsHelper_getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return 'Unknown error';
}

