> **When to read:** You're trying to understand how a HAT project works, the request lifecycle, or how data flows from CMS to rendered HTML.

# HAT Architecture & Data Flow

HAT (Head App Template) is an Astro-based SSR framework for building publishing websites powered by Ring CMS. This document explains the full architecture: how the layers fit together, what happens when a request arrives, and how data flows from CMS configuration to rendered HTML.

---

## 1. Three-Layer Architecture

HAT is split into three npm-installable layers. Each has a clear responsibility.

```
┌───────────────────────────────────────────────────┐
│                  HAT Project                       │
│  Brand identity · Custom widgets · Project helpers │
│  Custom pages · Middleware overrides               │
├───────────────────────────────────────────────────┤
│             hat-ring-components                    │
│  Widgets · Helpers · Providers · Grid system       │
│  SEO components · Styling utilities                │
├───────────────────────────────────────────────────┤
│                  hat-server                        │
│  BootServer · GraphQL middleware · Caching headers │
│  Analytics (RingDataLayer) · Health checks         │
└───────────────────────────────────────────────────┘
```

### 1.1 hat-server (HTTP Server Layer)

The `hat-server` npm package provides the **BootServer** class — the entry point for every request. It was originally designed for Next.js but adapted for Astro via middleware integration.

**Responsibilities:**

- Parse the incoming URL and extract request metadata (variant, domain, host, device type)
- Call the Ring CMS GraphQL API to fetch page data (the "initial query")
- Build `HatControllerParams` — the server-side context object attached to every request
- Generate `RingDataLayer` for analytics tracking
- Manage response headers: security headers, `Cache-Control`, `Permissions-Policy`, `Content-Length`
- Serve health check endpoints for load balancers

**Key configuration options:**

```typescript
{
  useDefaultHeaders: true,              // Security headers (X-Content-Type-Options, etc.)
  useWebsitesAPIRedirects: true,        // Follow redirects from CMS API
  useHatControllerParams: true,         // Attach controller params to request
  useWebsitesAPI: true,                 // Fetch initial page data from Website API
  useAccRdl: true,                      // Generate Ring Data Layer for analytics
  enableDebug: false,                   // Debug logging
  healthCheckPathname: '/_healthcheck', // Health probe path
  gotClientTimeout: 10000,             // HTTP client timeout (ms)
  use304Functionality: false            // HTTP 304 Not Modified support
}
```

### 1.2 hat-ring-components (Component Library Layer)

The shared component library provides everything needed to render CMS-driven pages:

| Category | Examples |
|----------|----------|
| **Widgets** | `BasicWidget`, `StoryTitle`, `StoryContent`, `StoryAuthors`, `GenericList`, `TopicTitle`, `Slider`, `SearchBox` |
| **Helpers** | `CacheHelper`, `DateHelper`, `ImageHelper`, `StoryHelper`, `SeoHelper`, `WidgetHelper`, `ConfigHelper`, `PageHelper`, `UtilsHelper` |
| **Providers** | `WebsiteApiProvider` (GraphQL client), `CacheProvider` (cache abstraction), `MonitoringProvider` (counters) |
| **Grid system** | `Grid.astro`, `Container.astro`, `Box.astro`, `Widget.astro` |
| **SEO** | `SchemaOrg`, meta tag components, Open Graph |
| **Styling** | SCSS mixins, breakpoint system, CSS Module utilities |
| **Types** | `AppContext`, `SiteContentType`, `AbstractWidgetConfig` |

### 1.3 HAT Project (Brand-Specific Layer)

Your repository — the project layer — customises the framework for a specific brand:

- **Identity:** Fonts, colour palette, icon font, CSS variables
- **Custom widgets:** Project-specific components in `src/components/widgets/`
- **Project helpers:** Brand-specific logic in `src/helpers/`
- **Custom pages:** Login, checkout, search, admin pages in `src/pages/`
- **Middleware overrides:** Extra rules in `src/middleware.ts` (early returns, cache resets)
- **Widget registration:** `src/widgets.ts` maps widget names to components (including aliases)

---

## 2. Request Lifecycle

Every request follows the same pipeline. Here is the complete flow from browser to response:

