> **When to read:** You're using or creating helper functions — caching, date formatting, image handling, content processing, or utility functions.

# Helper Functions Reference

HAT provides a comprehensive set of helper functions organized by domain. Each helper is imported from `hat-ring-components` and follows a consistent `HelperName_methodName` naming convention.

---

## 1. CacheHelper

Abstraction over Redis (production) or NodeCache (development). Handles serialization, TTL management, and tag-based bulk invalidation.

```typescript
CacheHelper_set(key, value, TTL, tags?)     // Store with optional tags for bulk invalidation
CacheHelper_get(key, removeOnExpire?)       // Retrieve (auto-cleanup on expire)
CacheHelper_getDecoratedCachedObject(key)   // Get with metadata: { ttl, value, expirationTimestamp }
CacheHelper_isExpired(rawCachedObject, ttl) // Check if entry expired
CacheHelper_getTtl(key)                     // Get remaining TTL
CacheHelper_clearByTag(tag)                 // Clear all entries with a specific tag
CacheHelper_createParentChildRelation()     // For hierarchical cache relations
```

**Key behavior:**

- Keys are always `JSON.stringify`'d internally — pass objects or strings, both work.
- Tags allow bulk invalidation: tag related entries (e.g., `'config'`, `'stories'`) and clear them all at once with `CacheHelper_clearByTag`.
- `getDecoratedCachedObject` returns `{ ttl, value, expirationTimestamp }` — useful for cache inspection and debugging.

**Configuration (environment variables):**

| Variable | Default | Description |
|---|---|---|
| `CACHE_TTL` | `60` | Default time-to-live in seconds |
| `CACHE_CLEAN_INTERVAL` | `60` | Interval for the full NodeCache flush in seconds (ignored with Redis) |
| `USE_REDIS` | `0` | Set to `1` to use Redis instead of NodeCache |

---

## 2. ConfigHelper

Fetches CMS configuration via GraphQL. Implements multi-level caching: request-scoped → global in-memory → API call.

```typescript
ConfigHelper_getConfig(context, configKey)              // Generic config fetch by key
ConfigHelper_getGeneralConfig(context)                  // Site name, logo, description, language
ConfigHelper_getSeoTitlesAndDescriptionConfig(context)  // SEO title/desc patterns
ConfigHelper_getSeoGeneralConfig(context)               // Default authors, homepage IDs
ConfigHelper_getDateFormatConfig(context)               // Timezone, calendar format
ConfigHelper_getDeveloperSettingsConfig(context)        // Text replacers, custom teasers, display title code name
ConfigHelper_getMetaDataConfig(context)                 // Custom meta tags
ConfigHelper_getSeoLanguagesConfig(context)             // Language/hreflang settings
```

**Caching modes** (`MEM_CACHE_FOR_CONFIG_MODE` env var):

| Mode | Behavior |
|---|---|
| `'request'` | Cached per-request only (freshest, slowest) |
| `'time'` | TTL-based global cache (default, best balance) |
| `'none'` | No caching — every call hits GraphQL |

All specialized methods (`getGeneralConfig`, `getSeoTitlesAndDescriptionConfig`, etc.) are convenience wrappers around `getConfig` with predefined config keys.

---

## 3. DateHelper

Timezone-aware date formatting using dayjs. Automatically applies the site's configured timezone.

```typescript
DateHelper_convertDate(context, dateString, format?)  // Convert with timezone from config
DateHelper_fromNow(context, date, template?)          // Relative time: "2 hours ago"
```

**How it works:**

1. Reads timezone from `ConfigHelper_getDateFormatConfig` (default: `"Europe/London"`).
2. Applies the timezone to all conversions automatically.
3. Supports locales: `en`, `de`, `fr`, `es`, `pl`.

**Calendar format support:**

The `convertDate` function supports dayjs calendar format tokens (`sameDay`, `lastDay`, `nextDay`, `lastWeek`, `nextWeek`, `sameElse`) for contextual date display.

**Custom `fromNow` templates:**

Projects can define localized relative-date templates and pass them as the `template` parameter to `DateHelper_fromNow`. This enables project-specific phrasing like "vor 2 Stunden" instead of "2 hours ago".

---

## 4. ImageHelper

Image dimensions, aspect ratio calculations, and default image handling.

```typescript
ImageHelper_getImageDimensionsFromObject(widgetConfig, context, desktopField, mobileField, fallback?)
  // Returns { width, height } based on device and widget config

ImageHelper_getImageDimensionsWithAspectRatio(origW, origH, maxW, maxH)
  // Calculates dimensions maintaining aspect ratio within max bounds

ImageHelper_getDefaultImageData(context, width, height, transform?)
  // Returns site's default placeholder image from general config
```

**TransformType enum:**

| Value | Behavior |
|---|---|
| `ResizeCropAuto` | Intelligent crop — resizes and crops to exact dimensions |
| `Resize` | Scale only — fits within dimensions, preserves aspect ratio |
| `None` | No transformation applied |

**Device-aware dimensions:**

`getImageDimensionsFromObject` checks `UtilsHelper_isMobile(context)` and reads from either `desktopField` or `mobileField` in the widget config, falling back to `fallback` dimensions if neither is set.

---

## 5. AcceleratorImagesHelper

URL transformation for the image acceleration/CDN service.

```typescript
AcceleratorImagesHelper_getUrl(originalUrl, width, height, transform)
  // Transforms image URL to use ACC service with dimensions and transform type
```

