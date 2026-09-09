# hat-ring-components — Documentation

`hat-ring-components` is the shared component library for **HAT** (Head App Template) projects —
[Astro](https://astro.build/)-based frontends for websites powered by Ring Publishing.

The library ships everything a publishing site needs out of the box: a configuration-driven grid,
a catalogue of content widgets, SEO and structured-data components, caching, monitoring and a
Playwright test suite. A consuming project supplies routing, styling and any domain-specific widgets.

The central idea:

> **You do not build pages. You build a catalogue of blocks and a page skeleton.
> The pages themselves are assembled by editors and product owners in Websites Manager — without a deployment.**

---

## Table of contents

| Document | What it covers |
|---|---|
| [Architecture](./architecture.md) | Layers, responsibilities, request lifecycle, the grid model, widget dispatch |
| [Widget catalogue](./widget-catalog.md) | Every widget the library exposes, with its configurable parameters |
| [Building a site](./building-a-site.md) | The product-level workflow: from an empty project to a live page |
| [Extending the library](./extending.md) | Extension points, custom widgets, custom content blocks, slots |
| [Configuration model](./configuration.md) | Websites Manager hierarchy, global settings, grid containers |
| [API reference](./api-reference.md) | Helpers, providers, SEO renderless components, shared components |
| [Testing](./testing.md) | Ready-made Playwright suites and test helpers |

---

## Quick orientation

```
hat-ring-components/
├── src/
│   ├── index.ts                 # public entry point — widgets, helpers, providers
│   ├── websitesApiConfigs.ts    # public entry point — Websites Manager configuration
│   ├── clientWidgets.ts         # client-side (browser) widget entry point
│   ├── components/
│   │   ├── Grid/                # Grid → Container → Box → Widget dispatch
│   │   ├── widgets/             # the widget catalogue
│   │   ├── common/              # shared building blocks (images, links, head)
│   │   └── seo/SchemaOrg/       # JSON-LD structured data
│   ├── renderlessComponents/    # SEO meta, alternates, RSS — return data, render nothing
│   ├── helpers/                 # cache, config, SEO, dates, images, utils
│   ├── providers/               # Websites API, cache, Redis, translations, monitoring
│   ├── adapters/cache/          # NodeCache / Redis adapters
│   ├── configs/                 # global Websites Manager sections
│   ├── pages/                   # HatAdmin, Grid Edit tooling
│   └── tests/                   # reusable Playwright suites
└── styles/                      # neutral SCSS modules (projects supply the skin)
```

Two things are always imported in pairs:

- **`hat-ring-components`** — the runtime components and helpers.
- **`hat-ring-components/src/websitesApiConfigs`** — the matching configuration schema shown in Websites Manager.

A widget only becomes usable once *both* are registered in the consuming project.
