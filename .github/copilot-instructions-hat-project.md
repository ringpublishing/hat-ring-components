# AI Coding Guidelines — HAT Project Development

> These instructions are for developing a **HAT project** (a website built with the HAT framework).
> For framework-level docs, see the detailed documentation at:
> `node_modules/hat-ring-components/.github/docs/instructions/index.md`

## Communication & Reasoning Style

- Be critical and analytical, not automatically supportive.
- Challenge ideas, show weaknesses and risks.
- Ask probing questions instead of only answering.
- If you don't know something, admit it clearly — never make things up.
- Keep a realistic, balanced tone (neither overly optimistic nor cynical).
- Act like a thoughtful discussion partner, not a cheerleader.

### About the user

- Values intellectual honesty over politeness.
- Prefers realism, tough questions, and constructive confrontation.
- Respects clear admission of uncertainty more than guesses.
- Wants ideas treated as hypotheses to test, not as truths to confirm.

---

## Quick Reference — Detailed Docs

When you need detailed information on a specific topic, load the corresponding doc:

| Topic | File |
|-------|------|
| Architecture & data flow | `node_modules/hat-ring-components/.github/docs/instructions/architecture.md` |
| Widget system | `node_modules/hat-ring-components/.github/docs/instructions/widgets.md` |
| SCSS & styling | `node_modules/hat-ring-components/.github/docs/instructions/styling.md` |
| Grid layout | `node_modules/hat-ring-components/.github/docs/instructions/grid.md` |
| Helper functions | `node_modules/hat-ring-components/.github/docs/instructions/helpers.md` |
| GraphQL queries | `node_modules/hat-ring-components/.github/docs/instructions/graphql.md` |
| Server & middleware | `node_modules/hat-ring-components/.github/docs/instructions/server.md` |
| SEO system | `node_modules/hat-ring-components/.github/docs/instructions/seo.md` |
| Pages & routing | `node_modules/hat-ring-components/.github/docs/instructions/routing.md` |
| Slots (inline embeds) | `node_modules/hat-ring-components/.github/docs/instructions/slots.md` |
| Configuration & env vars | `node_modules/hat-ring-components/.github/docs/instructions/configuration.md` |

**Tip:** Only read the doc relevant to your current task. Don't load all docs at once.

---

## HAT Project Structure

```
your-project/
├── .github/
│   └── copilot-instructions.md    # Project-specific identity (fonts, colors, widgets)
├── src/
│   ├── components/
│   │   ├── widgets/               # Project-specific widgets
│   │   │   ├── BasicWidget/       # Override framework BasicWidget (custom itemParts)
│   │   │   ├── GenericList/       # Override framework GenericList
│   │   │   └── YourCustomWidget/  # Project-only widgets
│   │   ├── slots/                 # CMS slots (inline content embeds)
│   │   ├── common/                # Shared project components
│   │   ├── auth/                  # Authentication components (if needed)
│   │   └── index.ts               # Widget exports
│   ├── helpers/                   # Project-specific helpers
│   ├── layouts/
│   │   └── Layout.astro           # Main layout (fonts, globals, SEO, Grid)
│   ├── pages/
│   │   ├── index.astro            # Homepage
│   │   ├── [...path].astro        # Catch-all content route
│   │   ├── routes/                # Content type routes (Story, SiteNode, etc.)
│   │   └── api/                   # API endpoints
│   ├── styles/
│   │   ├── globals.scss           # CSS variables, fonts, global styles
│   │   ├── breakpoints.scss       # Responsive breakpoints
│   │   ├── icons.scss             # Icon font map + mixin
│   │   └── *.module.scss          # Component styles
│   ├── widgets.ts                 # Widget & slot registration
│   ├── cssModules.ts              # CSS Module imports → context injection
│   ├── middleware.ts              # Request middleware config
│   └── consts.ts                  # Project constants
├── config/                        # URL mappings, static configs
├── public/                        # Static assets (fonts, images)
├── astro.config.mjs               # Astro configuration
├── websiteManagerConfigs.ts       # Aggregated CMS widget params
└── package.json
```

---

## Common Tasks

### Creating a New Widget

1. **Create the directory:**
   ```
   src/components/widgets/YourWidget/
   ├── YourWidget.astro
   ├── YourWidgetWebsitesConfig.ts
   └── types.ts
   ```