```
1.  Browser sends HTTP request
         │
2.  Astro middleware intercepts
         │ → Calls MiddlewareHelper_processRequest
         │
3.  Early-return rules
         │ → Extension matching (e.g. .php → 404)
         │ → Path matching (e.g. /mraid.js → 404)
         │ → Path bypass (POST webhook handlers, GET /ads.txt → skip boot)
         │
4.  BootServer.applyMiddlewareBefore()
         │
    4a.  Health check
         │ → If /_healthcheck: return 200 (or 503 if free memory < threshold)
         │
    4b.  Parse URL, extract headers
         │ → variant, domain, host, user-agent
         │ → Device detection (isMobile)
         │
    4c.  Call onRequest hook
         │ → Project can inject custom data or short-circuit
         │
    4d.  Query Ring CMS via GraphQL (if useWebsitesAPI)
         │ → Cache check (stale-while-revalidate)
         │ → Build query: site(url, variantId) { data { content, node } }
         │ → Fetch or refresh cache
         │ → Handle redirects (statusCode 301/302 from CMS)
         │
    4e.  Build RingDataLayer
         │ → Analytics object from content metadata
         │ → base64-encoded, sent as x-acc-rdl header
         │
    4f.  Build HatControllerParams
         │ → { gqlResponse, customData, isMobile, variant, domain, ringDataLayer }
         │
    4g.  Attach to request context
         │ → Astro.locals['hatControllerParams'] = params
         │
5.  Astro renders page
         │
    5a.  [...path].astro catches all routes
         │ → Reads hatControllerParams from Astro.locals
         │
    5b.  Content type detection
         │ → Maps gqlResponse.data.site.data.content.__typename
         │ → To SiteContentType enum value
         │
    5c.  Route component selection
         │ → Story.astro, SiteNode.astro, Author.astro, Topic.astro, etc.
         │ → Falls back to NotHandled.astro
         │
    5d.  Layout.astro wraps everything
         │ → Fonts, global styles, SEO meta tags, ad scripts
         │
    5e.  Grid.astro fetches widget configs from CMS
         │ → GraphQL query for container configurations
         │
    5f.  Container → Box → Widget rendering
         │ → Each container maps to a CMS-defined layout
         │ → Each box holds an ordered list of widgets
         │ → Each widget is resolved from the widget registry
         │
    5g.  Widgets fetch their own data
         │ → Via WebsiteApiProvider.call() with caching
         │
6.  BootServer.applyMiddlewareAfter()
         │ → Set security headers (X-Content-Type-Options: nosniff)
         │ → Set Cache-Control headers
         │ → Set Permissions-Policy
         │ → Set Content-Length (production only)
         │
7.  Response sent to browser
```

### 2.1 The Initial GraphQL Query

The very first CMS query (made by BootServer) fetches the page's core data:

```graphql
query {
  contentSpaceId
  site(url: "${url}", variantId: "${variantId}") {
    statusCode
    headers { location }
    data {
      node {
        breadcrumbs { slug, name, url }
        category { id }
        id
      }
      content {
        __typename
        ... on Story {
          id, title, mainPublicationPoint, kind { code },
          system { revision }
        }
        ... on SiteNode { id, slug, category { id } }
        ... on Topic { id, name, publicationPoint { id } }
        ... on Source { id, name, publicationPoint { id } }
        ... on Author { id, name, publicationPoint { id } }
        ... on CustomAction { id, action }
      }
    }
  }
}
```

The `__typename` field drives the entire routing decision. The `node` data provides navigation context (breadcrumbs, category). The `content` data provides the entity itself.

---

## 3. AppContext — The Universal Context

`AppContext` is the single most important interface in HAT. It is passed as a prop to **every** component — widgets, grid containers, layout, SEO components, and helpers.

```typescript
interface AppContext {
  siteContentType: SiteContentType;     // What kind of page this is
  id: string;                           // Entity ID (story UUID, author UUID, etc.)
  siteNodeId: string;                   // Navigation node ID from CMS tree
  url: string;                          // Current page URL (pathname)
  customData: any;                      // Extensible data bag (see below)
  hatControllerParams: HatControllerParams;  // Full server-built params
  cssModules?: any;                     // Injected CSS module classes from project
  websiteManagerVariant: string;        // CMS variant ID
  domain: string;                       // Site domain (e.g. "www.example.com")
}
```

### 3.1 Field Details

