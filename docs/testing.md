# Testing

[← Back to index](./README.md)

The library ships reusable [Playwright](https://playwright.dev/) test functions so every project
gets the same baseline coverage for SEO, social metadata, performance and interactive behaviour.
A project supplies the URLs and the expected values.

Playwright itself is a peer dependency — the consuming project installs it.

---

## 1. Importing the suites

The suites are published as compiled output:

```ts
import * as playwrightTest from "@playwright/test";
import { test } from "@playwright/test";
import * as hatTests from "hat-ring-components/testDist/tests";
import * as hatTestsHelper from "hat-ring-components/testDist/helpers/TestsHelper";
```

---

## 2. Available suites

### SEO

| Function | Checks |
|---|---|
| `TestSeo_pageTitle` | `<title>` is present and matches the expected value |
| `TestSeo_pageDescription` | Meta description |
| `TestSeo_pageRobots` | Robots meta tag |
| `TestSeo_canonical` | Canonical URL |
| `TestSeo_htmlLangAttribute` | `lang` attribute on `<html>` |
| `TestSeo_schemaOrg` | JSON-LD structured data; `compareMode` is `exact` or `contains` |
| `TestSeo_imageAlts` | Every image has an `alt` attribute; `imageSrcToSkip` excludes third-party assets |
| `TestSeo_paginationLinks` | `rel="prev"` and `rel="next"` |

### Social media

| Function | Checks |
|---|---|
| `TestSocialMedia_openGraphAndTwitterCards` | `og:title`, `og:description`, `og:image` (plus `image:url`, `image:secure_url`, `image:type`, `image:width`, `image:height`), `og:url`, `og:type`, `og:site_name`, `og:locale`, and the Twitter card, title and description tags |

### Performance

| Function | Checks |
|---|---|
| `TestPerformance_imagesLoadingStrategy` | Every image is either lazy-loaded or explicitly preloaded |
| `TestPerformance_visibleIframesLazyLoading` | Visible iframes are lazy-loaded |

### Behaviour

| Function | Checks |
|---|---|
| `TestList_infiniteScrollPagination` | Items exist before pagination, the button is visible, clicking it loads more items, and the new items have titles, images and working links, with no duplicates |
| `TestLightbox_openCloseViaPswp` | Gallery lightbox opens on a slide click, shows an image and a close button, and closes again; skipped automatically when the lightbox library is unreachable |

Both accept selector overrides so they work against project-specific markup.

---

## 3. Test helpers

| Helper | Purpose |
|---|---|
| `TestsHelper_getUrl({ url, withoutPort })` | Normalises a URL for comparison against rendered values |
| `TestsHelper_getMetaContent` | Reads a meta tag |
| `TestsHelper_getStructuredData` | Parses JSON-LD from the page |
| `TestsHelper_elementExists` | Asserts an element is present |
| `TestsHelper_elementNotEmpty` | Asserts an element has content |
| `TestsHelper_elementContainsText` | Asserts text content |
| `TestsHelper_setupPageRoutes` | Request interception — block or stub third-party traffic |
| `TestsHelper_attachDOMAtFailedTests({ playwrightTest })` | Attaches the rendered DOM to failed test reports |

---

## 4. A project spec

```ts
import * as playwrightTest from "@playwright/test";
import { test } from "@playwright/test";
import * as hatTests from "hat-ring-components/testDist/tests";
import * as hatTestsHelper from "hat-ring-components/testDist/helpers/TestsHelper";

hatTestsHelper.TestsHelper_attachDOMAtFailedTests({ playwrightTest });

test("article detail", async ({ page }) => {
    const url = "https://example.test/section/article-slug";
    await page.goto(url);
    const testedUrl = hatTestsHelper.TestsHelper_getUrl({ url, withoutPort: true });

    await hatTestsHelper.TestsHelper_elementNotEmpty({
        page, playwrightTest,
        description: "H1 should not be empty",
        selector: "h1",
    });

    await hatTests.TestSeo_pageTitle({ page, playwrightTest, expectedValue: "…" });
    await hatTests.TestSeo_pageRobots({ page, playwrightTest, expectedValue: "index, follow" });
    await hatTests.TestSeo_canonical({ page, playwrightTest, expectedValue: testedUrl });
    await hatTests.TestSeo_imageAlts({ page, playwrightTest, imageSrcToSkip: [] });
    await hatTests.TestPerformance_imagesLoadingStrategy({ page, playwrightTest, imageSrcToSkip: [] });
    await hatTests.TestSeo_schemaOrg({
        page, playwrightTest,
        compareMode: "contains",
        expectedValue: [{ "@context": "https://schema.org", "@type": "NewsArticle" }],
    });
});
```

Each function reports through `test.step`, so a failure points at the specific assertion rather than
the whole spec.

---

## 5. Suggested coverage

One spec per content type, each pinned to a stable URL:

| Spec | Suites to run |
|---|---|
| Homepage | SEO basics, social media, image alts, image and iframe loading |
| List / category | The above plus pagination links and infinite scroll |
| Article detail | The above plus `NewsArticle` structured data and the gallery lightbox |
| Author | The above plus `Person` structured data |

Because the assertions live in the library, upgrading it can surface new checks — this is intended:
the suites encode the platform's current SEO and performance expectations.

---

[← API reference](./api-reference.md) · [Back to index](./README.md)
