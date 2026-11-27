> **When to read:** You're creating, editing, debugging, or extending a widget in a HAT project.

---

# HAT Widget System

## 1. Widget Anatomy

Every widget is an Astro component that receives exactly two props:

```typescript
const { context, widgetConfig } = Astro.props as {
  context: AppContext;
  widgetConfig: SpecificWidgetConfig;
};
```

### `context` — Global Page Context

The `context` object carries everything the page knows about the current request:

| Field | Description |
|---|---|
| `id` | The UUID of the current content item (story, section, etc.) |
| `contentType` | Type of the current page (`story`, `section`, `page`, etc.) |
| `url` | The current request URL |
| `hatControllerParams` | Parameters from the HAT controller (layout, grid, route info) |
| `cssModules` | Map of CSS module class names for scoped styling |
| `gridLocation` | Which grid area the widget is placed in |
| `device` | Detected device type (`desktop`, `mobile`) |

### `widgetConfig` — Widget-Specific Configuration

The `widgetConfig` is a CMS-defined object that extends `AbstractWidgetConfig`. It tells the widget how to behave and what to display.

**AbstractWidgetConfig fields:**

| Field | Type | Description |
|---|---|---|
| `module` | `string` | The widget module identifier (e.g., `"basicWidget_wdg"`) |
| `widgetType` | `string` | The widget type name used for component resolution |
| `platformDesktop` | `boolean` | Whether the widget renders on desktop |
| `platformMobile` | `boolean` | Whether the widget renders on mobile |
| `customClass` | `string` | Additional CSS class(es) from CMS admin |
| `customPosition` | `"none" \| "left" \| "center" \| "right"` | Alignment override |
| `customWidth` | `number` (1–12) | Grid column span (12-column grid system) |

Each widget type extends this with its own fields (e.g., `showOptions`, `count`, `columns`, `sectionId`).

---

## 2. Widget Lifecycle

Every widget follows a consistent five-phase lifecycle:

```
1. IMPORT    — dependencies, helpers, types
2. VALIDATE  — check if widget should render
3. FETCH     — call WebsiteApiProvider or use pre-fetched response
4. PROCESS   — transform data, apply business logic
5. RENDER    — output HTML with proper CSS classes
```

### Phase 1: IMPORT

```typescript
import { WidgetHelper_shouldHideWidget, WidgetHelper_renderEmptyWidget, WidgetHelper_getWidgetCssClasses } from "hat-ring-components";
import type { AppContext } from "hat-ring-components";
import type { MyWidgetConfig } from "./types";
```

### Phase 2: VALIDATE

```typescript
if (WidgetHelper_shouldHideWidget(widgetConfig, context)) {
  return WidgetHelper_renderEmptyWidget(widgetConfig);
}
```

This is the **early-return gate**. The widget checks platform flags and grid location to decide if it should render at all. If the widget should be hidden, it returns an empty HTML comment and stops execution.

### Phase 3: FETCH DATA

```typescript
const response = widgetConfig?.response
  || await WebsiteApiProvider.call(query, variables, widgetConfig?.cacheTTL);
```

Widgets either receive pre-fetched data via `widgetConfig.response` or make their own GraphQL calls through `WebsiteApiProvider`.

### Phase 4: PROCESS

```typescript
const items = response?.data?.section?.items?.edges || [];
const processedItems = items.map(edge => transformItem(edge.node));
```

Transform raw API data into the shape the template needs. Apply filtering, sorting, and business logic here.

### Phase 5: RENDER

```astro
<div class={WidgetHelper_getWidgetCssClasses("MyWidget", widgetConfig, context)}>
  <!-- widget HTML -->
</div>
```

Always use `WidgetHelper_getWidgetCssClasses` for the widget's root element to ensure consistent class naming.

---

## 3. WidgetHelper Functions

### `WidgetHelper_shouldHideWidget(widgetConfig, context)`

**Returns:** `boolean`

Determines whether a widget should be hidden from rendering. Checks:

- **Platform flags:** If the current device is mobile and `platformMobile` is `false`, the widget is hidden. Same logic applies for desktop and `platformDesktop`.
- **Grid location:** If a `gridLocation` query parameter is present and doesn't match the widget's assigned grid area, the widget is hidden.

**Usage:**
```typescript
if (WidgetHelper_shouldHideWidget(widgetConfig, context)) {
  return WidgetHelper_renderEmptyWidget(widgetConfig);
}
```

Always call this as the **first check** in every widget, before any data fetching.

---

### `WidgetHelper_renderEmptyWidget(widgetConfig, text?)`

**Returns:** `string` (HTML comment)

Produces an invisible HTML comment placeholder: `<!-- widget hidden -->`. This keeps the DOM clean while preserving the widget's slot in the layout for debugging purposes.

**Parameters:**
- `widgetConfig` — The widget's config (used to include the widget name in the comment for debugging)
- `text` (optional) — Custom text to include in the comment

**Usage:**
```typescript
// Standard early return
return WidgetHelper_renderEmptyWidget(widgetConfig);

// With custom message
return WidgetHelper_renderEmptyWidget(widgetConfig, "no items found");
```

---

### `WidgetHelper_getWidgetCssClasses(componentName, widgetConfig, context, additionalClasses?)`

**Returns:** `string`

Builds the complete CSS class string for a widget's root element. The returned string includes:

1. **Component name** — The widget's base class (e.g., `"BasicWidget"`)
2. **CSS modules** — Scoped class names from `context.cssModules`
3. **Custom width class** — Grid column class derived from `widgetConfig.customWidth` (1–12)
4. **Custom position class** — Alignment class from `widgetConfig.customPosition` (`left`, `center`, `right`)
5. **Custom class** — Any additional class(es) set by the CMS admin via `widgetConfig.customClass`
6. **Additional classes** — Extra classes passed by the component itself

**Usage:**
```typescript
// Basic
const classes = WidgetHelper_getWidgetCssClasses("MyWidget", widgetConfig, context);

// With additional classes
const classes = WidgetHelper_getWidgetCssClasses("MyWidget", widgetConfig, context, ["featured", "highlighted"]);
```

**Always use this function** for the root element of every widget. It ensures consistent class naming and CMS-driven styling.

---

### `WidgetHelper_findWidgetConfig(context, objToCompare, containers, boxes)`

**Returns:** Widget config object or `undefined`

Queries the CMS layout configuration to find a widget's config within specified containers and boxes. This is useful when:

- A widget needs to find its own config (when not passed directly)
- A widget needs to locate another widget's config to read its settings
- You need to check if a specific widget exists in the current layout

**Parameters:**
- `context` — The page context
- `objToCompare` — Object with properties to match against (e.g., `{ widgetType: "MyWidget" }`)
- `containers` — Array of container names to search within
- `boxes` — Array of box names to search within

**Usage:**
```typescript
const otherWidgetConfig = WidgetHelper_findWidgetConfig(
  context,
  { widgetType: "RelatedStories" },
  ["main"],
  ["content"]
);

if (otherWidgetConfig) {
  // The RelatedStories widget exists in this layout
}
```

---

## 4. BasicWidget Pattern

BasicWidget is the most common and versatile widget type in the HAT framework. It displays lists of content items (stories) in configurable layouts.

### Directory Structure

```
BasicWidget/
├── BasicWidget.astro           — Main component (lifecycle orchestrator)
├── BasicWidgetGetData.ts       — Data fetching via GraphQL
├── types.ts                    — BasicWidgetConfig, BasicWidgetResponse types
├── generalParts/               — Layout-level components
│   ├── Header.astro            — Section/widget header
│   ├── Description.astro       — Section description text
│   ├── Button.astro            — "Show more" / CTA button
│   ├── SectionElements.astro   — Grid/list of items (primary layout)
│   └── ListElements.astro      — Alternative list layout
└── itemParts/                  — Item-level components
    ├── Title.astro             — Story title
    ├── Image.astro             — Story image
    ├── Lead.astro              — Story excerpt
    ├── PublicationDate.astro   — Publication date
    ├── Authors.astro           — Author info
    ├── Taxonomies.astro        — Tags/categories
    └── index.ts                — Exports components + getFragment functions
```