| Field | Source | Purpose |
|-------|--------|---------|
| `siteContentType` | Mapped from `gqlResponse.data.site.data.content.__typename` | Determines which route component renders the page. Used by widgets to conditionally show/hide. |
| `id` | From `gqlResponse.data.site.data.content.id` | The primary entity ID. For stories, this is the story UUID. For authors, the author UUID. Used by widgets to fetch additional data. |
| `siteNodeId` | From `gqlResponse.data.site.data.node.id` | The CMS navigation tree node. Used to fetch Grid configurations (which widgets appear on this page). |
| `url` | From the request URL pathname | Used for canonical URLs, breadcrumbs, active navigation state, and SEO. |
| `customData` | Starts empty `{}`, populated by hooks and middleware | An extensible bag. Also holds `_cache` for request-level caching (see ConfigHelper). Projects add custom properties here. The widget registry (`widgets`) is also attached here. |
| `hatControllerParams` | Built by BootServer (see §4) | The complete server context. Components that need the raw GraphQL response or analytics data access it through here. |
| `cssModules` | Injected by the project's layout | CSS Module class name mappings. Allows project-level styling to be passed into shared components. |
| `websiteManagerVariant` | From BootServer (via request headers or config) | The CMS variant ID. Different variants can serve different page layouts for the same URL (e.g. A/B tests, regional editions). |
| `domain` | From BootServer (via request headers) | The domain the request was made to. Used for generating absolute URLs and multi-domain setups. |

### 3.2 How AppContext Is Built

```typescript
// In [...path].astro (simplified)
const hatControllerParams = Astro.locals['hatControllerParams'];
const { siteContentType, id, siteNodeId } = PageHelper_mapSearchParamsToAppContext(hatControllerParams);

const context: AppContext = {
  siteContentType,
  id,
  siteNodeId,
  url: Astro.url.pathname,
  customData: { widgets: allWidgets, ...additionalData },
  hatControllerParams,
  cssModules: importedStyles,
  websiteManagerVariant: hatControllerParams.websiteManagerVariant,
  domain: hatControllerParams.domain
};
```

---

## 4. HatControllerParams

`HatControllerParams` is the server-side context object built by `BootServer` during `applyMiddlewareBefore()`. It captures everything the server knows about the current request.

```typescript
class HatControllerParams {
  gqlResponse: any;                    // Full GraphQL response from the initial CMS query
  customData: any;                     // Additional data injected by the onRequest hook
  urlWithParsedQuery: UrlWithParsedQuery;  // Parsed URL with pathname, query params, etc.
  isMobile: boolean;                   // Device detection from User-Agent
  websiteManagerVariant: string;       // The selected CMS variant
  domain: string;                      // The request domain
  ringDataLayer: any;                  // Analytics data layer object (see §4.1)
}
```

### 4.1 RingDataLayer

The `RingDataLayer` is an analytics object built from the initial GraphQL response. It provides structured metadata for Ring Publishing's analytics pipeline.

```typescript
// Structure (simplified)
{
  content: {
    object: {
      id: "<content-id>",
      type: "story" | "list" | "person" | "topic" | "contentsource" | "wildcard",
      kind: "<article-kind-code>"
    },
    part: 1,
    publication: {
      point: { id: "<publication-point-id>" }
    },
    source: {
      system: "ring_content_space",
      id: "<content-space-id>"
    }
  },
  context: {
    publication_structure: {
      root: "<ROOT_BREADCRUMB>",
      path: "<BREADCRUMB/PATH/SEGMENTS>"
    }
  }
}
```

**Type mapping from `__typename`:**

| `__typename` | `ringDataLayer.content.object.type` |
|---|---|
| Story | `story` |
| SiteNode | `list` |
| Author | `person` |
| Topic | `topic` |
| Source | `contentsource` |
| CustomAction | `wildcard` |

The data layer is base64-encoded and sent as the `x-acc-rdl` response header.

---

## 5. Content Type Detection & Routing

### 5.1 SiteContentType Enum

```typescript
enum SiteContentType {
  Homepage     = "Homepage",      // Home page (detected from URL path)
  Story        = "Story",         // Article detail page
  SiteNode     = "SiteNode",      // Category or section listing
  Author       = "Author",        // Author profile page
  Topic        = "Topic",         // Topic/tag listing page
  Source       = "Source",         // Content source listing page
  CustomAction = "CustomAction",  // Custom page action
  Search       = "Search",        // Search results page
  Error404     = "Error404"       // Not found
}
```

### 5.2 How Content Types Are Detected

The initial GraphQL query returns `gqlResponse.data.site.data.content.__typename`. The `PageHelper_mapSearchParamsToAppContext` function maps this to a `SiteContentType`:

```
__typename: "Story"        → SiteContentType.Story
__typename: "SiteNode"     → SiteContentType.SiteNode
__typename: "Author"       → SiteContentType.Author
__typename: "Topic"        → SiteContentType.Topic
__typename: "Source"       → SiteContentType.Source
__typename: "CustomAction" → SiteContentType.CustomAction
```

**Homepage** is a special case — it's detected from the URL path (typically `/` or a configured homepage path), not from `__typename`.

### 5.3 Route Component Selection

The `[...path].astro` catch-all route selects the rendering component based on content type:

```
src/pages/
├── [...path].astro          ← Catch-all: selects route component
├── index.astro              ← Homepage (bypasses catch-all)
├── routes/
│   ├── Story.astro          ← Story detail pages
│   ├── SiteNode.astro       ← Category/section listings
│   ├── Topic.astro          ← Topic listings
│   ├── Author.astro         ← Author profiles
│   └── NotHandled.astro     ← Fallback for unknown types
└── 404.astro                ← Error page
```

**Routing logic (simplified):**

```typescript
// In [...path].astro
const RoutingComponent = RoutingComponents[siteContentType] || NotHandled;

if (!siteNodeId || !siteContentType) {
  return Astro.rewrite('/404');
}

// Render
<Layout context={context}>
  <RoutingComponent context={context} />
</Layout>
```

### 5.4 Route Component Structure

Each route component defines which CMS containers to render via the Grid system:

```astro
---
// routes/Story.astro (pattern)
const { context } = Astro.props;
---

<Grid context={context} config={{
  containers: ["DetailExtendedWidgets1", "DetailExtendedWidgets2",
               "DetailExtendedWidgets3", "DetailExtendedWidgets4"],
  boxes: ["widgets_above_content", "widgets_middle_content",
          "widgets_below_content", "widgets_sidebar"]
}} />
```

| Content Type | Typical Containers |
|---|---|
| Story | `DetailExtendedWidgets1–4` |
| SiteNode | `ListExtendedWidgets1–2` |
| Topic | `tag_ExtendedWidgets1–2` |
| Author | `AuthorWidgets1–2` |
| Homepage | `HomepageExtendedWidgets1–N` |

---

## 6. Provider Pattern

HAT uses static-method providers for external services. Providers are singletons — they maintain global state (clients, caches, connections).

### 6.1 WebsiteApiProvider

The main entry point for all GraphQL queries to Ring CMS.

```typescript
WebsiteApiProvider.call(query: DocumentNode, variables: object, cacheTtl?: number): Promise<any>
```

**Stale-while-revalidate caching strategy:**

```
WebsiteApiProvider.call(query, variables, ttl)
         │
         ▼
    Cache lookup (CacheProvider)
         │
    ┌────┴─────────────────────────────────┐
    │                                       │
  MISS                                    HIT
    │                                       │
    ▼                                  ┌────┴────┐
  API call                          FRESH      STALE
    │                                 │          │
    ▼                                 ▼          ▼
  Cache response              Return value   Return stale value
    │                                        + background refresh
    ▼                                             │
  Return response                                 ▼
                                            Lock key to prevent
                                            duplicate refreshes
                                            (global.HATCacheInCallInProgress)
                                                  │
                                                  ▼
                                            API call (async)
                                                  │
                                                  ▼
                                            Update cache
```

**Key behaviours:**

- **Fresh cache hit:** Return immediately. No API call.
- **Stale cache hit (expired TTL):** Return the stale value *immediately* (no latency penalty). Trigger a background refresh. If a refresh is already in progress for this key, wait for that instead of starting a new one.
- **Cache miss:** Make the API call synchronously, cache the response, return.
- **Error handling:** Log query + variables, increment error counter, return `null` on failure.

**Cache tag generation** (for targeted invalidation):

- Story queries → tagged `story_<uuid>`
- Config queries → tagged `config_<variant>`
- Section queries → tagged `section_<codeName>`
- Anything else → pass tags explicitly: `WebsiteApiProvider.call(query, variables, cacheTtl, ['story_<uuid>'])`. Use this whenever the story id is not carried by a recognised variable (`storyId`, `id`, `uuid`, …), e.g. a `stories(filter: {id: {notIn: $excludedIds}})` query.

