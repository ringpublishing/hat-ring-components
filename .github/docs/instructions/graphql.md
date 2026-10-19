> **When to read:** You're writing, debugging, or extending GraphQL queries, working with the WebsiteApiProvider, or dealing with data fetching and caching.

## 1. WebsiteApiProvider

The main entry point for all GraphQL queries to Ring CMS.

```typescript
import { WebsiteApiProvider } from "hat-ring-components";
const response = await WebsiteApiProvider.call(query, variables, cacheTTL?);
```

### Execution flow:

1. Generate cache key from query + variables (JSON.stringify)
2. Determine query type (Story, Config, Node, Author, Section, etc.)
3. Generate cache tags based on query type
4. Cache check: Valid HIT → return immediately; Stale → return stale + refresh async; MISS → fetch from API
5. Store result with TTL and tags
6. Return response

### Stale-While-Revalidate

When a cached response is stale (past TTL), the provider:

- Returns the stale data immediately (fast response)
- Triggers an async background refresh
- Prevents thundering herd via `global.HATCacheInCallInProgress` lock

## 2. GraphQL Client Setup

Uses `@ringpublishing/graphql-api-client-got`:

```typescript
new WebsitesApiClient({
    accessKey: process.env.WEBSITE_API_PUBLIC,
    secretKey: process.env.WEBSITE_API_SECRET,
    spaceUuid: process.env.WEBSITE_API_NAMESPACE_ID,
    timeout: 10000
});
```

## 3. Query Type Detection & Cache Tagging

The provider inspects query body to determine type:

- `story(` → Tag: `story_${uuid}` (uuid taken from a `storyId`, `id`, `uuid`, … variable)
- `stories(` → Tag: `story_${uuid}` when such a variable is present (parent story → related children)
- `config(` → Tag: `config_${variant}`
- `section(` / `sectionGroup(` → Tag: `section_${codeName}`
- `topic(` → Tag: `topic_${id}` (checked last, so a stories query with a `topic(` sub-field stays `Stories`)
- `node(`, `author(`, `site(` → no tag (type only, for metrics)

The key is `sha1(JSON.stringify({query, variables}))`; with `CACHE_NORMALIZE_QUERY_KEYS=1` the query text is whitespace/comma-normalised first (`CacheHelper_normalizeQuery`).

Tags enable targeted cache invalidation via `CacheHelper_clearByTag()`.

## 4. Default BootServer Query

The initial page query (run by hat-server middleware):

```graphql
query {
    contentSpaceId
    site(url: $url, variantId: $variant) {
        statusCode
        headers { location }
        data {
            node {
                breadcrumbs { slug, name, url }
                category { id }
                id
            }
            content {
                __typename
                ...on Story { id, title, mainPublicationPoint { id }, kind { code }, system { revision } }
                ...on SiteNode { id, slug, category { id } }
                ...on Topic { id, name, publicationPoint { id } }
                ...on Source { id, name, publicationPoint { id } }
                ...on Author { id, name, publicationPoint { id } }
                ...on CustomAction { id, action }
            }
        }
    }
}
```

This provides content type detection and basic data for routing.

## 5. Widget-Level Queries

Widgets make their own queries for detailed data:

### BasicWidget (section items):

```graphql
query($sectionId: ID!, $count: Int, $offset: Int) {
    section(id: $sectionId) {
        items(first: $count, after: $offset) {
            edges {
                node { title, image { url }, ... }  # Built from itemPart fragments
            }
        }
    }
}
```

### Story widgets:

```graphql
query($storyId: UUID) {
    story(id: $storyId) {
        title
        content { ...ContentFragment }
        image { url, caption }
        authors { author { name, image { url } } }
        ...
    }
}
```

### Config queries:

```graphql
query($nodeID: ID!, $variant: ID!) {
    node(id: $nodeID) {
        config(variantId: $variant) {
            config(codeName: "general") { data }
            config(codeName: "seo") { data }
        }
    }
}
```

## 6. GQL Fragment Composition

ItemParts export `getFragment()` functions. The BasicWidget data fetcher collects fragments from active itemParts:

```typescript
// Each itemPart:
export const getFragment = () => ({
    query: gql`fragment BasicWidgetTitleFragment on SectionItem { title, titles { role { code } text } }`,
    variables: {}
});

// Data fetcher merges all fragments into one query
```

## 7. StoryHelper Content Fragment

For story content blocks:

```graphql
...on ImageBlock { image { url, width, height, caption } }
...on ParagraphBlock { content }
...on HeadingBlock { content, level }
...on TableBlock { rows, columns }
...on EmbedBlock { embedCode, type }
...on SlotBlock { slotName }
...on StoriesBlock { stories { id, title } }
```

## 8. Query Customization Hook

Projects can extend the default BootServer query:

```typescript
// In middleware configuration:
prepareCustomGraphQLQueryToWebsiteAPI: (url, variantId, defaultQuery) => {
    return bootServer.getQuery(url, variantId, `
        data {
            content {
                __typename
                ...on Story { id, title, kind { name } }
                ...on SiteNode { id, slug }
                // ... custom fields
            }
        }
    `);
}
```

## 9. Monitoring

WebsiteApiProvider tracks:

- `cachedResponse` counter — cache hits
- `staleResponse` counter — stale-while-revalidate returns
- `nonCachedResponse` counter — cache misses (full API calls)
- `HATCacheInCallInProgressLength` gauge — pending refreshes
- `hitApiTime` gauge — query duration
- Alerts on queries > 4 seconds

## 10. Error Handling

```typescript
try {
    const response = await client.query(query);
    if (response.errors) {
        console.error('GQL errors:', response.errors);
        // Still return response.data if present
        return response.data ? response : null;
    }
} catch (err) {
    console.error('GQL catch error:', err);
    return null;
}
```

## 11. Cache TTL Strategy

- Default widget cache: CACHE_TTL env (default: 60s)
- Config cache: CACHE_TTL_CONFIG env (default: 60s)
- Server-level cache: HAT_SERVER_WEBSITE_API_TTL (default: 60s)
- Per-widget override: widgetConfig.cacheTTL
- GQL client cache reset: GQL_CACHE_RESET_INTERVAL_SECONDS (default: 300s)