### Rendering Flow

```
1. WidgetHelper_shouldHideWidget → early return if hidden
2. BasicWidget_getData(context, "", widgetConfig, extendableAttributes)
   └── Collects getFragment() from all active itemParts
   └── Builds composite GraphQL query
   └── Calls WebsiteApiProvider
3. Extract edges: response.data.section.items.edges
4. If HideWhenNoSectionItems is set and edges is empty → renderEmptyWidget
5. Render generalParts based on widgetConfig.generalShowOptions
6. Each generalPart iterates edges and renders itemParts per widgetConfig.showOptions
```

### `customId`

"Custom CSS ID" (BasicWidget only): rendered as the `id` of the widget root element, e.g. the target of a `#anchor`
link in a menu (same field as in Universal Template). It is optional: configurations saved before the field existed
do not have it, so the template renders no `id` when it is missing, empty or not a string.

### `generalShowOptions`

An array that controls which layout-level sections render. Values map directly to GeneralParts components:

```typescript
generalShowOptions: ["header", "description", "sectionElements", "listElements", "button"]
```

| Value | Component | Description |
|---|---|---|
| `"header"` | `Header.astro` | Widget heading/title |
| `"description"` | `Description.astro` | Descriptive text below header |
| `"sectionElements"` | `SectionElements.astro` | Primary item grid/layout |
| `"listElements"` | `ListElements.astro` | Alternative compact list layout |
| `"button"` | `Button.astro` | CTA or "show more" link |

### `showOptions`

An array that controls which fields render for each individual item:

```typescript
showOptions: ["image", "title", "publicationDate", "lead", "authors"]
```

Each value corresponds to an itemPart component. Only the listed itemParts are rendered, and only their GraphQL fragments are included in the query.

### Data Fetching: `BasicWidget_getData`

```typescript
const response = await BasicWidget_getData(context, "", widgetConfig, extendableAttributes);
```

**Parameters:**
- `context` — Page context
- `""` — Query modifier (usually empty string)
- `widgetConfig` — The BasicWidget configuration
- `extendableAttributes` — Object containing custom `itemParts` (for project extensions)

**What it does:**
1. Reads `widgetConfig.showOptions` to determine which itemParts are active
2. Calls `getFragment()` on each active itemPart to collect GraphQL fragments
3. Combines fragments into a single optimized query
4. Executes the query via `WebsiteApiProvider`
5. Returns the full response

---

## 5. ItemParts System

ItemParts are the building blocks for rendering individual fields within content lists. They follow a composable, lazy-loaded architecture.

### Export Contract

Every itemPart module must export two things:

```typescript
// itemParts/MyField.astro — The rendering component
export default MyFieldComponent;

// itemParts/MyField.ts (or within index.ts)
export function getFragment() {
  return {
    query: gql`
      fragment MyFieldFragment on Story {
        myField {
          value
        }
      }
    `,
    variables: {},
  };
}
```

- **`default`** — The Astro (or React) component that renders the field
- **`getFragment()`** — Returns the GraphQL fragment this part requires

### Lazy-Loading Pattern

The key insight is that **only fragments for visible itemParts are included in the query**. If `showOptions` doesn't include `"authors"`, the Authors fragment is never sent to the API. This keeps queries minimal and performant.

```
showOptions: ["image", "title"]
  → getFragment() called on Image and Title only
  → Query includes only image and title fragments
  → Only Image and Title components render
```

### Built-in ItemParts

#### Title
Renders the story title. Supports `displayTitleCodeName` for alternative title sources. Generates SEO-appropriate heading tags (`h1`–`h6`) based on widget configuration.

#### Image
Renders the story's main image. Supports:
- Dimension presets (`big`, `standard`)
- Image preloading for above-the-fold items
- Aspect ratio constraints
- Uses the `RingImage` component for responsive images

#### Lead
Renders the story's lead text or excerpt. Typically displayed below the title.