Responses that carry GraphQL `errors` are cached for `CACHE_TTL_DEGRADED_RESPONSE` (default 60 s) and responses whose `data` holds no entity (`{story: null}`) for `CACHE_TTL_NOT_FOUND_RESPONSE` (default 300 s) instead of the caller's TTL. `CacheHelper_isExpired` treats only a *shortened* configured TTL as a change, so these shorter entries simply expire on time.

### 6.2 CacheProvider

Abstraction layer over the underlying cache engine. Switches between implementations based on environment:

```typescript
// Adapter selection
if (process.env.USE_REDIS === '1') {
  cacheAdapter = new RedisCacheAdapter();  // Production: Redis with tag support
} else {
  cacheAdapter = new NodeCacheAdapter();   // Development: in-memory node-cache
}
```

**API surface:**

```typescript
CacheProvider.set(key, value, TTL, tags?)     // Store value with optional cache tags
CacheProvider.get(key)                         // Retrieve value (or null)
CacheProvider.getDecoratedCachedObject(key)    // Get { value, ttl, expirationTimestamp }
CacheProvider.isExpired(cachedObject, ttl)     // Check if a cached object is past TTL
CacheProvider.getTTL(key)                      // Get remaining TTL
```

**NodeCacheAdapter** (development):
- In-memory using the `node-cache` npm package
- TTL from `CACHE_TTL` env var (default: 60s)
- No tag support
- Simple and fast for local development

**RedisCacheAdapter** (production):
- Persistent across process restarts
- Supports cache tags for bulk invalidation (`getKeysByTag`, `clearByTag`)
- Pub/Sub capable for cache coordination across instances
- Glob pattern scanning for key discovery

Tag lifecycle invariants (RedisProvider):
- A data key is written **and** `SADD`-ed into its tag sets in one `MULTI`, so a key never exists without its tag membership.
- **Expiry follows one of two modes, and a tag set always shares the lifecycle of its members.** Persistent mode (`CACHE_KEY_EXPIRE_GRACE_SECONDS=0`, the default and the original design): no key and no tag set carries a Redis TTL. The `ttl` / `expirationTimestamp` in the cached object say when the entry should be *refreshed*, never when it should be deleted; removal is left to maxmemory eviction and explicit invalidation, because a stale hit beats a miss. This requires an `allkeys-*` `maxmemory-policy`: under a `volatile-*` policy nothing would be evictable and writes would fail with OOM. Volatile mode (grace > 0): data keys get `SET … EX (ttl + grace)` and tag sets are only ever lengthened, never shortened (a Lua `TTL`-check + `EXPIRE`, so no Redis 7 `GT` dependency), staying ≥ the physical lifetime of their longest-lived member and ≥ `CACHE_TAG_TTL`/`CACHE_TTL` + grace. A misconfigured `CACHE_TAG_TTL` is ignored with an error log.
- Every read (throttled per tag+key by `CACHE_TAG_REFRESH_INTERVAL`) re-asserts membership with `SADD`, lengthens the tag set if needed, and backfills an `EXPIRE` on legacy keys written without one. A key that lost its tag (evicted tag set, purge race, partial write) therefore heals on the next read.
- `clearByTag` runs `DEL <members>` + `SREM tag <members>` per batch in one `MULTI` and never deletes the tag set: members added concurrently survive the purge. `parent_<uuid>` markers survive too and are removed one by one by the webhook after the parent was purged; `child_<uuid>` markers are dropped and re-created on the parent's next render.
- `getKeysByTag` EXISTS-filters only real keys; relation markers are returned untouched. Dead members are removed atomically (`EXISTS` + `SREM` in one Lua call).
- When Redis is unreachable the provider degrades to cache misses / no-ops (one shared initialisation attempt at a time, throttled error logs) instead of throwing on every call; purge methods (`clearByTag`) do throw so the webhook can log the failure and rely on its +70 s / +305 s repeats.

Rollout note for existing Redis databases: keys written by older versions have no `EXPIRE`, and keys of untagged queries (e.g. the StoryRelatedContent autocomplete `stories()` query before it was tagged) cannot be purged by tag. They are backfilled/healed on their first read, but a one-off `FLUSHDB` of the cache database (or a scan-clear) at deploy time is the clean way to start from a consistent state.

### 6.3 CacheHelper

Convenience wrapper around `CacheProvider` with additional utilities:

