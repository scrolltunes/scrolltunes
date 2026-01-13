# Admin Tracks Browser Spec

## Overview

Replace the existing `/admin/songs` page with a comprehensive tracks browser that displays all 4.2M LRCLIB tracks from Turso, with enrichment status indicators and manual enrichment actions.

## Architectural Requirements

**This module MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

- All API routes MUST use `Effect.runPromiseExit()` with pattern matching on exit
- Tagged error classes for all error types (auth, database, validation, not found)
- Do NOT use `try/catch` with raw `await`
- Import shared errors from `@/lib/errors`
- Use `Effect.gen` for composing database queries
- Use `Effect.tryPromise` to wrap Turso and Neon calls

## Route

`/admin/songs` (replaces existing page)

## Data Architecture

### Primary Source: Turso

Browse all tracks from Turso's LRCLIB database:
- ~4.2M tracks with FTS5 search
- ~80% have Spotify enrichment (tempo, popularity, spotifyId, albumImageUrl)
- ~20% have no enrichment (Turso fields are NULL)

### Secondary Source: Neon

Cross-reference with Neon `songs` table to show:
- Whether track exists in user catalog
- Manual BPM overrides
- Enhancement status (word-level, chords)
- Play counts

### Linking

Use `songLrclibIds` table to map Turso tracks → Neon songs (1:many).

---

## UI Layout

### Header

- Page title: "Track Catalog"
- Search box (FTS5 query)
- Sort dropdown: "Popular first" (default), "Recent", "Alphabetical"

### Filters Bar

Quick filter chips:
- **All** - No filter (default)
- **Missing Spotify** - `spotify_id IS NULL` in Turso
- **Has Spotify** - `spotify_id IS NOT NULL` in Turso
- **In Catalog** - Exists in Neon via `songLrclibIds`
- **Missing BPM** - No tempo in Turso AND no bpm in linked Neon song

### Tracks List

Paginated table/list (50 per page):

| Column | Source | Notes |
|--------|--------|-------|
| Album Art | Turso `album_image_url` or Deezer fallback | 48x48 thumbnail |
| Title | Turso | Primary text |
| Artist | Turso | Secondary text |
| Duration | Turso | Format: m:ss |
| BPM | Turso `tempo` or Neon `bpm` | Show source indicator |
| Popularity | Turso | 0-100, bar visualization |
| Status | Computed | Badges: "Spotify", "In Catalog", "Enhanced" |
| Actions | - | Expand chevron |

### Inline Expansion

When row is clicked/expanded, show detail panel below:

```
┌─────────────────────────────────────────────────────────────┐
│ [Album Art]  Title - Artist                                 │
│              Album: Album Name                              │
│              Duration: 4:32 | Quality: 85                   │
├─────────────────────────────────────────────────────────────┤
│ ENRICHMENT STATUS                                           │
│                                                             │
│ Turso (Spotify):     ✓ spotifyId: 4PTG3Z...                │
│                      ✓ tempo: 142.5 BPM                     │
│                      ✓ key: E minor (4/4)                   │
│                      ✓ popularity: 78                       │
│                      ✓ ISRC: USUM71703861                   │
│                                                             │
│ Neon (Catalog):      ✗ Not in catalog                       │
│                      - BPM: -                               │
│                      - Enhanced: No                         │
├─────────────────────────────────────────────────────────────┤
│ ACTIONS                                                     │
│                                                             │
│ [Copy from Turso]  [Find Spotify ID]  [Fetch BPM]  [Manual] │
│                                                             │
│ [Enhance (GP)]  [View Lyrics]                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Enrichment Actions

### 1. Copy from Turso

**When available**: Track has Spotify enrichment in Turso.

**Behavior**:
1. If track not in Neon catalog, create new `songs` entry
2. Create `songLrclibIds` mapping
3. Copy fields: `spotifyId`, `bpm` (from tempo), `musicalKey` (formatted), `albumArtUrl`
4. Set `bpmSource` = "Turso"

**API**: `POST /api/admin/tracks/[lrclibId]/copy-enrichment`

### 2. Find Spotify ID

**When available**: Always (useful for tracks without Turso enrichment).

**Behavior**:
1. Open modal with Spotify search interface
2. Pre-fill search with track title + artist
3. Show top 5 Spotify results with:
   - Album art, title, artist, duration
   - Match confidence indicator
4. User selects match
5. Fetch audio features from Spotify API
6. Save to Neon: `spotifyId`, `bpm`, `musicalKey`, `albumArtUrl`

**API**:
- `GET /api/admin/spotify/search?q=...` - Search Spotify
- `POST /api/admin/tracks/[lrclibId]/link-spotify` - Save selection

### 3. Fetch BPM from Providers

**When available**: Track has no BPM (neither Turso nor Neon).

**Behavior**:
1. Trigger existing BPM provider cascade synchronously
2. Show loading state with provider being tried
3. On success, display result and save to Neon
4. On failure, show which providers failed

**API**: `POST /api/admin/tracks/[lrclibId]/fetch-bpm`

### 4. Manual BPM Entry

**When available**: Always.

**Behavior**:
1. Open modal with form:
   - BPM (number input, 1-300)
   - Musical Key (text input or dropdown)
   - Source (text input, default "Manual")
   - Source URL (optional)
2. Save to Neon

**API**: `PATCH /api/songs/[id]/bpm` (existing endpoint)

### 5. Enhance from Guitar Pro (Future)

**When available**: Track has matching Guitar Pro file.

**Behavior**: Link to existing `/admin/enhance/[lrclibId]` page.

### 6. View Lyrics

**Behavior**: Open song player at `/song/[lrclibId]`.

---

## API Endpoints

### GET /api/admin/tracks

Query Turso tracks with optional Neon join.

**Query params**:
- `q` - FTS5 search query (optional)
- `filter` - `all` | `missing_spotify` | `has_spotify` | `in_catalog` | `missing_bpm`
- `sort` - `popular` | `recent` | `alpha`
- `offset` - Pagination offset
- `limit` - Page size (default 50, max 100)

**Response**:
```typescript
interface TracksResponse {
  tracks: TrackWithEnrichment[]
  total: number
  offset: number
  hasMore: boolean
}

