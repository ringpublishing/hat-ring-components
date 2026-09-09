# Building a site

[← Back to index](./README.md)

This document describes the product-level workflow: how a working site comes into existence, who is
responsible for each step, and what each kind of change costs.

---

## 1. Anatomy of a consuming project

Every HAT project has the same small set of files that define what the site *can* be. Everything
else is styling and domain-specific code.

| File | Product role |
|---|---|
| `src/widgets.ts` | **Widget registry.** Merges library widgets with project widgets; a project widget with the same name overrides the library one |
| `websiteManagerConfigs.ts` | **Configuration registry.** Determines which forms product owners see in Websites Manager |
| `src/cssModules.ts` | **Style map.** Assigns a project CSS-module class to each widget — the library ships neutral markup, the project supplies the skin |
| `src/layouts/Layout.astro` | `<head>`, the full set of SEO components, structured data, fonts, global styles |
| `src/pages/[...path].astro` | Catch-all route — the whole site is served through it |
| `src/pages/routes/*.astro` | **Page templates** — which grid containers each content type renders |
| `src/middleware.ts` | hat-server boot, cache provider, monitoring, early-return rules |
| `src/components/slots/index.ts` | Slot registry — components editors can place inside article content |
| `src/pages/hat-admin/index.astro` | Publishes the configuration template to Websites Manager |

### The widget registry

```ts
// src/widgets.ts
import * as ringWidgets from "hat-ring-components";
import * as localWidgets from "./components";
import * as localSlots from "./components/slots";

export const widgets = Object.assign(
    {},
    ringWidgets,
    localWidgets,               // project widgets win over library widgets of the same name
    // legacy aliases: older configuration may still use the historical widgetType values
    { DetailTitle: ringWidgets.StoryTitle },
    { DetailMainImage: ringWidgets.StoryMainImage },
    { DetailContent: ringWidgets.StoryContent },
    { DetailTaxonomyList: ringWidgets.StoryTaxonomyList },
    { DetailArticleDate: ringWidgets.StoryDate },
);

export const slots = Object.assign({}, localSlots);
```

### The configuration registry

```ts
// websiteManagerConfigs.ts
import * as ringWidgets from "hat-ring-components/src/websitesApiConfigs";
import * as localWidgets from "./src/components/websitesApiConfigs";

export const websiteManagerConfigs = Object.assign({}, { ...ringWidgets, ...localWidgets });
```

### A page template

```astro
---
// src/pages/routes/Story.astro
const { context } = Astro.props;
import Grid from "hat-ring-components/src/components/Grid/Grid.astro";
---
<header>
    <Grid context={context} config={{
        containers: ["headerWidgets"],
        boxes: ["widgets_above_content", "widgets_middle_content",
                "widgets_below_content", "widgets_additional_box"],
    }} />
</header>

<Grid context={context} config={{
    containers: ["DetailExtendedWidgets1", "DetailExtendedWidgets2"],
}} />

<footer>
    <Grid context={context} config={{
        containers: ["footerWidgets"],
        boxes: ["widgets_above_content", "widgets_middle_content",
                "widgets_under_content", "widgets_additional_box"],
    }} />
</footer>
```

---

## 2. The build loop

### Step 1 — Decide the page templates

Choose how many grid containers each content type gets. This is the only structural decision that
requires code. Two containers on a detail page means product owners get two independently
configurable stacks; four gives finer control at the cost of a more complex configuration screen.

### Step 2 — Register widgets

Export the library widgets the site needs, plus any project widgets, from `src/widgets.ts`.

### Step 3 — Build the skin

The library emits semantic class names through `WidgetHelper_getWidgetCssClasses`; the project maps
each widget to a CSS module in `cssModules.ts`. The same `GenericList` can look completely different
across two sites without any change to the library.

### Step 4 — Publish the configuration template

Open `/hat-admin` (available in development mode only). It:

1. merges **every** `*WebsitesConfig` — library and project — into one JSON structure,
2. sorts modules alphabetically by display name,
3. substitutes the list of available widgets everywhere a modules list is expected,
4. sends it to Websites API as a new configuration-template version
   (`createConfigurationTemplateVersion` / `updateConfigurationTemplateVersion`).

> **This is the moment developer work becomes visible to product owners.** Without it, a new widget
> exists in the code but cannot be placed on a page.

### Step 5 — Assemble pages in Websites Manager

No code involved. Product owners:

- pick a node in the site tree and a configuration variant,
- drag widgets into boxes within a container,
- set every widget parameter (see the [widget catalogue](./widget-catalog.md)),
- set box width (1–12), widget width and position,
- toggle each widget per platform via `platformDesktop` / `platformMobile`.

### Step 6 — Configure global settings

