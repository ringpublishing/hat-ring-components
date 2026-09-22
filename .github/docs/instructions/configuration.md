> **When to read:** You're configuring environment variables, CMS settings, widget parameters, or the WebsitesConfig system.

## 1. Environment Variables Reference

### Server (hat-server):
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| WEBSITE_API_PUBLIC | Yes | — | GraphQL API public key |
| WEBSITE_API_SECRET | Yes | — | GraphQL API secret key |
| WEBSITE_API_NAMESPACE_ID | Yes | — | CMS namespace UUID |
| NEXT_PUBLIC_WEBSITE_DOMAIN | Yes | — | Website domain (https://...) |
| PORT | No | 4321 | Server port |
| NODE_ENV | No | — | Environment mode |
| HAT_SERVER_WEBSITE_API_TTL | No | 60 | Server-level cache TTL (seconds) |
| HAT_SERVER_SHOW_URLS_IN_CONSOLE | No | false | Debug URL logging |
| RESPONSE_HEADER_CACHE_CONTROL_MAX_AGE | No | 60 | Cache-Control header max-age |
| GQL_CACHE_RESET_INTERVAL_SECONDS | No | 300 | GQL client cache reset interval |
| NEXT_PUBLIC_ACC_IMAGES_ENDPOINT | No | — | Image CDN endpoint |
| ONET_SEGMENT | No | — | CDE app start |

### Components (hat-ring-components):
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| CACHE_TTL | No | 60 | Widget cache TTL (seconds), 0 disables |
| CACHE_TTL_CONFIG | No | 60 | Config cache TTL (seconds) |
| CACHE_TTL_DEGRADED_RESPONSE | No | 60 | TTL for GraphQL responses with `errors` (never cached for the full TTL) |
| CACHE_TTL_NOT_FOUND_RESPONSE | No | 300 | TTL for GraphQL responses without any entity, e.g. `{story: null}` |
| CACHE_CLEAN_INTERVAL | No | 60 | Full flush interval of the in-process NodeCache (seconds). Ignored with Redis, which reclaims expired keys itself |
| CACHE_KEY_EXPIRE_GRACE_SECONDS | No | 0 | Redis only. `0` = persistent mode: nothing in the cache database carries a Redis TTL, entries are reclaimed only by maxmemory eviction (requires an `allkeys-*` policy). A positive value opts into volatile mode: data keys get `EX (ttl + grace)` and the grace is the stale-while-revalidate window |
| CACHE_TAG_TTL | No | CACHE_TTL | Redis, volatile mode only: base EXPIRE of tag sets. Must be >= CACHE_TTL; empty, invalid or lower values are logged and replaced by CACHE_TTL. Grace is added on top. Ignored in persistent mode, where tag sets never expire |
| CACHE_TAG_REFRESH_INTERVAL | No | 3600 | Redis only: throttle (seconds, per tag+key) for re-asserting tag membership on reads. Clamped to half of the tag TTL. On long-TTL sites (CACHE_TTL of days) under memory pressure use a few minutes, so an evicted tag set is rebuilt quickly; watch the `info.RedisProvider.clearByTag.emptyTagSet` counter |
| USE_REDIS | No | 0 | 0=NodeCache, 1=Redis |
| MEM_CACHE_FOR_CONFIG_MODE | No | 'request' | Config caching mode: 'request', 'time', 'none' |
| MEM_CACHE_FOR_CONFIG_TTL_MS | No | 1000 | TTL for time-based config cache (ms) |
| GET_KEYS_MODE | No | 'tags' | Cache invalidation mode: 'tags' or 'keys' |
| CONFIGURATION_TEMPLATE_NAME | No | — | Template ID for CMS admin |
| NEXT_PUBLIC_OCDN_BUCKET_NAME | No | — | OCDN bucket for assets |
| NEXT_PUBLIC_ACC_IMAGES_TRANSFORMATION_KEY | No | — | Image CDN transformation key |

### Redis (when USE_REDIS=1):
| Variable | Description |
|----------|-------------|
| REDIS_HOST | Redis server hostname |
| REDIS_PORT | Redis server port |
| REDIS_PASSWORD | Redis authentication |

## 2. CMS Configuration (ConfigHelper)
Site settings stored in CMS and fetched via GraphQL:

### General Config (`configKey: "general"`):
- siteName, siteDescription, siteLanguage
- logo URL, default image
- Social media URLs
- Contact information

### SEO Config (`configKey: "seo"`):
- Title patterns per page type
- Description patterns per page type
- Default article author
- Homepage node ID
- Separator character

### Date Format Config (`configKey: "dateFormat"`):
- timeZone (e.g., "Europe/Berlin")
- useExtendedDatesFormat
- Calendar format (sameDay, lastDay, etc.)

### Developer Settings (`configKey: "developerSettings"`):
- displayTitleCodeName (which title role to display)
- Text replacer patterns
- Custom teaser configuration

### Metadata Config (`configKey: "metaData"`):
- Custom meta tags to inject in head

## 3. WebsitesConfig Pattern
Defines widget parameters for the CMS admin interface:

```typescript
export let MyWidgetWebsitesConfig = {
    sections: [],           // Available sections
    defaultParams: {},      // Section-level defaults
    paramsDescription: {},  // Section-level param descriptions
    modules: {
        "myWidget_wdg": {   // Module identifier (used by CMS)
            name: "My Widget Display Name",
            description: "What this widget does",
            defaultParams: {
                ...AbstractWebsitesWidgetConfigDefaultParams,
                // Widget-specific defaults:
                showOptions: ["image", "title", "lead"],
                count: 10,
                columns: 2,
                bigImageSize: "1200x660",
                standardImageSize: "600x330",
            },
            paramsDescription: {
                showOptions: {
                    name: "Fields to display",
                    type: "select",
                    multiSelect: true,
                    items: ["image", "title", "lead", "publicationDate", "authors"]
                },
                count: { name: "Number of items", type: "textfield" },
                columns: { name: "Columns", type: "select", items: [1, 2, 3, 4] },
            }
        }
    }
};
```

### AbstractWebsitesWidgetConfigDefaultParams includes:
- platformDesktop: true, platformMobile: true
- customClass: "", customPosition: "none", customWidth: "none"

### Param types:
- `textfield` — Free text input
- `select` (+ multiSelect) — Dropdown/multi-select
- `checkbox` — Boolean toggle
- `number` — Numeric input

## 4. websiteManagerConfigs.ts
Aggregates all WebsitesConfigs into one object for the CMS:
```typescript
import { BasicWidgetWebsitesConfig } from "./components/widgets/BasicWidget/BasicWidgetWebsitesConfig";
import { GenericListWebsitesConfig } from "./components/widgets/GenericList/GenericListWebsitesConfig";
// ... more imports

export const websiteManagerConfigs = {
    ...BasicWidgetWebsitesConfig.modules,
    ...GenericListWebsitesConfig.modules,
    // ... more modules
};
```

## 5. CONFIGURATION_TEMPLATE_NAME
Identifies the project template in the CMS admin interface. Set as an env variable or in the astro config. Used by hat-admin pages for template-specific views.

## 6. Cache Configuration Strategy
```
Development: USE_REDIS=0, CACHE_TTL=10, CACHE_TTL_CONFIG=10
Production:  USE_REDIS=1, CACHE_TTL=60, CACHE_TTL_CONFIG=60, CACHE_CLEAN_INTERVAL=604800
```

## 7. Astro Configuration (astro.config.mjs)
Key project-level settings:
```javascript
export default defineConfig({
    output: "server",                    // SSR mode
    adapter: node({ mode: "standalone" }),
    site: "https://your-site.com",
    integrations: [react()],
    vite: {
        resolve: {
            alias: { "@common": "hat-ring-components/src/components/common" }
        },
        css: { preprocessorOptions: { scss: { /* ... */ } } }
    },
    build: { assets: "astro/assets/your-template" }
});
```