**Required environment variables:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ACC_IMAGES_ENDPOINT` | Base URL of the image acceleration service |
| `NEXT_PUBLIC_ACC_IMAGES_TRANSFORMATION_KEY` | Authentication key for transformations |

The helper rewrites the original image URL to route through the CDN, applying the specified dimensions and transform type.

---

## 6. StoryHelper

Content processing for story articles. Converts GraphQL content blocks into rendered HTML.

```typescript
StoryHelper_generateContentHtml({ story, blockDecorator? })
  // Converts GraphQL story.content blocks → HTML string

StoryHelper_getGqlContentFragment()
  // Returns reusable GQL fragment for story content blocks

StoryHelper_getStoryFlags(context)
  // Fetches story flags (e.g., "hidden", "showupdated")
```

**Block → HTML mapping:**

| Block type | HTML output |
|---|---|
| `heading` | `<h1>` – `<h6>` |
| `paragraph` | `<p>` |
| `image` | `<figure>` / `<img>` / `<figcaption>` |
| `table` | `<table>` / `<tr>` / `<td>` |
| `embed` | `<figure>` / `<iframe>` |
| `list` | `<ul>` / `<ol>` |
| `slot` | Custom slot component |
| `stories` | Embedded story references |

**GQL content fragment** (`getGqlContentFragment`) includes all block types: `ImageBlock`, `ParagraphBlock`, `HeadingBlock`, `TableBlock`, `EmbedBlock`, `SlotBlock`, `StoriesBlock`. Use this fragment in your GraphQL queries to fetch complete story content.

**Block decorator:**

Pass a `blockDecorator` function to `generateContentHtml` to customize rendering of individual blocks (e.g., inject ads between paragraphs, add custom wrappers).

---

## 7. WidgetHelper

Core widget management utilities for visibility, CSS classes, and configuration lookup.

```typescript
WidgetHelper_shouldHideWidget(widgetConfig, context)
  // Boolean: hide based on platform flags or gridLocation

WidgetHelper_renderEmptyWidget(widgetConfig, text?)
  // Returns HTML comment for hidden widget (preserves grid layout)

WidgetHelper_getWidgetCssClasses(componentName, widgetConfig, context, additionalClasses?)
  // Builds CSS class string: ComponentName + modules + width + position + custom

WidgetHelper_findWidgetConfig(context, objToCompare, containers?, boxes?)
  // Queries CMS for widget configuration matching criteria
```

**CSS class composition** (`getWidgetCssClasses`):

The generated class string includes:
- `ComponentName` — the widget's component name
- Module classes — from widget config modules
- Width classes — responsive width from grid config
- Position classes — grid placement
- Additional classes — any extra classes passed in

---

## 8. UtilsHelper

General-purpose utility functions.

```typescript
UtilsHelper_isMobile(context)              // Device detection from hatControllerParams
UtilsHelper_isDevelopmentMode()            // Check NODE_ENV !== 'production'
UtilsHelper_getUrlParts(url)              // Parse URL into components
UtilsHelper_convertToType(value, type)    // Type conversion utility
```

**Device detection:**

`isMobile` reads from `context.hatControllerParams` which is set by the middleware based on the User-Agent header. Use this for server-side responsive logic (choosing image sizes, hiding widgets, etc.).

---

## 9. AuthorsHelper

Author data fetching and processing.

```typescript
Author_getData(context, widgetConfig)
  // Fetches author with full profile data
```

**Returned profile data includes:**

`publicationPoint`, `socialProfiles`, `name`, `tagline`, `image` (with transforms), `gender`, `occupation`, `publisher`, `credentials`, `associations`, `awards`, `works`, `topics`.

The GQL fragment fetches the complete author profile in a single query, including image transformations for consistent rendering.

---

## 10. GenericListHelper

Data fetching for list and collection widgets.

```typescript
GenericList_getData(context, widgetConfig)
  // Fetches paginated list of stories with configurable filters
```

The widget config controls filtering, sorting, pagination, and which story fields to fetch. Returns a paginated result set ready for rendering in list widgets.

---

## 11. PageHelper

Page-level utilities for server-side parameter mapping.

```typescript
PageHelper_mapSearchParamsToAppContext(searchParams, hatControllerParams)
  // Maps server params to AppContext structure
```

Bridges server-side request parameters (search params, controller params) into the `AppContext` structure used throughout the widget rendering pipeline.

---

## 12. SeoHelper

SEO title and description generation with configurable template patterns.

> See **seo.md** for the full SEO helper reference, including template syntax, override behavior, and integration with CMS config.

---

## 13. Creating Project Helpers

Projects can create their own helpers following the static class pattern.

### Convention

- Place in `src/helpers/YourProjectHelper.ts`
- Use a static class with descriptive method names
- Integrate with `CacheHelper` for any data that benefits from caching
- Use cache tags for bulk invalidation of related entries

### Example

```typescript
// src/helpers/YourProjectHelper.ts
export class YourProjectHelper {
    static async getCustomData(): Promise<any> {
        const cacheKey = JSON.stringify({ type: 'custom-data' });
        let cached = await CacheHelper_get(cacheKey);
        if (cached) return cached;

        // fetch data...

        await CacheHelper_set(cacheKey, data, 3600, ['custom']);
        return data;
    }
}
```

### Best practices

- **Always cache external data** — use `CacheHelper_set` with appropriate TTL and tags.
- **Use `JSON.stringify` for cache keys** — keeps keys consistent with the framework convention.
- **Tag related entries** — enables bulk invalidation when source data changes.
- **Keep methods static** — helpers are stateless utility classes, not instantiated services.
- **Accept `context` where needed** — many framework helpers require the request context for device detection, config access, and caching scope.
