# Extending the library

[← Back to index](./README.md)

There are three ways to change what a widget does, in increasing order of cost. Always try the
cheapest one first.

1. **Configure it** — no code. See the [widget catalogue](./widget-catalog.md).
2. **Extend it** — wrap the library widget and inject extra parts.
3. **Replace it** — write a new widget, or export a component under a library widget's name.

---

## 1. Extension points

| Point | What you inject | Typical use |
|---|---|---|
| `extendableAttributes.itemParts` | A component rendering one element of a single teaser | A rating, a comment counter, a badge |
| `extendableAttributes.generalParts` | A component rendering a shared part of a list widget (header, button, pagination) | A bespoke pagination control |
| `extendableAttributes.customGroupBlocks` | A component handling one article block type | A custom embed handler, a named frame with its own layout |
| `extendableAttributes.contentTextTransformers` | A function transforming article text before rendering | Rewriting outbound links, injecting tracking parameters |
| `slots` | A component editors can place inside article content from the CMS | Polls, comparison tables, galleries, ad units |
| `additionalComponents` (configuration only) | Any registered widget, inserted at an interval | Ads or newsletter boxes between list items or paragraphs |
| `feedDecorator` / `blockDecorator` | Functions modifying the RSS feed or a feed item | Custom feed fields, filtered content |

---

## 2. Extending a list widget with a custom teaser part

Create a thin wrapper in the project that merges the library's item parts with its own, then pass
them down through `extendableAttributes`.

```astro
---
// src/components/widgets/Lists/GenericList/GenericList.astro
const { context, widgetConfig } = Astro.props;

import { GenericList as GenericListCore } from "hat-ring-components";
import * as coreItemParts from "hat-ring-components/src/components/widgets/Lists/GenericList/itemParts";
import * as projectItemParts from "./ItemParts";

const itemParts = Object.assign({}, coreItemParts, projectItemParts);
---
<GenericListCore
    widgetConfig={widgetConfig}
    context={context}
    extendableAttributes={{ itemParts }} />
```

```ts
// src/components/widgets/Lists/GenericList/ItemParts/index.ts
export { default as Rating } from "./Rating.astro";
// optional: contribute GraphQL fields required by this part
export { getFragment as Rating_getFragment } from "./Rating.astro";
```

Register the wrapper under the library name so it takes over automatically:

```ts
// src/components/index.ts
export { default as GenericList } from "./widgets/Lists/GenericList/GenericList.astro";
```

Finally, make the new part selectable in Websites Manager by adding it to the existing
`showOptions` list:

```ts
// src/components/widgets/Lists/GenericList/GenericListWebsitesConfig.ts
import { GenericListWebsitesConfig as Base } from "hat-ring-components/src/websitesApiConfigs";

const optionsToAdd = ["rating"];

optionsToAdd.forEach((option) => {
    const items = Base.modules.genericList_wdg.paramsDescription.showOptions.items;
    if (!items.includes(option)) items.push(option);
});

export let GenericListWebsitesConfig = Object.assign({}, Base);
```

The same pattern applies to `BasicWidget` and its `itemParts`.

Data-fetching note: a teaser part that needs extra fields can export a `getFragment` function
alongside the component. The list widget collects those fragments and merges them into its GraphQL
query, so the extra data is fetched in the same round trip rather than in a separate request.

---

## 3. Custom article blocks

`StoryContent` resolves a block by converting its type to a component name
(`groupStart` → `GroupBlock`, `image` → `ImageBlock`, and so on) and looking it up in the block map.
Override or add block types by merging your own map:

```astro
---
// src/components/widgets/Story/StoryContent/StoryContent.astro
const { context, widgetConfig } = Astro.props;

import { StoryContent as StoryContentCore } from "hat-ring-components";
import * as coreBlockTypes
    from "hat-ring-components/src/components/widgets/Story/StoryContent/StoryContentBlocks";
import * as projectBlockTypes from "./customBlockTypes";

const extendableAttributes = {
    customGroupBlocks: Object.assign({}, coreBlockTypes, projectBlockTypes),
    contentTextTransformers: [ /* (text) => transformedText */ ],
};
---
<StoryContentCore
    widgetConfig={widgetConfig}
    context={context}
    extendableAttributes={extendableAttributes} />
```

`customGroupBlocks` serves two purposes:

- keys matching a **block type** (`EmbeddedApplicationBlock`, `ImageBlock`, …) replace the default
  renderer for that type;
- keys matching a **group name** replace the renderer for one specific named frame, so editors can
  create a frame in the CMS and have it rendered by a dedicated component.

---

## 4. Slots

A slot is a component that the **editor** — not the developer, and not the product owner — places
inside the article body. In the CMS the editor inserts a slot of a given kind; at render time
`SlotBlock` converts the kind code to a component name and looks it up in the slot registry.

```
kind code "comparison-table"  →  "ComparisonTable"  →  slots.ComparisonTable
```

```ts
// src/components/slots/index.ts
export { default as ComparisonTable } from "./ComparisonTable.astro";
export { default as Poll } from "./Poll.astro";
export { default as AdUnit } from "./AdUnit.astro";
```

The registry reaches the renderer through the app context:

```ts
PageHelper_mapSearchParamsToAppContext(controllerParams, { widgets, slots }, cssModules);
```

