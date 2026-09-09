# Widget catalogue

[← Back to index](./README.md)

Every widget listed here is exposed twice: as a component through `hat-ring-components`, and as a
Websites Manager module through `hat-ring-components/src/websitesApiConfigs`.

All widgets inherit a common set of parameters from `AbstractWebsitesWidgetConfigParamsDescription`:

| Parameter | Type | Purpose |
|---|---|---|
| `platformDesktop` | checkbox | Render on desktop |
| `platformMobile` | checkbox | Render on mobile |
| `customClass` | text | Extra CSS class, also propagated to the wrapper as `gridParent-<class>` |
| `customPosition` | select | `none`, `left`, `center`, `right` |
| `customWidth` | select | `none`, `1` … `12` |

Most content widgets additionally expose `cacheTTL` (seconds).

---

## Lists and teasers

| Widget | `widgetType` / module | Purpose | Key parameters |
|---|---|---|---|
| **Ring Generic List** | `genericList` / `genericList_wdg` | The main content list — category, topic, search results, or a custom list referenced by UUID | `generalShowOptions` (`items`, `header`, `pagination`, `button`, `infiniteScrollButton`), `showOptions` (`image`, `title`, `taxonomies`, `modificationTime`, `creationTime`, `lead`, `titleAddons`, `authors`), `columns`, `paginationElements`, `postShift`, `perPageAllItems`, `customListUuid`, `imageSize` / `imageSizeMobile`, `imageResizeCropMode`, `preloadImagesCount` (+ mobile), `excludedFlags`, `customTeasers`, `titleAddonsCodeNames`, `mainSeoList`, `additionalComponents`, `useOriginalImage` |
| **Ring Basic** | `basicWidget` / `basicWidget_wdg` | General-purpose box: renders items from a CMS section **or** static elements defined in configuration | `generalShowOptions` (`sectionElements`, `listElements`, `header`, `description`, `button`), `showOptions` (`title`, `lead`, `image`, `publicationDate`, `modificationDate`, `authors`, `taxonomies`, `titleAddons`), `sectionGroup`, `section_name`, `listElements` (tree object), `count`, `offset`, `countBig`, `columns`, `bigImageSize`, `standardImageSize`, `listElementsImageSize` (+ mobile variants), `additionalOptions: hideWhenNoSectionItems` |
| **Topic Title** | `topicTitle` / `topicTitle_wdg` | Title of a topic / tag page | `cacheTTL` |
| **Topic Description** | `topicDescription` / `topicDescription_wdg` | Description of a topic / tag page | `cacheTTL` |

> **Pagination note.** The full-text search API returns at most 1000 items by default. Set the
> `DEEP_PAGINATION_ENABLED=1` environment variable to lift the offset cap in Generic List, its
> pagination helper and the SEO prev/next component.

---

## Article (Story) widgets

| Widget | `widgetType` / module | Purpose | Key parameters |
|---|---|---|---|
| **Story Title** | `detailTitle` / `detailTitle_wdg` | Article headline | `titleTag` (`h1`–`h6`), `cacheTTL` |
| **Story Main Image** | `detailMainImage` / `detailMainImage_wdg` | Lead image with caption, copyright and source metadata | `imageSize`, `imageSizeMobile`, `showLinkToImage` (image page or lightbox), `useOriginalImage`, `imageResizeCropMode`, `cacheTTL` |
| **Story Content** | `detailContent` / `detailContent_wdg` | Renders the article body — all Story Editor block types | `maxImageWidth` / `maxImageHeight` (+ mobile), `displayFrom`, `displayTo`, `ignoredFrameBlocksNames`, `additionalComponents` (with insertion `pattern`), `cacheTTL` |
| **Story Authors** | `storyAuthors` / `StoryAuthors_wdg` | Author box for an article (E-E-A-T signals) | `showOptions`: `image`, `name`, `linkOverlay`, `jobTitle`, `tagline`, `description`, `socialProfiles`, `credentials`, `associations`, `awards`, `books`, `newsletters`, `podcasts`; plus `nameTag`, `imageSize` (+ mobile), `cacheTTL` |
| **Author** | `Author_wdg` | The same component configured for an author landing page | Same as Story Authors (the configuration is cloned) |
| **Story Date** | `detailArticleDate` / `detailArticleDate_wdg` | Publication or modification date | `dateType` (`modificationTime`, `creationTime`, `lastPublicationDate`), `customDateFormat`, `cacheTTL` |
| **Story Taxonomy List** | `detailTaxonomyList` / `detailTaxonomyList_wdg` | Tags and taxonomies attached to an article | `taxonomyKind` (comma-separated, order matters), `listPrefix`, `generateLinks`, `excludedUuids`, `cacheTTL` |
| **Story Title Addons** | `storyTitleAddons` / `storyTitleAddons_wdg` | Badges next to the headline (e.g. VIDEO, PREMIUM) | `titleAddonsCodeNames`, `cacheTTL` |
| **Story Frame** | `storyFrame` / `storyFrame_wdg` | Renders one named frame / group extracted from the article body | `frameCodeName`, `storyFrameHeadding`, `cacheTTL` |
| **Story Related Content** | `storyRelatedContent` / `storyRelatedContent_wdg` | Manually curated related items, optionally auto-completed | `relatedContentRoleCodeName`, `autocomplete`, `autocompleteFrom`, `cacheTTL` |
| **Story Similar Stories** | `storySimilarStories` / `storySimilarStories_wdg` | Similar articles derived from the current article's content | `limit`, `allowedKinds` (e.g. article, video), `cacheTTL` |
| **Story Table of Contents** | `StoryTableOfContents` / `storyTableOfContents_wdg` | Scrollspy table of contents built from headings in the body | `contentSelector`, `headingSelector`, `heading` |
| **Story Live Blog** | `StoryLiveBlog` | Embeds a live blog instance | `extensionAppCodeName`, `platformUrl`, `clientId`, `language`, `liveBlogId`, `cacheTTL` |