interface TrackWithEnrichment {
  // Turso fields
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  quality: number

  // Turso Spotify enrichment
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  mode: number | null
  timeSignature: number | null
  isrc: string | null
  albumImageUrl: string | null

  // Neon enrichment (if in catalog)
  inCatalog: boolean
  neonSongId: string | null
  neonBpm: number | null
  neonMusicalKey: string | null
  neonBpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number | null
}
```

### POST /api/admin/tracks/[lrclibId]/copy-enrichment

Copy Turso enrichment to Neon.

**Response**: `{ success: true, songId: string }`

### GET /api/admin/spotify/search

Search Spotify for matching tracks.

**Query params**:
- `q` - Search query

**Response**:
```typescript
interface SpotifySearchResult {
  results: {
    spotifyId: string
    name: string
    artist: string
    album: string
    albumArt: string | null
    durationMs: number
    popularity: number
  }[]
}
```

### POST /api/admin/tracks/[lrclibId]/link-spotify

Link a Spotify track and fetch enrichment.

**Body**: `{ spotifyId: string }`

**Response**: `{ success: true, songId: string, bpm: number | null }`

### POST /api/admin/tracks/[lrclibId]/fetch-bpm

Trigger BPM provider cascade.

**Response**:
```typescript
interface FetchBpmResponse {
  success: boolean
  bpm: number | null
  source: string | null
  attempts: {
    provider: string
    success: boolean
    error?: string
  }[]
}
```

---

## Queries

### List tracks with enrichment status

```sql
-- Turso query
SELECT
  t.id,
  t.title,
  t.artist,
  t.album,
  t.duration_sec,
  t.quality,
  t.spotify_id,
  t.popularity,
  t.tempo,
  t.musical_key,
  t.mode,
  t.time_signature,
  t.isrc,
  t.album_image_url
FROM tracks t
WHERE tracks_fts MATCH ? -- if search provided
ORDER BY
  CASE WHEN ? = 'popular' THEN -COALESCE(t.popularity, 0) END,
  CASE WHEN ? = 'alpha' THEN t.artist || t.title END,
  t.id
LIMIT ? OFFSET ?
```

### Filter: Missing Spotify
```sql
WHERE t.spotify_id IS NULL
```

### Filter: In Catalog (requires Neon join)
```sql
-- Query Neon for linked lrclib IDs
SELECT DISTINCT lrclib_id FROM song_lrclib_ids
```

Then filter Turso results to only those IDs.

### Count totals
```sql
SELECT COUNT(*) FROM tracks WHERE ...
```

---

## Components

| Component | Purpose |
|-----------|---------|
| `AdminTracksPage` | Main page with search, filters, list |
| `TracksFilterBar` | Quick filter chips |
| `TracksList` | Paginated table with expansion |
| `TrackRow` | Single track row |
| `TrackDetail` | Expanded detail panel |
| `EnrichmentStatus` | Status indicators for Turso/Neon |
| `CopyEnrichmentButton` | Copy from Turso action |
| `SpotifySearchModal` | Find Spotify ID modal |
| `FetchBpmButton` | Trigger provider cascade |
| `ManualBpmModal` | Manual entry form |

---

## Migration from Existing Page

The existing `/admin/songs` page shows only Neon catalog songs. The new page:

1. **Replaces** the existing page entirely
2. **Expands scope** to all Turso tracks (4.2M)
3. **Adds "In Catalog" filter** to replicate old behavior
4. **Preserves** existing actions (enhance, edit lyrics, manual BPM)
5. **Adds** new enrichment actions (copy from Turso, find Spotify, fetch BPM)

---

## Acceptance Criteria

- [ ] Page loads at `/admin/songs` with admin auth
- [ ] All API routes use `Effect.runPromiseExit()` pattern
- [ ] Tagged error classes for all error types
- [ ] Tracks load from Turso with pagination (50 per page)
- [ ] Search box performs FTS5 queries
- [ ] Filter chips work: All, Missing Spotify, Has Spotify, In Catalog, Missing BPM
- [ ] Sort options work: Popular, Recent, Alphabetical
- [ ] Row expansion shows track details and enrichment status
- [ ] "Copy from Turso" creates Neon entry and copies enrichment
- [ ] "Find Spotify ID" opens modal, searches, links selection
- [ ] "Fetch BPM" triggers provider cascade and shows results
- [ ] "Manual BPM" opens form and saves to Neon
- [ ] Responsive design for mobile
- [ ] Loading states and error handling
- [ ] `bun run typecheck` passes