A slot component receives `blockData`, `context` and `widgetConfig`. If the kind code has no
matching component, `SlotBlock` renders a diagnostic placeholder rather than failing.

Slots are the right tool whenever editors need to decide *where in the text* something appears.
Widgets are the right tool when product owners need to decide *where on the page* it appears.

---

## 5. Inserting components into lists and article content

This one is pure configuration. Both `GenericList` and `StoryContent` accept an
`additionalComponents` list, where each entry specifies:

| Field | Meaning |
|---|---|
| `widget` | The `widgetType` to insert (any registered widget) |
| `platformDesktop` / `platformMobile` | Where it appears |
| `customCssClass` | Extra class on the wrapper |
| `limit` | Maximum number of insertions |
| `pattern` | Where to insert — see below |
| `config` | Parameters passed to the inserted widget |

Pattern syntax:

| Pattern | Meaning |
|---|---|
| `n` | After every element |
| `2n+1` | After every second element, starting from the first |
| `n-1` | Before the first element |
| `n+2` | After the second element |

Negative numbers insert before an element; negative multipliers are not supported.

---

## 6. Writing a new widget

The contract is small and identical for every widget.

```
src/components/widgets/MyWidget/
├── MyWidget.astro                 # props: { context, widgetConfig }
└── MyWidgetWebsitesConfig.ts      # module "myWidget_wdg"
```

```astro
---
// MyWidget.astro
const { context, widgetConfig } = Astro.props;

import {
    WidgetHelper_shouldHideWidget,
    WidgetHelper_renderEmptyWidget,
    WidgetHelper_getWidgetCssClasses,
} from "hat-ring-components";
import styles from "../../styles/MyWidget/MyWidget.module.scss";

let toRender: JSX.Element | string | boolean = false;
if (WidgetHelper_shouldHideWidget(widgetConfig, context)) {
    toRender = WidgetHelper_renderEmptyWidget(widgetConfig);
}

const text: string = widgetConfig.text || "";
---
{toRender ? <Fragment set:html={toRender} /> :
    <div class={WidgetHelper_getWidgetCssClasses("MyWidget", widgetConfig, context, [styles.MyWidget])}>
        {text}
    </div>
}
```

```ts
// MyWidgetWebsitesConfig.ts
import {
    AbstractWebsitesWidgetConfigDefaultParams,
    AbstractWebsitesWidgetConfigParamsDescription,
} from "hat-ring-components/src/types/abstracts";

export let MyWidgetWebsitesConfig = {
    sections: [],
    defaultParams: {},
    paramsDescription: {},
    modules: {
        myWidget_wdg: {
            name: "My Widget",
            description: "",
            defaultParams: {
                ...AbstractWebsitesWidgetConfigDefaultParams,
                widgetType: "myWidget",
                text: "",
            },
            paramsDescription: {
                ...AbstractWebsitesWidgetConfigParamsDescription,
                text: {
                    name: "Text",
                    description: "Text shown in the widget",
                    type: "textfield",
                },
            },
        },
    },
};
```

Then wire it up in the project:

| File | Line to add |
|---|---|
| `src/components/index.ts` | `export { default as MyWidget } from "./widgets/MyWidget/MyWidget.astro";` |
| `src/components/websitesApiConfigs.ts` | `export * from "./widgets/MyWidget/MyWidgetWebsitesConfig";` |
| `src/cssModules.ts` | `MyWidget: myWidget.MyWidget` |

Finally publish a new configuration-template version from `/hat-admin`, otherwise the widget will
not be selectable in Websites Manager.

### Rules of thumb

- Always guard with `WidgetHelper_shouldHideWidget` and return `WidgetHelper_renderEmptyWidget`
  rather than nothing — the empty placeholder keeps the grid intact.
- Always build the root class list with `WidgetHelper_getWidgetCssClasses` so the widget picks up
  the project CSS module and the configured custom class.
- Never hard-code copy. Use the translations provider and configuration fields.
- Expose a `cacheTTL` parameter for anything that fetches data.
- Keep client-side JavaScript inside the component as a scoped `<script>` block.

---

## 7. Project-level configuration sections

A project can add its own global settings section — settings that belong to the site as a whole
rather than to one widget instance:

```ts
export let ProjectWebsitesConfig = {
    sections: [
        { title: "My Project", keys: ["myProject"] },
    ],
    defaultParams: {
        myProject: { featureEnabled: true, someUuid: "" },
    },
    paramsDescription: {
        myProject: {
            featureEnabled: { name: "Enable feature", description: "", type: "checkbox" },
            someUuid: { name: "Category UUID", description: "", type: "textfield" },
        },
    },
};
```

Read it back at runtime with `ConfigHelper_getConfig`.

---

## 8. Available parameter field types

Used in `paramsDescription` when describing a widget or configuration section:

| `type` | Renders as |
|---|---|
| `textfield` | Single-line text input |
| `numberfield` | Numeric input |
| `checkbox` | Boolean toggle |
| `select` | Dropdown; `multiSelect: true` for multiple values, `items` for the option list, `allowBlank` to permit an empty value |
| `treeobject` | Repeatable group of fields defined by `properties` |
| `modules` | An ordered, editable list of widgets (used by grid boxes) |

An option in `items` may be a plain string, or a `[value, label]` pair when the stored value and the
displayed label differ.

---

[← Building a site](./building-a-site.md) · [Back to index](./README.md) · [Next: Configuration model →](./configuration.md)
