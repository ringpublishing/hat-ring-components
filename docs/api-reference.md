# API reference

[← Back to index](./README.md)

Everything below is exported from the package entry point unless stated otherwise.

---

## Widget helpers

| Function | Purpose |
|---|---|
| `WidgetHelper_shouldHideWidget(widgetConfig, context)` | Platform flags and visibility rules — call this first in every widget |
| `WidgetHelper_renderEmptyWidget(widgetConfig)` | Placeholder markup that preserves grid structure |
| `WidgetHelper_renderEmptyComponent(className, message?, visible?)` | Placeholder for a sub-component, with an optional diagnostic message shown in development |
| `WidgetHelper_getWidgetCssClasses(name, widgetConfig, context, extraClasses)` | Builds the root class list, including the project CSS-module class |
| `WidgetHelper_findWidgetConfig(...)` | Locates another widget's configuration in the grid |
| `WidgetHelper_getAppropriateTeaserImage(...)` | Picks the right teaser variant for the current platform and configuration |
| `WidgetHelper_buildWidgetLocation(sectionName, boxName, index)` | Stable widget id used by Grid Edit |

---

## Cache

| Function | Purpose |
|---|---|
| `CacheHelper_getCacheAdapter()` | Returns the active adapter (in-memory or Redis) |
| `CacheHelper_get` / `CacheHelper_set` / `CacheHelper_del` | Basic operations |
| `CacheHelper_getDecoratedCachedObject` | Returns a value plus its freshness metadata — the basis for stale-while-revalidate |
| `CacheHelper_isExpired` / `CacheHelper_getTtl` / `CacheHelper_getExpirationTimestamp` | Freshness inspection |
| `CacheHelper_keys` / `CacheHelper_flush` | Enumeration and full purge |
| `CacheHelper_getKeysByTag` / `CacheHelper_clearByTag` | Tag-based invalidation |
| `CacheHelper_createParentChildRelation` | Links a derived entry to its source so both are purged together |

### Cache scanner

For large key spaces where enumeration must be incremental:

`CacheScannerHelper_getData`, `_getAllKeysByScan`, `_clearKeysByScan`, `_getStatus`, `_setStatus`,
`_stopScanning`, `_removeScanner` — paired with the `CacheScanner` component for a live UI.

---

## Configuration

`ConfigHelper_getConfig` is the general accessor; the rest are typed shortcuts.

| Function | Returns |
|---|---|
| `ConfigHelper_getGeneralConfig` | The General section |
| `ConfigHelper_getSeoGeneralConfig` | SEO general settings |
| `ConfigHelper_getSeoTitlesAndDescriptionConfig` | Title and description templates per page type |
| `ConfigHelper_getSeoLanguagesConfig` | Supported languages and custom alternates |
| `ConfigHelper_getSeoRssDefaultConfig` | RSS defaults |
| `ConfigHelper_getSeoOpenGraphConfig` | Open Graph image sizes |
| `ConfigHelper_getMetaDataConfig` | Custom meta tags |
| `ConfigHelper_getContentLinksConfig` | Outbound-link whitelist rules |
| `ConfigHelper_getDeveloperSettingsConfig` | Developer settings |
| `ConfigHelper_getDateFormatConfig` | Date formats and time zone |
| `ConfigHelper_getLanguage` | Active language code |
| `ConfigHelper_getSiteName` / `getSiteDescription` / `getSiteLogo` / `getSiteContactNumber` | Site identity |
| `ConfigHelper_getHomepageUrl` / `currentUrl` | URLs |
| `ConfigHelper_getMainCategoryUuid` | Main category UUID |

---

## SEO

### Renderless meta components

Each is an async function taking `context` and returning a data object. A project merges the results
and hands them to its `<head>` renderer.

| Function | Produces |
|---|---|
| `SeoMetaBase` | Base meta set |
| `SeoMetaTitle` / `SeoMetaDescription` | Title and description per page type, with paginated variants |
| `SeoMetaCanonical` | Canonical URL |
| `SeoMetaRobots` / `SeoMetaDecoratorRobots` | Robots directives, including decorator-driven overrides |
| `SeoMetaOpenGraph` / `SeoMetaTwitter` | Open Graph and Twitter Cards, including image dimensions |
| `SeoMetaAlternates` | `hreflang` alternates |
| `SeoMetaCustomMetaTags` | Custom meta tags scoped by content type |
| `SeoListGridPrevNext` | `rel="prev"` / `rel="next"` for paginated lists |

Typical composition:

```ts
const components = [
    SeoMetaTitle, SeoMetaDescription, SeoMetaAlternates,
    SeoMetaOpenGraph, SeoMetaTwitter, SeoMetaRobots,
    SeoMetaCustomMetaTags, SeoMetaCanonical, SeoListGridPrevNext,
];

let metadata = {};
await UtilsHelper_asyncParallelForEach(components, async (component) => {
    metadata = _.merge(metadata, await component(context));
});

const finalMetadata = await SeoMetaDecoratorRobots(context, metadata);
```

### Other SEO exports

