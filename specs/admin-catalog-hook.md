# Spec: useAdminCatalog Hook

## Overview

SWR-based React hook for fetching catalog data with caching and mutation support.

## Why

Provides clean interface for catalog data with automatic caching, deduplication, and cache invalidation.

## API

### Hook Signature

```typescript
interface UseAdminCatalogParams {
  filter?: CatalogFilter
  sort?: CatalogSort
  offset?: number
  limit?: number
}

interface UseAdminCatalogResult {
  data: CatalogResponse | undefined
  error: Error | undefined
  isLoading: boolean
  isValidating: boolean
  mutate: () => Promise<CatalogResponse | undefined>
}

function useAdminCatalog(params?: UseAdminCatalogParams): UseAdminCatalogResult
```

### Types

```typescript
type CatalogFilter = "all" | "missing_bpm" | "missing_enhancement" | "missing_spotify"
type CatalogSort = "plays" | "recent" | "alpha"
```

## Implementation

### File

`src/hooks/useAdminCatalog.ts`

### Cache Key

Build URL-based cache key from params:
```typescript
function buildCacheKey(params: UseAdminCatalogParams): string {
  const searchParams = new URLSearchParams()
  if (params.filter && params.filter !== "all") {
    searchParams.set("filter", params.filter)
  }
  if (params.sort && params.sort !== "plays") {
    searchParams.set("sort", params.sort)
  }
  searchParams.set("limit", (params.limit ?? 50).toString())
  searchParams.set("offset", (params.offset ?? 0).toString())
  return `/api/admin/catalog?${searchParams.toString()}`
}
```

### SWR Config

```typescript
useSWR(cacheKey, fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 60000,  // 1 minute
})
```

## Dependencies

- `swr` (already installed)
- Types from catalog API response

## Acceptance Criteria

- [ ] Fetches catalog data
- [ ] Caches responses
- [ ] Deduplicates concurrent requests
- [ ] `mutate()` invalidates cache
- [ ] Handles loading/error states