```typescript
CacheHelper_set(key, value, TTL, tags?)       // Set with optional tags
CacheHelper_get(key, removeOnExpire?)          // Get value
CacheHelper_getDecoratedCachedObject(key)      // Get decorated object
CacheHelper_isExpired(cachedObj, currentTtl)   // Check expiration
CacheHelper_flush()                            // Clear all cached data
CacheHelper_del(keys)                          // Delete specific keys
CacheHelper_getKeysByTag(tag)                  // Find keys by tag (Redis only)
CacheHelper_clearByTag(tag)                    // Delete all keys with tag (Redis only)
CacheHelper_getTtl(key)                        // Get TTL
```

**Auto-cleanup (NodeCache only):** `CacheHelper_get` flushes the in-process NodeCache every `CACHE_CLEAN_INTERVAL` seconds (default 60) and clears in-progress refresh locks (`global.HATCacheInCallInProgress`), because NodeCache is created with `deleteOnExpire: false`. With `USE_REDIS=1` this is skipped: data keys carry their own `EXPIRE`, and a `FLUSHALL` would wipe the cache shared by all pods.

---

## 7. ConfigHelper — Multi-Level Configuration Caching

`ConfigHelper` fetches CMS configuration (widget params, site settings, SEO templates) with a three-tier caching strategy controlled by the `MEM_CACHE_FOR_CONFIG_MODE` environment variable.

### 7.1 Cache Tiers

```
Tier 1: Request Memory (fastest)
  │  context.customData._cache[key]
  │  Scope: single request
  │  Benefit: deduplicates config fetches within one page render
  │
Tier 2: Global Memory
  │  global._cache[key] + global._cacheTimeStamp[key]
  │  Scope: process-wide, TTL-controlled
  │  TTL: MEM_CACHE_FOR_CONFIG_TTL_MS (default: 1000ms)
  │  Benefit: persists across requests without external I/O
  │
Tier 3: CacheProvider (Redis / NodeCache)
  │  Scope: persistent (Redis) or process (NodeCache)
  │  TTL: CACHE_TTL_CONFIG (default: 60s)
  │  Benefit: survives process restarts (Redis), tag-based invalidation
  │
Tier 4: Ring CMS API (slowest)
     GraphQL query to fetch fresh config
```

### 7.2 Cache Modes

| `MEM_CACHE_FOR_CONFIG_MODE` | Behaviour |
|---|---|
| `'none'` | Skip memory tiers. Direct to CacheProvider → API. |
| `'request'` | Use Tier 1 (request memory) → CacheProvider → API. Best for deduplication within a single page render. |
| `'time'` | Use Tier 2 (global memory with TTL) → CacheProvider → API. Best for configs that rarely change. |

### 7.3 Config Query Pattern

```graphql
query($nodeID: ID!, $variant: ID!) {
  node(id: $nodeID) {
    config(variantId: $variant) {
      sectionName: config(codeName: "sectionName") { data }
      seoSettings: config(codeName: "seoSettings") { data }
    }
  }
}
```

Common config code names: `general`, `seoSettings`, `seoLanguages`, `rssDefault`, `seoTitlesAndDescription`, `metaData`, `devGeneral`.

---

## 8. Configuration-Driven Design

A core HAT principle: **almost everything is configurable from the CMS**. The project code defines *what* components exist. The CMS defines *where*, *when*, and *how* they appear.

### 8.1 What the CMS Controls

| Aspect | CMS Configuration |
|--------|-------------------|
| **Widget placement** | Grid containers and boxes define which widgets appear where |
| **Widget parameters** | Each widget instance has a `widgetConfig` with custom params |
| **Widget visibility** | `platformDesktop` / `platformMobile` flags, enable/disable |
| **Page layout** | Container order, box sizes (1–12 grid columns), HTML tags |
| **SEO templates** | Title templates, meta description templates, per content type |
| **Date formats** | Display format configuration |
| **Site settings** | Site name, logo, homepage node, default authors |
| **Variants** | Different layouts/configs for the same URL (A/B testing, regional) |

### 8.2 Widget Configuration (AbstractWidgetConfig)

Every widget receives its configuration from the CMS:

```typescript
interface AbstractWidgetConfig {
  module?: string;                                    // Widget module identifier
  widgetType?: string;                                // Widget type name
  enabled?: boolean;                                  // Is widget active?
  platformDesktop?: boolean;                          // Show on desktop?
  platformMobile?: boolean;                           // Show on mobile?
  customClass?: string;                               // Additional CSS classes
  customPosition?: 'none' | 'left' | 'center' | 'right';
  customWidth?: 1|2|3|4|5|6|7|8|9|10|11|12;          // Grid column span
  // ... plus widget-specific params defined by each widget's WebsitesConfig
}
```