2. **Write the component** (`YourWidget.astro`):
   ```astro
   ---
   import { WidgetHelper_shouldHideWidget, WidgetHelper_renderEmptyWidget, WidgetHelper_getWidgetCssClasses } from "hat-ring-components";
   import type { AppContext } from "hat-ring-components";
   import type { YourWidgetConfig } from "./types";

   const { context, widgetConfig } = Astro.props as {
       context: AppContext;
       widgetConfig: YourWidgetConfig;
   };

   // 1. Validate
   if (WidgetHelper_shouldHideWidget(widgetConfig, context)) {
       return WidgetHelper_renderEmptyWidget(widgetConfig);
   }

   // 2. Fetch data (if needed)
   // const data = await WebsiteApiProvider.call(query, variables);

   // 3. Process
   const cssClasses = WidgetHelper_getWidgetCssClasses('YourWidget', widgetConfig, context);
   ---

   <div class={cssClasses}>
       <!-- Widget content -->
   </div>
   ```

3. **Define types** (`types.ts`):
   ```typescript
   import type { AbstractWidgetConfig } from "hat-ring-components";
   export interface YourWidgetConfig extends AbstractWidgetConfig {
       customParam?: string;
   }
   ```

4. **Register** in `src/components/index.ts`:
   ```typescript
   export { default as YourWidget } from "./widgets/YourWidget/YourWidget.astro";
   ```

5. **Add CMS config** (`YourWidgetWebsitesConfig.ts`):
   ```typescript
   export let YourWidgetWebsitesConfig = {
       modules: {
           "yourWidget_wdg": {
               name: "Your Widget",
               defaultParams: { customParam: "default" },
               paramsDescription: {
                   customParam: { name: "Custom Parameter", type: "textfield" }
               }
           }
       }
   };
   ```

6. **Style it** (`src/styles/YourWidget/YourWidget.module.scss`):
   ```scss
   @import "../breakpoints";
   .YourWidget.YourWidget {
       :global { /* content styles */ }
   }
   ```

### Adding Custom ItemParts to BasicWidget

1. Create `src/components/widgets/BasicWidget/itemParts/YourPart.astro`
2. Export component + fragment:
   ```astro
   ---
   export const getFragment = () => ({
       query: gql`fragment YourPartFragment on SectionItem { yourField }`,
       variables: {}
   });
   const { data } = Astro.props;
   ---
   <div class="YourPart">{data.yourField}</div>
   ```
3. Register in `itemParts/index.ts`

### Adding a Custom Slot

1. Create `src/components/slots/YourSlot/YourSlot.astro`
2. Export from `src/components/slots/index.ts`
3. Slot appears in `widgets.ts` slots export

### Adding a Custom Helper

```typescript
// src/helpers/YourHelper.ts
import { CacheHelper_get, CacheHelper_set } from "hat-ring-components";

export async function YourHelper_getData(): Promise<any> {
    const key = JSON.stringify({ type: 'your-data' });
    const cached = await CacheHelper_get(key);
    if (cached) return cached;

    const data = /* fetch from API */;
    await CacheHelper_set(key, data, 3600, ['your-tag']);
    return data;
}
```

### Overriding a Framework Widget

Export a widget with the **same name** as a framework widget from `src/components/index.ts`. Due to `Object.assign` order in `widgets.ts`, the project version takes precedence:
```typescript
// This BasicWidget overrides the framework's BasicWidget
export { default as BasicWidget } from "./widgets/BasicWidget/BasicWidget.astro";
```

### Creating Widget Aliases

Map CMS widget names to framework widgets in `widgets.ts`:
```typescript
export const widgets = Object.assign({},
    ringWidgets,
    localWidgets,
    { OldWidgetName: ringWidgets.NewWidgetName },
);
```

### Adding Custom Pages

```astro
---
// src/pages/custom-page.astro
import Layout from "../layouts/Layout.astro";
---
<Layout context={context}>
    <div>Custom page — no Grid needed</div>
</Layout>
```

### Adding API Endpoints

```typescript
// src/pages/api/my-endpoint.ts
export async function POST({ request }) {
    const body = await request.json();
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
```

---

## Build & Run

```bash
npm run dev          # Start the local dev server (uses hatcli + astro dev under the hood)
npm run build        # Production build (astro check && astro build)
npm run localBuild   # Local build via hatcli with .env
npm run preview      # Preview production build
npm run lint:js      # ESLint (.js/.jsx/.ts/.tsx)
```

**Local development:** Always use `npm run dev` to start the project locally. Do **not** call `astro dev` or `hatcli` directly — `npm run dev` wraps both with the correct environment (dotenv + hatcli).

