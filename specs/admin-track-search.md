# Spec: Admin Track Search

## Overview

Simplify `/api/admin/tracks` to be search-only (no full dataset pagination). Add support for direct ID lookups.

## Why

The current endpoint tries to paginate 4.2M tracks which is slow and not useful. Search should be fast and targeted.

## API Design

### Endpoint

`GET /api/admin/tracks/search`

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | **Required**. Search query |
| `limit` | number | Max results (default 20, max 50) |

### Query Auto-Detection

The `q` parameter is analyzed to determine search type:

1. **Pure digits** (e.g., `123456`) → LRCLIB ID lookup
2. **Spotify format** (`spotify:track:xxx` or `https://open.spotify.com/track/xxx`) → Spotify ID lookup
3. **Otherwise** → FTS5 text search

### Response

```typescript
interface SearchResult {
  // Turso data
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number

  // Spotify enrichment
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  albumImageUrl: string | null

  // Catalog status (quick lookup)
  inCatalog: boolean
  catalogSongId: string | null
}

interface SearchResponse {
  results: SearchResult[]
  searchType: "fts" | "lrclib_id" | "spotify_id"
  query: string
}
```

## Implementation

### File

`src/app/api/admin/tracks/search/route.ts`

### Query Detection Logic

```typescript
function detectSearchType(q: string): "lrclib_id" | "spotify_id" | "fts" {
  const trimmed = q.trim()

  // Pure digits = LRCLIB ID
  if (/^\d+$/.test(trimmed)) {
    return "lrclib_id"
  }

  // Spotify patterns
  if (trimmed.startsWith("spotify:track:") ||
      trimmed.includes("open.spotify.com/track/")) {
    return "spotify_id"
  }

  return "fts"
}
```

### Search Implementations

**LRCLIB ID**:
```sql
SELECT * FROM tracks WHERE id = ?
```

**Spotify ID**:
```sql
SELECT * FROM tracks WHERE spotify_id = ?
```

**FTS**:
```sql
SELECT t.* FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH ?
ORDER BY t.popularity DESC NULLS LAST
LIMIT ?
```

### Catalog Status Check

After getting Turso results, check Neon for catalog membership:

```sql
SELECT song_id, lrclib_id FROM song_lrclib_ids
WHERE lrclib_id IN (?)
```

## Dependencies

- `@/services/turso` - TursoService
- `@/lib/db` - Neon for catalog check
- Effect.ts

## Acceptance Criteria

- [ ] FTS search works with debounced input
- [ ] LRCLIB ID lookup returns single result
- [ ] Spotify ID lookup works (with URL parsing)
- [ ] Response includes catalog status
- [ ] Response time < 1s for FTS, < 200ms for ID lookups