### 8.3 Grid Configuration

The Grid layout is entirely CMS-defined. Each page type has named containers; each container has boxes; each box has an ordered list of widgets.

```
CMS Config for "DetailExtendedWidgets1":
{
  container_hide: false,
  container_html_tag: "main",
  container_classes: "story-detail",

  box_top: [
    { widgetType: "StoryTitle", enabled: true },
    { widgetType: "StoryMainImage", enabled: true, customWidth: 12 }
  ],
  box_top_size: 12,

  box_middle: [
    { widgetType: "StoryContent", enabled: true },
    { widgetType: "StoryAuthors", enabled: true }
  ],
  box_middle_size: 8,

  box_sidebar: [
    { widgetType: "BasicWidget", enabled: true, module: "related-stories" }
  ],
  box_sidebar_size: 4
}
```

---

## 9. Grid System — Layout Rendering

The Grid system renders the CMS-defined layout through a four-level component chain:

```
Grid.astro
  └── Container.astro (one per CMS container)
        └── Box.astro (one per CMS box within the container)
              └── Widget.astro (one per widget config in the box)
                    └── Resolved Component (StoryTitle, BasicWidget, etc.)
```

### 9.1 Grid.astro

Receives a `config` prop listing which CMS containers to render:

```typescript
// Grid receives:
config = {
  containers: ["headerWidgets", "DetailExtendedWidgets1", "footerWidgets"],
  boxes: ["box_top", "box_left", "box_middle", "box_right", "box_bottom"]
}
```

Grid fetches the configuration for all listed containers via a single GraphQL query:

```graphql
query($nodeID: ID!, $variant: ID!) {
  node(id: $nodeID) {
    config(variantId: $variant) {
      headerWidgets: config(codeName: "headerWidgets") { data }
      DetailExtendedWidgets1: config(codeName: "DetailExtendedWidgets1") { data }
      footerWidgets: config(codeName: "footerWidgets") { data }
    }
  }
}
```

Then maps each container to a `<Container>` component.

### 9.2 Container.astro

Receives the parsed section config. Renders the container wrapper and iterates over boxes:

```astro
<ContainerTag class="gridContainer {container_classes}">
  {boxes.map(boxName =>
    !sectionConfig[boxName + '_hide'] &&
    <Box
      widgets={sectionConfig[boxName]}
      size={sectionConfig[boxName + '_size']}
      htmlTag={sectionConfig[boxName + '_html_tag']}
    />
  )}
</ContainerTag>
```

### 9.3 Box.astro

Receives a list of widget configs and renders each:

```astro
<BoxTag class="gridBox gridCol{size}">
  {widgets.map((widgetConfig, index) =>
    <Widget
      widgetConfig={widgetConfig}
      index={index}
      context={context}
    />
  )}
</BoxTag>
```

Boxes also handle **wrapper pairs** — special `wrapperStart` / `wrapperEnd` widgets that group other widgets inside a wrapper element. Unmatched pairs are filtered out.

### 9.4 Widget.astro

Resolves the widget component from the registry and renders it:

```typescript
// Component resolution
const availableWidgets = context.customData.widgets;
const Component = availableWidgets[UpperFirst(widgetConfig.widgetType)];

// Grid location for analytics and debugging
const gridLocation = `${sectionName}_${boxName}_${index}`;
```

```astro
<div id={gridLocation} class={cssClasses}>
  <Component widgetConfig={widgetConfig} context={context} />
</div>
```

The `gridLocation` query parameter (`?gridLocation=1`) enables visual debugging — each widget shows its location ID.

---

## 10. Caching Hierarchy

HAT uses multiple cache layers, from fastest to slowest:

```
┌─────────────────────────────────────────────┐
│ 1. Request Memory                            │
│    context.customData._cache                 │
│    Scope: single request                     │
│    TTL: request lifetime                     │
│    Use: ConfigHelper (mode: 'request')       │
├─────────────────────────────────────────────┤
│ 2. Global Process Memory                     │
│    global._cache                             │
│    Scope: Node.js process                    │
│    TTL: MEM_CACHE_FOR_CONFIG_TTL_MS          │
│    Use: ConfigHelper (mode: 'time')          │
├─────────────────────────────────────────────┤
│ 3. CacheProvider (Redis or NodeCache)        │
│    Scope: persistent (Redis) / process       │
│    TTL: CACHE_TTL / CACHE_TTL_CONFIG         │
│    Use: WebsiteApiProvider, ConfigHelper      │
│    Features: tags, stale-while-revalidate    │
├─────────────────────────────────────────────┤
│ 4. Ring CMS GraphQL API                      │
│    Scope: source of truth                    │
│    Latency: network round-trip               │
│    Use: all data fetching                    │
└─────────────────────────────────────────────┘
```