| Export | Purpose |
|---|---|
| `SchemaOrg` (component) | JSON-LD: `Organization` on the homepage, `BreadcrumbList` elsewhere, `NewsArticle` on articles, `Person` on author pages |
| `AlternateLinks`, `AlternateLinksFromNode`, `AlternateLinksFromStory` | Language alternates resolved from a node or a story |
| `RSS({ context, feedDecorator, blockDecorator })` | Generates a feed; returns `{ feed, type }` |
| `SeoHelper_*` | Title, description, logo, contact, site name, locale, page type, main image, bracket-variable substitution |
| `SeoTitleHelper_pageTitle` / `SeoDescriptionHelper_pageDescription` | The resolution logic behind the meta components |
| `OpenGraphHelper_getMainStoryImageData` | Main image data for social cards |
| `SeoLinkWhitelistHelper_processLinks` | Applies the outbound-link whitelist and `rel` rules |

---

## Content

| Function | Purpose |
|---|---|
| `StoryHelper_generateContentHtml` | Renders article blocks to HTML (used by RSS and text extraction) |
| `StoryHelper_getLeadBlock` | Extracts the lead paragraph |
| `StoryHelper_getGqlContentFragment` | The GraphQL fragment for article content |
| `StoryHelper_getGroupContent(blocks, groupName)` | Extracts one named group of blocks |
| `StoryHelper_getStoryFlags` / `SeoHelper_checkStoryHiddenFlag` | Editorial flags |
| `Author_getData` / `authorGqlFragment` | Author data and its GraphQL fragment |
| `AdditionalComponentHelper_insertComponentAtPattern` | Pattern-based insertion into a list of elements |
| `LinkReplacerHelper_replaceLinks` | Applies link replacer rules from Developer settings |

---

## Images

| Function | Purpose |
|---|---|
| `AcceleratorImagesHelper_getUrl(...)` + `TransformType` | Builds transformed image URLs |
| `ImageHelper_getDefaultImageData` | Site-wide fallback image |
| `ImageHelper_getImageDimensionsFromObject` | Dimensions from a CMS image object |
| `ImageHelper_getImageDimensionsWithAspectRatio` | Dimensions preserving aspect ratio |
| `ImageHelper_getImageMetaData` | Caption, copyright and source metadata |

---

## Dates and lists

| Function | Purpose |
|---|---|
| `DateHelper_convertDate` | Formats a date using the configured format and time zone |
| `DateHelper_fromNow` | Relative date using the configured extended formats |
| `WidgetHelper_calculateOffsetForGenericListPagination` | Offset for a given page |
| `WidgetHelper_getPaginationDataForGenericList` | Page count, current page, prev/next availability |

---

## Utilities

`UtilsHelper_*`: `getCurrentUrl`, `getCurrentUrlWithDomain`, `getDomain`, `ensureHttps`,
`isHomepage`, `getCurrentPageType`, `getCurrentNodeName`, `getCurrentNodeCategoryId`,
`getQueryParam`, `getSearchQueryParamKey`, `isMobile`, `isDevelopmentMode`, `convertToInt`,
`parsePositiveIntFromString`, `getValueIfExists`, `getExtension`, `generateRandomString`,
`stripHtmlTags`, `slugify`, `getErrorMessage`, `asyncSequentialForEach`, `asyncParallelForEach`.

`PageHelper_mapSearchParamsToAppContext(controllerParams, customData, cssModules)` builds the
`AppContext` consumed by every widget.

`LogHelper_error` / `_warn` / `_info` / `_debug`, plus `LogHelper_getLevel` and
`LogHelper_isLevelEnabled`.

`WebhookHelper_POST(context)` — a ready-made handler for CMS invalidation webhooks.

---

## Providers

| Provider | Responsibility |
|---|---|
| `WebsiteApiProvider` | GraphQL client for Websites API with caching, query tagging and metrics |
| `CacheProvider` | Facade over the cache helpers — get, set, TTL, expiration, decorated objects |
| `RedisProvider` | Redis client with AWS SigV4 authentication, tag sets, glob key scanning, multi-get and reconnection handling |
| `TranslationProvider` | `translate()` backed by the Translations configuration |
| `MonitoringProvider` | `counter`, `gauge`, `timer`, `flush` |

### Cache adapters

`NodeCacheAdapter` and `RedisCacheAdapter` both implement `CacheAdapterInterface`. The active
adapter is selected by environment; code should go through `CacheHelper` or `CacheProvider` rather
than an adapter directly.

---

## Tooling entry points

| Export | Purpose |
|---|---|
| `HatAdmin` (component) | Configuration-template publishing UI; requires the template name to be set and only runs in development mode |
| `CacheScanner` (component) | Live cache-scan UI |
| `hat-ring-components/src/pages/GridEdit` | `gridEditStylesGET`, `gridEditLoaderGET`, `gridEditDndGET` and `createGridEditAPI` — a bookmarklet-driven in-page grid editor supporting `updateConfig`, `determineConfigNodeId` and `getContainerSections` |

---

[← Configuration model](./configuration.md) · [Back to index](./README.md) · [Next: Testing →](./testing.md)
