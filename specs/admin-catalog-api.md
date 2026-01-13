# Spec: Admin Catalog API

## Overview

Create `/api/admin/catalog` endpoint to fetch catalog tracks from Neon with usage metrics.

## Why

The current `/api/admin/tracks` queries 4.2M Turso tracks, taking 20+ seconds. Admin needs to see tracks users actually play, not the entire LRCLIB database.

## API Design

### Endpoint

`GET /api/admin/catalog`

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filter` | string | `all` | Filter: `all`, `missing_bpm`, `missing_enhancement`, `missing_spotify` |
| `sort` | string | `plays` | Sort: `plays`, `recent`, `alpha` |
| `limit` | number | 50 | Page size (max 100) |
| `offset` | number | 0 | Pagination offset |

### Response

```typescript
interface CatalogTrack {
  id: string                    // Neon song ID
  lrclibId: number | null       // LRCLIB ID if linked
  title: string
  artist: string
  album: string | null

  // Usage metrics
  totalPlayCount: number
  uniqueUsers: number
  lastPlayedAt: string | null   // ISO timestamp

  // Enrichment status
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  spotifyId: string | null
}

interface CatalogResponse {
  tracks: CatalogTrack[]
  total: number
  offset: number
  hasMore: boolean
}
```

## Implementation

### File

`src/app/api/admin/catalog/route.ts`

### Query

```sql
SELECT
  s.id,
  s.title,
  s.artist,
  s.album,
  s.total_play_count,
  s.bpm,
  s.musical_key,
  s.bpm_source,
  s.has_enhancement,
  s.has_chord_enhancement,
  sl.lrclib_id,
  COUNT(DISTINCT usi.user_id) as unique_users,
  MAX(usi.last_played_at) as last_played_at
FROM songs s
LEFT JOIN song_lrclib_ids sl ON s.id = sl.song_id
LEFT JOIN user_song_items usi ON s.id = usi.catalog_song_id
WHERE 1=1
  -- Apply filters here
GROUP BY s.id, sl.lrclib_id
ORDER BY s.total_play_count DESC NULLS LAST
LIMIT ? OFFSET ?
```

### Filter Logic

- `missing_bpm`: `AND s.bpm IS NULL`
- `missing_enhancement`: `AND s.has_enhancement = false`
- `missing_spotify`: `AND sl.lrclib_id IS NULL` (no Turso link means no Spotify)

### Auth

Require admin role (same pattern as existing admin endpoints).

### Cache Headers

```typescript
"Cache-Control": "private, max-age=60, stale-while-revalidate=300"
```

## Dependencies

- `@/lib/db` - Drizzle Neon client
- `@/lib/db/schema` - songs, song_lrclib_ids, user_song_items tables
- `@/auth` - Auth check
- Effect.ts for async operations

## Acceptance Criteria

- [ ] Returns catalog tracks sorted by play count
- [ ] Filters work correctly
- [ ] Pagination works
- [ ] Response time < 500ms for first page
- [ ] Admin auth required