---

## General-purpose and layout widgets

| Widget | `widgetType` / module | Purpose | Key parameters |
|---|---|---|---|
| **Logo** | `logo` / `logo_wdg` | Site logo with link | `logoLinkLight`, `overrideLink`, `imageWidth`, `imageHeight`, `overrideTitle` |
| **Menu** | `menu` / `menu_wdg` | Navigation menu | Per entry: `url`, `hidden`, open in new tab, custom CSS class, image URL, image dimensions |
| **SearchBox** | `searchBox` / `SearchBox_wdg` | Search form | `placeholder`, `searchURLPhrase`, `buttonText` |
| **Breadcrumbs** | `breadcrumbs` / `Breadcrumbs_wdg` | Breadcrumb trail, consistent with the `BreadcrumbList` structured data | `disableFirstLevel`, `customFirstLevelText`, `customFirstLevelUrl` |
| **Simple Heading** | `simpleHeading` / `simpleHeading_wdg` | Static heading | `headingText`, `headingTag` (`div`, `h1`–`h6`) |
| **Single image** | `singleImage` / `singleImage_wdg` | A single static image | `src`, `imageSize`, mobile `src` and size, `alt`, `linkUrl`, `options` |
| **Slider** | `slider` / `slider_wdg` | Carousel, hydrated on the client | `slides` (title, description, link, source URL / node / type, desktop and mobile dimensions, CSS class), `slidesPerView`, `autoplayDelay`, `loop`, `navigation`, `pagination`, `centeredSlides`, `navigationOutside`, `breakpoints` |
| **PhotoSwipe** | `photoswipe` / `photoswipe_wdg` | Gallery lightbox attached by CSS selectors | `gallerySelector`, `childrenSelector` |
| **Popup** | `popup` / `Popup_wdg` | Modal triggered by a click, scroll depth or a JavaScript expression | `querySelector`, `onClickQuerySelector`, `desktopSize`, `mobileSize`, `showOnScrollPercent`, `oncePerSession`, `triggerJsExpression` |
| **Ring HTML Insert** | `htmlInsert` / `html_wdg` | Arbitrary HTML injection | `html` |
| **Ring External Application** | `externalApplication` / `external_wdg` | Fetches and embeds a fragment from an external controller | `controllerUrl`, `blockName`, `querySelector` |
| **Ring wrapper start / end** | `wrapperStart` / `wrapperEnd` | A pair of widgets that wrap a run of widgets in one container (pairing is validated in `Box.astro`) | `customClass` |

---

## Analytics widgets

| Widget | `widgetType` | Purpose | Key parameters |
|---|---|---|---|
| **Kropka** | `kropka` / `kropka_wdg` | Kropka / dlApi analytics integration | `mode` (`static`, `automatic`), `dv` (automatic path building, `M_` prefix on mobile), `portalId`, `target`, `tid`, `main` |
| **Ring Data Layer** | `ringDataLayer` / `ringDataLayer_wdg` | Ring data layer bootstrap | `platformDesktop`, `platformMobile` |

---

## Article content blocks

`StoryContent` renders the article body by mapping each block returned by the CMS to a component.
The mapping is overridable — see [Extending the library](./extending.md).

| Block | Notes |
|---|---|
| `ParagraphBlock`, `HeadingBlock`, `PreformattedBlock` | Text blocks |
| `UnorderedListBlock`, `OrderedListBlock`, `TableBlock` | Structured content |
| `ImageBlock` | Image with metadata and optional lightbox |
| `EmbeddedApplicationBlock` | Embeds and applications from Story Editor |
| `GroupBlock` | Frames and groups (`groupStart` / `groupEnd`), filterable via `ignoredFrameBlocksNames` |
| `StoriesBlock` → `Gallery` | Gallery of related material |
| `SlotBlock` | Renders a project component chosen by the editor — see [slots](./extending.md#slots) |
| `NotHandledBlock` | Fallback for unknown block types |

---

## Shared (non-widget) components

These are building blocks for project code rather than configurable widgets.

| Component | Purpose |
|---|---|
| `RingImage` (`.astro` / `.tsx`) | Image with Accelerator Images transformations, preload / priority support, SVG placeholder |
| `RingImagePreload` | Workaround for a Safari image-preload bug |
| `RingLink` | Link that strips the configured domain in development mode |
| `SafeHead` | Filters a slot so only `meta`, `link`, `style` and `script` survive — safe for `<head>` |
| `TextReplacer` | Applies the text decorators configured in Developer settings |
| `ImageMetaData` | Caption, copyright and source line under an image |
| `AdditionalComponentTemplate` | Wrapper for components injected into lists and article content |
| `StoryGroup` | Renders a named group of content blocks outside the Story Content widget |
| `CacheScanner` | UI for the cache scanning helpers |
| `Grid`, `Container`, `Box` | The grid primitives, usable directly in page templates |

---

[← Architecture](./architecture.md) · [Back to index](./README.md) · [Next: Building a site →](./building-a-site.md)