### Key Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CACHE_TTL` | `60` | General cache TTL in seconds. `0` disables caching. |
| `CACHE_TTL_CONFIG` | `60` | Config-specific cache TTL in seconds. |
| `CACHE_CLEAN_INTERVAL` | `60` | Interval (seconds) for the periodic NodeCache flush. Ignored with Redis. |
| `CACHE_TTL_DEGRADED_RESPONSE` | `60` | TTL for GraphQL responses with `errors`. |
| `CACHE_TTL_NOT_FOUND_RESPONSE` | `300` | TTL for GraphQL responses without any entity (`{story: null}`). |
| `CACHE_KEY_EXPIRE_GRACE_SECONDS` | `0` | Redis: `0` keeps every entry free of a Redis TTL (eviction only); > 0 opts into `EX (ttl + grace)` on data keys. |
| `CACHE_TAG_TTL` | `CACHE_TTL` | Redis, volatile mode only: base EXPIRE of tag sets (must be ≥ `CACHE_TTL`; grace is added). |
| `CACHE_TAG_REFRESH_INTERVAL` | `3600` | Redis: throttle for re-asserting tag membership on reads (≤ tag TTL / 2). |
| `USE_REDIS` | `0` | `0` = NodeCache (in-memory), `1` = Redis. |
| `MEM_CACHE_FOR_CONFIG_MODE` | `'request'` | Config cache mode: `'none'`, `'request'`, or `'time'`. |
| `MEM_CACHE_FOR_CONFIG_TTL_MS` | `1000` | TTL for global memory config cache (mode: `'time'`). |

---

## 11. Widget Data Flow

Each widget is independent and fetches its own data. Here is the data flow for a typical widget:

```
Grid renders Widget.astro
  │
  ▼
Widget resolves component from registry
  │ context.customData.widgets["StoryTitle"]
  │
  ▼
Component receives (context, widgetConfig)
  │
  ▼
Visibility check
  │ WidgetHelper_shouldHideWidget(widgetConfig, context)
  │ → Checks platformDesktop/platformMobile, enabled flag
  │ → If hidden: return WidgetHelper_renderEmptyWidget(widgetConfig)
  │
  ▼
Data fetching (if needed)
  │ WebsiteApiProvider.call(query, variables, cacheTtl)
  │ → Stale-while-revalidate caching
  │
  ▼
Render HTML
  │ CSS classes from WidgetHelper_getWidgetCssClasses()
  │ Widget-specific markup
  │
  ▼
Output: <div id="{gridLocation}" class="{classes}"> ... </div>
```

### Widget Registration

Widgets are registered in `src/widgets.ts`:

```typescript
import * as ringWidgets from "hat-ring-components";
import * as localWidgets from "./components/widgets";

export const widgets = Object.assign(
  {},
  ringWidgets,
  localWidgets,
  {
    // Aliases: map project names to ring components
    DetailTitle: ringWidgets.StoryTitle,
    DetailMainImage: ringWidgets.StoryMainImage,
  }
);
```

The combined widget map is attached to `context.customData.widgets` and used by `Widget.astro` for component resolution.

---

## 12. Summary: Data Flow Diagram

```
                    Ring CMS (GraphQL API)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     Initial Query   Grid Config   Widget Data
     (BootServer)    (Grid.astro)  (each Widget)
          │              │              │
          ▼              ▼              ▼
   HatControllerParams  Container    Widget-specific
   + RingDataLayer       configs      query results
          │              │              │
          └──────┬───────┘              │
                 ▼                      │
            AppContext ←────────────────┘
                 │
     ┌───────────┼────────────┐
     ▼           ▼            ▼
  Layout     Grid System    SEO
  (fonts,    (Container →   (meta tags,
   styles)    Box → Widget)  Schema.org)
                 │
                 ▼
           HTML Response
```

Every query to the CMS passes through `WebsiteApiProvider` with caching. Every component receives `AppContext`. The CMS drives layout, content, and configuration — the project code provides the rendering templates and brand identity.
