# Architecture

[← Back to index](./README.md)

---

## 1. Layers and responsibilities

| Layer | Who works here | What they manipulate | Change cycle |
|---|---|---|---|
| **Content** (Story Editor, CMS) | Editorial team | Articles, taxonomies, sections, authors, frames, slots | Immediate |
| **Websites Manager** | Product / technical editors | The grid: containers → boxes → widgets, plus every widget parameter | Immediate (bounded by cache TTL) |
| **HAT project** (Astro app) | Developers | Routing, layout, styling, project widgets, integrations | Deployment |
| **hat-ring-components** | Platform team | Widget catalogue, helpers, SEO, caching | Version bump in the project |

The consequence is that most day-to-day changes to a live site — layout, which widgets appear,
their parameters, SEO templates — require no code and no deployment.

---

## 2. Request lifecycle

```
Incoming request
  │
  ├─ middleware.ts
  │    └─ hat-server: MiddlewareHelper_processRequest
  │         ├─ resolves the site node and content from Websites API
  │         ├─ resolves the active Websites Manager variant
  │         └─ writes the controller params into Astro locals
  │
  ├─ src/pages/[...path].astro   (catch-all route)
  │    ├─ PageHelper_mapSearchParamsToAppContext(params, { widgets, slots }, cssModules)
  │    │     → AppContext
  │    └─ picks a page template based on context.siteContentType
  │
  ├─ Layout.astro
  │    ├─ <head>: SEO meta components, SchemaOrg, fonts, global styles
  │    └─ a Grid rendered inside <SafeHead> for head-level widgets
  │
  └─ routes/<ContentType>.astro
       └─ <Grid containers={[...]} />
            └─ Container       (HTML tag, CSS classes, hide flag)
                 └─ Box        (position + width 1–12)
                      └─ Widget.astro   ← dispatcher
                           └─ the actual widget component
```

---

## 3. `AppContext`

Every widget receives exactly two props: `context` and `widgetConfig`.
`context` is produced once per request by `PageHelper_mapSearchParamsToAppContext`:

| Field | Meaning |
|---|---|
| `siteContentType` | `Homepage`, `SiteNode`, `Story`, `Author`, `Topic`, `Search`, `Source`, `CustomAction`, `Error404` |
| `siteNodeId` | The node in the site tree — the key used to fetch grid configuration |
| `id` | The content id (story, author, topic…) |
| `url` | Current path |
| `domain` | Current domain |
| `websiteManagerVariant` | Active configuration variant |
| `customData.widgets` | **The widget registry** — how the dispatcher resolves a `widgetType` |
| `customData.slots` | The slot registry — components editors can place inside article content |
| `cssModules` | Project CSS-module class map, applied by `WidgetHelper_getWidgetCssClasses` |
| `hatControllerParams` | The raw payload from hat-server, including the GraphQL response |

Because `customData.widgets` lives on the context, a widget can render another widget by name —
this is what powers `additionalComponents` and head-level widget boxes.

---

## 4. The grid model

The grid is a four-level structure, entirely driven by configuration stored in Websites API.

```
Grid          — a set of containers requested by a page template
 └─ Container — container_html_tag (div | section | aside), container_classes, container_hide
     └─ Box   — box_top / box_left / box_middle / box_right / box_bottom
        │       each with *_size (1–12) and *_html_tag
        └─ Widget list, ordered, each with its own parameters
```

| Component | Responsibility |
|---|---|
| `Grid.astro` | Builds one GraphQL query for all requested containers, caches the response |
| `Container.astro` | Renders (or hides) a container and its boxes |
| `Box.astro` | Renders the widget list; validates that `wrapperStart` / `wrapperEnd` widgets are balanced and drops them if not |
| `Widget.astro` | **Dispatcher** — resolves `widgetType` to a component and applies layout classes |

### Widget dispatch

`Widget.astro` takes the `widgetType` string from configuration, upper-cases the first letter and
looks the result up in `context.customData.widgets`:

```
widgetType: "genericList"  →  "GenericList"  →  widgets.GenericList
widgetType: "myWidget"     →  "MyWidget"     →  widgets.MyWidget
```

This is why registering a widget is a one-line export in the consuming project, and why a project
can override a library widget simply by exporting a component under the same name.

### Generated CSS classes

The dispatcher emits a predictable class contract that projects style against:

| Class | Source |
|---|---|
| `gridWidget` | Always |
| `gridWidgetType<WidgetType>` | From `widgetType` |
| `gridWidth<1–12>` | From `customWidth` |
| `gridPosition<Left \| Center \| Right>` | From `customPosition` |
| `gridParent-<class>` | From `customClass`, propagated to the wrapper |
| `gridContainer <sectionName>` | On the container |
| `gridBox <boxName> gridCol<size>` | On the box |

Each widget also gets a stable `id` built by `WidgetHelper_buildWidgetLocation(sectionName, boxName, index)`,
which is what the Grid Edit tooling uses to identify widgets when reordering them.

---

## 5. Content types and page templates

A project maps each `siteContentType` to a template that requests a specific set of grid containers.
The library ships matching configuration schemas for the usual set:

| Content type | Grid configuration | Typical container keys |
|---|---|---|
| Homepage | `GridHomeWebsitesConfig` | `HomePage1` … `HomePage5` |
| Story (article detail) | `GridStoryWebsitesConfig` | `DetailExtendedWidgets1`, `DetailExtendedWidgets2` |
| SiteNode (category / list) | `GridListWebsitesConfig` | `ListExtendedWidgets1`, `ListExtendedWidgets2` |
| Topic (tag) | `GridTopicWebsitesConfig` | `tag_ExtendedWidgets1`, `tag_ExtendedWidgets2` |
| Author | `GridAuthorWebsitesConfig` | `AuthorWidgets1` |
| Search | `GridSearchWebsitesConfig` | `SearchWidgets1` |
| Header / footer (all pages) | `HeaderFooterWebsitesConfig` | `headerWidgets`, `footerWidgets` |

Header and footer containers use their own box names —
`widgets_above_content`, `widgets_middle_content`, `widgets_below_content`, `widgets_additional_box` —
so a page template usually renders three grids: header, body, footer.

A project is free to request more containers than the shipped default (for example four detail
containers instead of two); the container count is a property of the page template, and the matching
configuration is generated by `GridHelper_generateGridConfig(configKey, title, containerCount)`.

---

## 6. Rendering model

- **Server-first.** Widgets are Astro components rendered on the server. Client-side JavaScript is
  opt-in and scoped: interactive widgets ship a `<script>` block, and a small set of browser
  components is exported separately through `clientWidgets.ts`.
- **Renderless SEO.** SEO components are plain async functions returning data objects, not markup.
  A project merges their results and passes the result to its own `<head>`. This keeps meta-tag
  composition testable and avoids duplicated tags.
- **Empty-state contract.** Widgets never throw on missing data. `WidgetHelper_shouldHideWidget`
  decides visibility (platform flags, missing content), and `WidgetHelper_renderEmptyWidget`
  emits a placeholder that keeps the DOM structure and CSS grid intact.

---

## 7. Caching

| Level | Mechanism | Controlled by |
|---|---|---|
| HTTP response | `Cache-Control: public, max-age=…` | Project (environment variable) |
| Widget output | `cacheTTL` parameter | Product, per widget instance |
| GraphQL queries | `CacheProvider` over NodeCache or Redis, keys tagged with content UUIDs | Environment |
| Grid configuration | Cached per node + variant | Environment |
| Invalidation | CMS webhook → `WebhookHelper_POST` → tag-based purge | Automatic |
| Manual purge | Cache scanner helpers and admin pages | Operations |

Tag-based invalidation is what makes per-widget TTLs safe: publishing an article purges every cached
fragment tagged with that article's UUID, regardless of the TTL still remaining.

---

[← Back to index](./README.md) · [Next: Widget catalogue →](./widget-catalog.md)