#### PublicationDate
Formats and renders the story's publication date using `DateHelper`. Supports relative time formatting (e.g., "2 hours ago") and absolute date formats.

#### ModificationDate
Shows the last-modified timestamp of the story. Useful for content that gets frequent updates.

#### Authors
Renders author names and optionally author images. Can display single or multiple authors.

#### Taxonomies
Renders the story's tags and categories as a list of links. Used for topic navigation.

#### TitleAddons
Renders additional title elements sourced from the story's titles array. Controlled by `extraTitleCodeNames` configuration.

---

## 6. Story Widget Pattern

Story widgets render data for a **single story** (the current page's content item), unlike BasicWidget which renders lists.

### Key Differences from BasicWidget

| Aspect | BasicWidget | Story Widget |
|---|---|---|
| Data scope | List of items (section query) | Single item (`context.id`) |
| Query style | Composite from itemPart fragments | Self-contained GQL query |
| Data source | Always fetches via `BasicWidget_getData` | May use `widgetConfig.response` or self-fetch |
| Config | `showOptions`, `generalShowOptions` | Widget-specific fields |

### Standard Story Widget Pattern

```astro
---
import { gql } from "graphql-tag";
import { WebsiteApiProvider } from "hat-ring-components";

const { context, widgetConfig } = Astro.props as {
  context: AppContext;
  widgetConfig: StoryWidgetConfig;
};

const query = gql`
  query ($storyId: UUID) {
    story(id: $storyId) {
      title
      lead
      content
      # ... fields specific to this widget
    }
  }
`;

let response =
  widgetConfig?.response ||
  (await WebsiteApiProvider.call(query, { storyId: context.id }, widgetConfig?.cacheTTL));
---

<div class={WidgetHelper_getWidgetCssClasses("StoryTitle", widgetConfig, context)}>
  {response?.data?.story?.title}
</div>
```

### Pre-fetched Response Pattern

Story widgets often receive data through `widgetConfig.response`. This happens when:
- The HAT controller pre-fetches story data for performance
- Multiple story widgets share the same base query
- Data is passed from a parent layout

Always check `widgetConfig?.response` **before** making a new API call:

```typescript
let response = widgetConfig?.response
  || await WebsiteApiProvider.call(query, { storyId: context.id }, widgetConfig?.cacheTTL);
```

### Common Story Widgets

- **StoryTitle** — Renders the story headline
- **StoryContent** — Renders the full story body (rich text, embeds, etc.)
- **StoryMainImage** — Renders the story's hero/featured image
- **StoryDate** — Renders publication/modification dates
- **StoryTaxonomyList** — Renders tags and categories for the story
- **GooglePreferredSource** — Link or button (`displayType`) to add the site as a preferred source in Google Search (Google script only with TCF consent, otherwise a deeplink); text from `text` or translated (`TranslationProvider`); sites style it via `cssModules.GooglePreferredSource` and can replace the Google logo with their own `GooglePreferredSourceIcon` widget

---

## 7. Widget Registration

Widgets are registered in the project's `src/widgets.ts` file. This file defines which widgets are available for the CMS to use.

### Registration Structure

```typescript
import * as ringWidgets from "hat-ring-components";
import * as localWidgets from "./components";
import * as localSlots from "./components/slots";

export const widgets = Object.assign(
  {},
  ringWidgets,       // 1. All framework widgets (base)
  localWidgets,      // 2. Project-specific widgets (override by name)
  {                  // 3. Aliases for CMS compatibility
    AliasName: ringWidgets.OriginalName,
  }
);

export const slots = Object.assign({}, localSlots);
```

### Override Pattern

Because `Object.assign` processes sources left-to-right, later sources override earlier ones. If your project exports a widget with the **same name** as a framework widget, the project version takes precedence:

```typescript
// Framework provides: ringWidgets.BasicWidget
// Project provides:   localWidgets.BasicWidget
// Result: localWidgets.BasicWidget wins

export const widgets = Object.assign(
  {},
  ringWidgets,      // BasicWidget from framework
  localWidgets,     // BasicWidget from project overrides it
);
```

This is the standard way to customize framework widgets without modifying `node_modules`.

### Alias Pattern

Map CMS-defined widget names to framework widget components. This is essential when the CMS uses legacy or alternative names:

```typescript
export const widgets = Object.assign(
  {},
  ringWidgets,
  localWidgets,
  {
    DetailTitle: ringWidgets.StoryTitle,
    DetailMainImage: ringWidgets.StoryMainImage,
    DetailContent: ringWidgets.StoryContent,
  }
);
```

When the CMS references `DetailTitle`, the framework resolves it to `StoryTitle`.

### Slots

Slots are special components injected into predefined positions within other widgets (e.g., within story content). They are registered separately:

```typescript
export const slots = Object.assign({}, localSlots);
```

---

## 8. WebsitesConfig Pattern

Every widget defines its CMS parameters through a `WebsitesConfig.ts` file. These configurations control what the CMS admin interface displays for each widget.

### Structure

```typescript
import { AbstractWebsitesWidgetConfigDefaultParams } from "hat-ring-components";

export let MyWidgetWebsitesConfig = {
  modules: {
    myWidget_wdg: {
      name: "My Widget",
      description: "Description visible to CMS administrators",
      defaultParams: {
        ...AbstractWebsitesWidgetConfigDefaultParams,
        showOptions: ["image", "title"],
        count: 10,
        columns: 2,
      },
      paramsDescription: {
        showOptions: {
          name: "Fields to display",
          type: "select",
          multiSelect: true,
          items: ["image", "title", "lead", "publicationDate", "authors"],
        },
        count: {
          name: "Number of items",
          type: "textfield",
        },
        columns: {
          name: "Grid columns",
          type: "select",
          items: ["1", "2", "3", "4"],
        },
      },
    },
  },
};
```

### Key Parts

**`modules`** — Object keyed by widget module ID (convention: `camelCaseName_wdg`).

**`name`** — Human-readable widget name for the CMS admin.

**`description`** — Help text for CMS administrators.

**`defaultParams`** — Default configuration values. Always spread `AbstractWebsitesWidgetConfigDefaultParams` to include base fields (platformDesktop, platformMobile, customClass, etc.).

**`paramsDescription`** — Defines the CMS admin form fields:

| `type` | Description |
|---|---|
| `"textfield"` | Simple text input |
| `"select"` | Dropdown (single or multi) |
| `"checkbox"` | Boolean toggle |
| `"textarea"` | Multi-line text input |

For `"select"` type, set `multiSelect: true` and provide `items` array for multi-select dropdowns.

### Aggregation

All widget configs are aggregated in the project's `websiteManagerConfigs.ts` at the project root. This file imports every WebsitesConfig and merges them into a single configuration object that the CMS consumes.

---

## 9. Creating a Project-Specific Widget

Follow these steps to create a new widget from scratch.

### Step 1: Create the Directory

```
src/components/widgets/YourWidget/
```

### Step 2: Define Types

**`src/components/widgets/YourWidget/types.ts`**

```typescript
import type { AbstractWidgetConfig } from "hat-ring-components";

export interface YourWidgetConfig extends AbstractWidgetConfig {
  customField: string;
  itemCount: number;
}

export interface YourWidgetResponse {
  data: {
    // Define expected API response shape
  };
}
```

### Step 3: Create the Component

**`src/components/widgets/YourWidget/YourWidget.astro`**

```astro
---
import {
  WidgetHelper_shouldHideWidget,
  WidgetHelper_renderEmptyWidget,
  WidgetHelper_getWidgetCssClasses,
  WebsiteApiProvider,
} from "hat-ring-components";
import type { AppContext } from "hat-ring-components";
import type { YourWidgetConfig } from "./types";

const { context, widgetConfig } = Astro.props as {
  context: AppContext;
  widgetConfig: YourWidgetConfig;
};

// VALIDATE
if (WidgetHelper_shouldHideWidget(widgetConfig, context)) {
  return WidgetHelper_renderEmptyWidget(widgetConfig);
}

// FETCH
const response = await WebsiteApiProvider.call(query, variables, widgetConfig?.cacheTTL);

// PROCESS
const items = response?.data?.items || [];
---

<!-- RENDER -->
<div class={WidgetHelper_getWidgetCssClasses("YourWidget", widgetConfig, context)}>
  {items.map((item) => (
    <div class="YourWidget__item">
      {/* Render item content */}
    </div>
  ))}
</div>
```

### Step 4: Create WebsitesConfig

**`src/components/widgets/YourWidget/YourWidgetWebsitesConfig.ts`**

```typescript
import { AbstractWebsitesWidgetConfigDefaultParams } from "hat-ring-components";

export let YourWidgetWebsitesConfig = {
  modules: {
    yourWidget_wdg: {
      name: "Your Widget",
      description: "Description for CMS admins",
      defaultParams: {
        ...AbstractWebsitesWidgetConfigDefaultParams,
        customField: "",
        itemCount: 5,
      },
      paramsDescription: {
        customField: { name: "Custom Field", type: "textfield" },
        itemCount: { name: "Item Count", type: "textfield" },
      },
    },
  },
};
```

### Step 5: Create Styles

**`src/styles/YourWidget/YourWidget.module.scss`**

```scss
.YourWidget {
  // Widget root styles

  &__item {
    // Item styles
  }
}
```

### Step 6: Export the Widget

**`src/components/index.ts`** — Add the export:

```typescript
export { default as YourWidget } from "./widgets/YourWidget/YourWidget.astro";
```

### Step 7: Register in widgets.ts

The widget is automatically available if exported from `src/components/index.ts`, since `src/widgets.ts` imports `* from "./components"`. If you need an alias, add it explicitly:

```typescript
export const widgets = Object.assign(
  {},
  ringWidgets,
  localWidgets,
  { YourWidgetAlias: localWidgets.YourWidget }
);
```

---

## 10. Extending BasicWidget with Custom ItemParts

The most common extension pattern is adding project-specific itemParts to BasicWidget.

### Step 1: Create the Project BasicWidget

**`src/components/widgets/BasicWidget/BasicWidget.astro`**

```astro
---
import OriginalBasicWidget from "hat-ring-components/src/components/widgets/common/BasicWidget/BasicWidget.astro";
import * as localItemParts from "./itemParts";

const { context, widgetConfig } = Astro.props;

const extendableAttributes = {
  itemParts: localItemParts,
};
---

<OriginalBasicWidget
  context={context}
  widgetConfig={widgetConfig}
  extendableAttributes={extendableAttributes}
/>
```

### Step 2: Create Custom ItemParts

**`src/components/widgets/BasicWidget/itemParts/MyCustomField.astro`**

```astro
---
const { item, widgetConfig, context } = Astro.props;
const value = item?.myCustomField?.value;
---

{value && (
  <span class="BasicWidget__myCustomField">
    {value}
  </span>
)}
```

### Step 3: Export with getFragment

**`src/components/widgets/BasicWidget/itemParts/index.ts`**

```typescript
export { default as MyCustomField } from "./MyCustomField.astro";

import { gql } from "graphql-tag";

export function MyCustomField_getFragment() {
  return {
    query: gql`
      fragment MyCustomFieldFragment on Story {
        myCustomField {
          value
        }
      }
    `,
    variables: {},
  };
}
```

### Step 4: Register the showOption

Add `"myCustomField"` to the widget's `showOptions` in the CMS configuration or `WebsitesConfig.ts` so it can be toggled by CMS admins.

### How It Works

When `BasicWidget_getData` runs:

1. It reads `showOptions` from `widgetConfig`
2. For each option, it looks for a matching `getFragment` function — first in the project's `extendableAttributes.itemParts`, then in the framework's built-in itemParts
3. It collects all fragments and builds the composite query
4. During rendering, it resolves each option to a component using the same lookup order

This means project itemParts **override** framework itemParts with the same name, and new itemParts are seamlessly integrated into the existing data-fetching pipeline.