---

## Editing Global vs Project Instructions

- **Global instructions** (shared across all HAT projects) live in `hat-ring-components`:
  - Generic project guidelines: `node_modules/hat-ring-components/.github/copilot-instructions-hat-project.md` (this file)
  - Topic-specific docs: files listed in `node_modules/hat-ring-components/.github/docs/instructions/index.md`
  - Agent core prompts: `node_modules/hat-ring-components/.github/docs/agents/`
- **Project-specific instructions** live in each project's `.github/copilot-instructions.md` — they extend or override global guidelines.

When you need to add or change something that applies to **all HAT projects**, edit the files inside `hat-ring-components`. When the change is **project-specific only**, edit the project's `.github/copilot-instructions.md`.

---

## Key Conventions

1. **Widget registration** — All widgets in `widgets.ts`, all slots in `slots` export
2. **CSS Modules** — Use `.module.scss`, inject via `cssModules.ts`
3. **Helper naming** — Exported functions named like the framework: `<HelperFile>_<verb><What>` (e.g. `CacheHelper_set`, `UtilsHelper_getDomain`, `YourHelper_getData` in `src/helpers/YourHelper.ts`); the name says what the function returns or does, without abbreviations. Existing names are not renamed outside the task.
4. **Cache keys** — Always `JSON.stringify()` for consistency
5. **Widget lifecycle** — Always validate → fetch → process → render
6. **Empty widgets** — Return `WidgetHelper_renderEmptyWidget()`, never `null`
7. **Images** — Use `RingImage` component with `transform` prop
8. **Dates** — Use `DateHelper_convertDate` or `DateHelper_fromNow` with project template
9. **Config** — Use `ConfigHelper_getGeneralConfig(context)` for site settings
10. **Breakpoints** — Mobile-first: base = mobile, `@media (min-width: $breakpoint-md)` for tablet+
11. **No unnecessary splitting into functions** — Add a separate function only when it is used in more than one place or the project or framework already has the same helper; code used once stays inline in the function that needs it. Do not split moved or existing code into smaller one-use functions, and after removing or moving code inline functions left with one caller and drop exports used only in their own file.

---

## Monitoring

Use `MonitoringProvider` from `hat-ring-components` for all application metrics (counters, gauges, timers).

### Metric naming convention

Metric names follow a **dot-separated 3-segment** pattern:

```
{level}.{Source_methodName}.{metricDescription}
```

| Segment | Description | Examples |
|---------|-------------|----------|
| `level` | `info` for normal events, `error` for failures | `info`, `error` |
| `Source_methodName` | PascalCase class/module + underscore + camelCase method | `MyProvider_fetchData`, `HatServer_callToWebsitesApi` |
| `metricDescription` | camelCase short description of the event | `apiCall`, `success`, `httpError`, `networkError`, `cacheHit` |

### Examples

```ts
import { MonitoringProvider } from "hat-ring-components";

// Counter — track occurrences
MonitoringProvider.counter('info.MyProvider_fetchData.apiCall');
MonitoringProvider.counter('info.MyProvider_fetchData.success');
MonitoringProvider.counter('error.MyProvider_fetchData.httpError');
MonitoringProvider.counter('error.MyProvider_fetchData.networkError');

// Timer — measure duration (always null-check before calling .done())
const timer = MonitoringProvider.timer('info.MyProvider_fetchData.responseTime');
// ... perform operation ...
if (timer) {
    timer.done();
}

// Gauge — track current value
MonitoringProvider.gauge('info.CacheProvider_getStats.cacheSize', 42);
```

### Rules

- Always start with `info.` or `error.` depending on severity.
- Use PascalCase for the source class/module, underscore separator, then camelCase for the method.
- Always guard `timer.done()` with a null check (`if (timer) { timer.done(); }`).
- Place the timer start **before** the operation and call `done()` in both success and error paths.

---

## Project Identity

Each HAT project defines its own identity in `.github/copilot-instructions.md`:
- **Site name, language, domain**
- **Font families** (CSS variables: --font-primary, --font-primary-sans, --font-icons)
- **Brand color palette** (CSS variables)
- **Icon font** (icon map in icons.scss)
- **Widget aliases** (old CMS names → framework widgets)
- **Project-specific widgets** (custom widgets + their purpose)
- **Project helpers** (custom helper classes)
- **Special pages** (non-CMS pages like auth, admin, search)
- **Middleware overrides** (custom early returns, skipped paths)
