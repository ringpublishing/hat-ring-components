# HAT Framework Documentation

> **Head App Template (HAT)** — An Astro-based SSR framework for building publishing websites powered by Ring CMS.

## What is HAT?

HAT is a three-layer system for building high-performance, server-side rendered publishing websites:

| Layer | Package | Role |
|-------|---------|------|
| **Server** | `hat-server` | Request handling, GraphQL middleware, caching headers, analytics |
| **Components** | `hat-ring-components` | Widgets, helpers, grid system, SEO, styling utilities |
| **Project** | Your HAT project | Brand identity, custom widgets, project-specific logic |

**Technology stack:** Astro 5 (SSR) · TypeScript · React (optional islands) · SCSS (CSS Modules) · GraphQL (Ring Website API) · Redis/NodeCache

---

## Which doc should I read?

Use this table to find the right documentation for your task:

| Task | Read |
|------|------|
| Understanding request flow, data architecture | [architecture.md](./architecture.md) |
| Creating, editing, or debugging **widgets** | [widgets.md](./widgets.md) |
| Working with **SCSS**, CSS Modules, breakpoints, icons | [styling.md](./styling.md) |
| Configuring page **layout** (containers, boxes) | [grid.md](./grid.md) |
| Using or creating **helper functions** | [helpers.md](./helpers.md) |
| Writing or debugging **GraphQL** queries | [graphql.md](./graphql.md) |
| Configuring **server**, middleware, headers | [server.md](./server.md) |
| Working with **SEO** (titles, meta tags, Open Graph) | [seo.md](./seo.md) |
| Adding **pages**, routes, or API endpoints | [routing.md](./routing.md) |
| Creating or configuring **slots** (inline embeds) | [slots.md](./slots.md) |
| Environment variables, CMS config, widget params | [configuration.md](./configuration.md) |

---

## Key Concepts Glossary

### AppContext
The global context object passed to every component. Contains the current page's content type, entity ID, URL, custom data, and the `hatControllerParams` from the server.

```typescript
interface AppContext {
    siteContentType: SiteContentType;  // What kind of page this is
    id: string;                        // Story/Author/Topic ID
    siteNodeId: string;                // Navigation node ID
    url: string;                       // Current page URL
    customData: any;                   // Extensible data bag
    hatControllerParams: HatControllerParams;
    cssModules?: any;                  // Injected CSS module classes
    websiteManagerVariant: string;     // CMS variant ID
    domain: string;                    // Site domain
}
```

### SiteContentType
Enum that identifies the type of content on the current page:

```typescript
enum SiteContentType {
    Homepage, Story, SiteNode, Author, Topic, Source, CustomAction, Search, Error404
}
```

### WidgetConfig (AbstractWidgetConfig)
Configuration object for every widget, defined in the CMS and passed as props:

```typescript
interface AbstractWidgetConfig {
    module?: string;                          // Widget module identifier
    widgetType?: string;                      // Widget type name
    platformDesktop?: boolean;                // Visible on desktop?
    platformMobile?: boolean;                 // Visible on mobile?
    customClass?: string;                     // Additional CSS class
    customPosition?: 'none'|'left'|'center'|'right';
    customWidth?: 1|2|3|4|5|6|7|8|9|10|11|12;  // Grid column span
}
```

### HatControllerParams
Server-side data attached to the request by `hat-server`:

```typescript
interface HatControllerParams {
    gqlResponse: any;              // Initial GraphQL response (site data)
    customData: any;               // Custom data from hooks
    urlWithParsedQuery: object;    // Parsed URL + query params
    isMobile: boolean;             // Device detection
    websiteManagerVariant: string; // CMS variant
    domain: string;                // Request domain
    ringDataLayer: any;            // Analytics data
}
```

### WebsiteApiProvider
The main entry point for GraphQL queries to Ring CMS. Implements stale-while-revalidate caching.

### CacheHelper
Abstraction over Redis (production) or NodeCache (development) for key-value caching with TTL and tag-based invalidation.

### Grid System
The layout engine: **Grid → Container → Box → Widget**. CMS defines which widgets go in which boxes within named containers (e.g., "header", "content", "footer").

### WebsitesConfig
JSON configuration objects that define widget parameters for the CMS admin interface. Each widget has a `WebsitesConfig.ts` file with `modules`, `defaultParams`, and `paramsDescription`.

---

## Architecture at a Glance

```
Browser Request
    │
    ▼
Middleware (hat-server: BootServer)
    │ ── Parse URL, detect device, run hooks
    │ ── Query Ring CMS via GraphQL
    │ ── Build HatControllerParams
    ▼
Astro Page ([...path].astro)
    │ ── Map content type (Story/SiteNode/Author/Topic/...)
    │ ── Select route component
    ▼
Layout.astro
    │ ── Load fonts, globals, SEO meta
    │ ── Render Grid
    ▼
Grid → Container → Box → Widget
    │ ── Each widget receives (context, widgetConfig)
    │ ── Widgets fetch data via WebsiteApiProvider
    │ ── ItemParts compose list item fields
    ▼
HTML Response (with cache headers)
```

For the full data flow, see [architecture.md](./architecture.md).