The `General`, `SEO`, `Developer settings` and `Translations` sections cover site name, logo,
languages, SEO title and description templates per page type, date formats, translations and
outbound-link rules. See [Configuration model](./configuration.md).

### Step 7 — Editorial work

Editors produce articles, frames (surfaced by `StoryFrame`), slots (surfaced by `SlotBlock`),
taxonomies, title addons and the CMS sections that feed `BasicWidget`.

### Step 8 — Quality assurance

Run the shipped Playwright suites against real URLs. See [Testing](./testing.md).

---

## 3. Three levels of customisation

Understanding which level a request falls into is the fastest way to estimate it.

| Level | What it covers | Cost | Owner |
|---|---|---|---|
| **1 — Configuration** | Page layout, which widgets appear, every widget parameter, image sizes, pagination, SEO templates, copy | Minutes, no deployment | Product |
| **2 — Extension** | Adding a piece to an existing widget without forking it | Hours plus a deployment | Developer |
| **3 — New widget** | Genuinely new functionality | Days plus a deployment | Developer |

### What is level 1

| Task | No deployment | Deployment |
|---|---|---|
| Reorder, add or remove widgets | ✅ | |
| Change image sizes, column counts, pagination size | ✅ | |
| Toggle teaser elements (lead, author, date, tags) | ✅ | |
| Hide a widget on mobile | ✅ | |
| SEO title and description templates, hreflang, RSS settings | ✅ | |
| Translations, date formats, text replacers | ✅ | |
| Insert an ad after every third list item (`additionalComponents`) | ✅ | |
| **Use** a content slot in an article | ✅ | |
| **Implement** a content slot | | ✅ |
| New page type or new grid container | | ✅ |
| Visual changes (CSS) | | ✅ |
| New widget | | ✅ (plus publishing from `/hat-admin`) |

Levels 2 and 3 are covered in [Extending the library](./extending.md).

---

## 4. Cache and change propagation

A change made in Websites Manager becomes visible once the relevant cache entry expires — not
instantly. This is why `cacheTTL` is configurable per widget instance: a news list might use 60
seconds while a footer uses an hour.

| Layer | Mechanism | Who controls it |
|---|---|---|
| HTTP response | `Cache-Control: public, max-age=…` | Project configuration |
| Widget output | `cacheTTL` parameter | Product, per widget |
| GraphQL queries | `CacheProvider` (Redis or in-memory), tagged with content UUIDs | Environment |
| CMS invalidation | Webhook endpoint backed by `WebhookHelper_POST` → tag-based purge | Automatic |
| Manual purge | Cache admin pages built on the cache helpers | Operations |

A typical project exposes a small set of operational endpoints built from library helpers:

| Endpoint | Backed by |
|---|---|
| Webhook receiver | `WebhookHelper_POST` |
| Clear entire cache | `CacheHelper_flush` |
| Clear by tag | `CacheHelper_clearByTag` |
| Inspect / clear by partial key scan | `CacheScannerHelper_*` and the `CacheScanner` component |
| RSS feed | `RSS` |
| Grid Edit tooling | `hat-ring-components/src/pages/GridEdit` |
| Configuration admin | `HatAdmin` |

---

## 5. Range of what the skeleton supports

The same skeleton — grid, routing, SEO, caching — has been used for very different products:

- a corporate and blog site with multi-language routing and a small set of bespoke widgets;
- a subscription product with accounts, payments, protected pages and a dozen custom widgets;
- an affiliate and price-comparison site with heavy third-party tracking, custom teaser parts and
  custom article blocks.

What changes between them is the widget layer and the integrations. The core does not.

---

## 6. New project checklist

1. Scaffold the project and set the configuration-template name.
2. Pin the `hat-ring-components` and `hat-server` versions.
3. Configure Astro: node adapter, i18n if needed, asset prefix pointing at the image CDN.
4. Wire `middleware.ts` — cache provider, monitoring, early-return rules.
5. Build `src/widgets.ts` — library widgets plus legacy aliases.
6. Build `websiteManagerConfigs.ts`.
7. Write `Layout.astro` — the full SEO component set, `SchemaOrg`, `SafeHead`.
8. Write page templates for `Story`, `SiteNode`, `Topic`, `Author`, plus a homepage and search page
   if they need their own routes.
9. Add `src/styles/*` and `cssModules.ts`.
10. Publish the first configuration-template version from `/hat-admin`.
11. Assemble header, footer and a first page in Websites Manager.
12. Add Playwright specs based on the shipped suites.
13. Add operational endpoints: webhook receiver, cache admin, Grid Edit, RSS feed.

---

[← Widget catalogue](./widget-catalog.md) · [Back to index](./README.md) · [Next: Extending →](./extending.md)
