> **When to read:** You're working with SEO titles, meta tags, Open Graph, Schema.org, canonical URLs, or robots directives.

## 1. SEO Title Template System
SeoHelper uses pattern-based title generation:
```typescript
SeoHelper_currentTitle(context, place?)
```

### Available template variables:
- `{{siteName}}` — From ConfigHelper_getGeneralConfig (site name)
- `{{nodeName}}` — Current category/section name
- `{{pageTypeName}}` — Story/Homepage/List/Topic/Author/Search
- `{{number}}` — Pagination page number
- `{{currentTitle}}` — Default title from content
- `{{authorName}}` — Author name (for author pages)
- `{{searchPhrase}}` — Search query parameter
- `{{separator}}` — Configurable separator (default: " | ")

### Per-page-type patterns (from CMS config):
```
homePageTitle:      "{{siteName}}"
listPageTitle:      "{{nodeName}} {{separator}} {{siteName}}"
detailPageTitle:    "{{currentTitle}} {{separator}} {{siteName}}"
authorPageTitle:    "{{authorName}} {{separator}} {{siteName}}"
topicPageTitle:     "{{nodeName}} {{separator}} {{siteName}}"
searchPageTitle:    "{{searchPhrase}} {{separator}} {{siteName}}"
```
Numerated variants (with pagination): append ` - Page {{number}}`

## 2. SEO Description
```typescript
SeoHelper_currentDescription(context)
```
Similar template system for meta descriptions. Falls back to story lead or site description.

## 3. Configuration
All SEO settings come from CMS via ConfigHelper:
```typescript
ConfigHelper_getSeoTitlesAndDescriptionConfig(context)  // Title/desc patterns
ConfigHelper_getSeoGeneralConfig(context)               // Default author, homepage ID
ConfigHelper_getMetaDataConfig(context)                 // Custom meta tags
ConfigHelper_getSeoLanguagesConfig(context)             // hreflang settings
```

## 4. Open Graph
```typescript
OpenGraphHelper_getMainStoryImageData(context)
// Fetches story main image for og:image
// Respects CMS Open Graph configuration
```
Components in hat-ring-components handle og:title, og:description, og:image, og:type, og:url.

## 5. Schema.org
SchemaOrg component generates structured data (JSON-LD) for:
- Articles (NewsArticle, BlogPosting)
- Authors (Person)
- Organization
- BreadcrumbList
- WebSite/WebPage

## 6. SafeHead Component
```astro
<SafeHead>
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta property="og:title" content={ogTitle} />
    <!-- etc. -->
</SafeHead>
```
Manages head tags safely, preventing duplicates.

## 7. Canonical URLs
Generated from the current page URL. For paginated content, canonical may point to page 1 or include rel="prev"/"next".

## 8. Robots Directives
```typescript
UtilsHelper_getStoryFlagsAndPreview(context) // { flags, isPreview } from one Websites API query
// Story has "hidden" flag → <meta name="robots" content="noindex, nofollow">
// Story is a preview (story.publication.preview) → <meta name="robots" content="noindex, nofollow">
// Checked in SeoMetaRobots and SeoMetaDecoratorRobots (they win over custom robots meta tags)
// SeoHelper_checkStoryHiddenFlag / UtilsHelper_isPreview read the same (cached) query
```

## 9. Image Preloading
Projects can implement SEO image preloading:
```typescript
// Generate <link rel="preload"> tags for above-fold images
// Returns HTML string of preload links
// Determines images from widget configs (preloadImagesCount param)
```

## 10. Project SEO Customization
Projects can add custom SEO decorators:
```typescript
// In project helper:
static SeoMetaDecoratorTitle(context, seoData) {
    // Modify title based on content type, flags, or custom logic
    return modifiedSeoData;
}
```
