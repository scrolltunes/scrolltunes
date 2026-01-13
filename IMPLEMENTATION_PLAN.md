# Implementation Plan: Admin Catalog Redesign

## Overview

Redesign `/admin/songs` from Turso-first (4.2M tracks, 20+ second load) to Neon-first (catalog tracks with usage metrics, < 1 second load).

## Spec References

| Spec | Description | Status |
|------|-------------|--------|
| [admin-catalog-api](specs/admin-catalog-api.md) | Catalog API endpoint | Complete |
| [admin-track-search](specs/admin-track-search.md) | Search-only tracks endpoint | Complete |
| [admin-add-to-catalog](specs/admin-add-to-catalog.md) | Add track to catalog endpoint | Complete |
| [admin-catalog-hook](specs/admin-catalog-hook.md) | useAdminCatalog SWR hook | Complete |
| [admin-songs-page-redesign](specs/admin-songs-page-redesign.md) | Page redesign | Pending |

## Research Findings

### Existing Patterns to Reuse

1. **Admin Auth Pattern** - All admin routes follow the same pattern:
   ```typescript
   // src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts (best reference)
   import { auth } from "@/auth"
   import { appUserProfiles } from "@/lib/db/schema"
   import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
   import { DbService } from "@/services/db"
   import { ServerLayer } from "@/services/server-layer"

   const operation = Effect.gen(function* () {
     const session = yield* Effect.tryPromise({
       try: () => auth(),
       catch: cause => new AuthError({ cause }),
     })
     if (!session?.user?.id) return yield* Effect.fail(new UnauthorizedError({}))

     const { db } = yield* DbService
     const [profile] = yield* Effect.tryPromise({
       try: () => db.select({ isAdmin: appUserProfiles.isAdmin })
         .from(appUserProfiles).where(eq(appUserProfiles.userId, session.user.id)),
       catch: cause => new DatabaseError({ cause }),
     })
     if (!profile?.isAdmin) return yield* Effect.fail(new ForbiddenError({}))
     // ... rest of logic
   })
   ```

2. **Effect.ts Error Handling Pattern** - Route handlers:
   ```typescript
   const exit = await Effect.runPromiseExit(operation.pipe(Effect.provide(ServerLayer)))
   if (exit._tag === "Failure") {
     const cause = exit.cause
     if (cause._tag === "Fail") {
       const error = cause.error
       if (error._tag === "UnauthorizedError") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
       if (error._tag === "ForbiddenError") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
       // ... etc
     }
   }
   return NextResponse.json(exit.value)
   ```

3. **TursoService** (`src/services/turso.ts`):
   - `search(query, limit)` - FTS5 prefix search, returns `Effect<TursoSearchResult[]>`
   - `getById(lrclibId)` - Single track lookup, returns `Effect<TursoSearchResult | null>`
   - `searchWithFilters(options)` - Advanced search with pagination
   - `getByIds(lrclibIds)` - Batch fetch
   - **TursoSearchResult fields**: `id, title, artist, album, durationSec, quality, spotifyId, popularity, tempo, musicalKey, mode, timeSignature, isrc, albumImageUrl`

4. **Existing Code to Reuse**:
   - `src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts` - **Best reference** for add-to-catalog (same flow: fetch Turso → create song → link ID)
   - `src/components/admin/TracksFilterBar.tsx` - Filter chip pattern
   - `src/components/admin/TracksList.tsx` - Table with expandable rows
   - `src/hooks/useDebounce.ts` - Debounce with `{ debouncedValue, isPending }`

5. **Utility Functions**:
   - `@/lib/normalize-track.ts`: `normalizeTrackName()`, `normalizeArtistName()` - for `titleLower`, `artistLower`
   - `@/lib/musical-key.ts`: `formatMusicalKey(key, mode)` - converts Spotify pitch class to "C major"
   - Note: `copy-enrichment/route.ts` has local `normalizeText()` which is simpler (just lowercase + trim)

6. **Centralized Errors** (`src/lib/errors.ts`):
   - `AuthError`, `UnauthorizedError`, `ForbiddenError` - auth flow
   - `ValidationError`, `NotFoundError`, `ConflictError` - request validation
   - `DatabaseError` - DB operations
   - Service-specific errors remain in modules (e.g., `TursoSearchError` in turso.ts)

### Schema Analysis

**songs table** (`src/lib/db/schema.ts:235-283`):
- Core: `id` (UUID), `title`, `artist`, `album`, `durationMs`
- Normalized: `artistLower`, `titleLower`, `albumLower` (for deduplication)
- Enrichment: `spotifyId`, `bpm`, `musicalKey`, `bpmSource`, `bpmSourceUrl`, `albumArtUrl`, `albumArtLargeUrl`
- Status: `hasSyncedLyrics`, `hasEnhancement`, `hasChordEnhancement`
- Metrics: `totalPlayCount`
- Timestamps: `createdAt`, `updatedAt`
- Indexes: unique on `(artistLower, titleLower)`, unique on `spotifyId`

**songLrclibIds table** (`src/lib/db/schema.ts:289-304`):
- `id`, `songId` (FK → songs), `lrclibId`, `isPrimary`, `createdAt`
- Index: unique on `lrclibId` (each LRCLIB ID maps to one song)

**userSongItems table** (`src/lib/db/schema.ts:104-146`):
- `catalogSongId` (optional FK → songs) - links user items to catalog
- `playCount`, `lastPlayedAt`, `firstPlayedAt`
- `userId` - for unique user counts

### No Blockers Identified

All required tables, columns, and patterns exist. No schema changes needed.

**Note**: The `copy-enrichment` route is nearly identical to add-to-catalog. Key difference: add-to-catalog should use `ConflictError` and return 409 instead of updating existing.

---

## Phase 1: Catalog API

### Task 1.1: Create catalog API endpoint

**File**: `src/app/api/admin/catalog/route.ts`

Create new endpoint that queries Neon for catalog tracks with usage metrics.

**Imports**:
```typescript
import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs, userSongItems } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbService } from "@/services/db"
import { DbLayer } from "@/services" // Use DbLayer only (no Turso needed)
import { count, desc, eq, isNull, max, sql } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse, type NextRequest } from "next/server"
```

**Query Strategy** (using Drizzle ORM):
```typescript
// Build dynamic WHERE conditions based on filter
const whereConditions = []
if (filter === "missing_bpm") whereConditions.push(isNull(songs.bpm))
if (filter === "missing_enhancement") whereConditions.push(eq(songs.hasEnhancement, false))
if (filter === "missing_spotify") whereConditions.push(isNull(songs.spotifyId))

// Main query with subquery for usage metrics
const baseQuery = db
  .select({
    id: songs.id,
    title: songs.title,
    artist: songs.artist,
    album: songs.album,
    bpm: songs.bpm,
    musicalKey: songs.musicalKey,
    bpmSource: songs.bpmSource,
    hasEnhancement: songs.hasEnhancement,
    hasChordEnhancement: songs.hasChordEnhancement,
    spotifyId: songs.spotifyId,
    albumArtUrl: songs.albumArtUrl,
    totalPlayCount: songs.totalPlayCount,
    lrclibId: songLrclibIds.lrclibId,
    // Aggregate from userSongItems via subquery
    uniqueUsers: sql<number>`(
      SELECT COUNT(DISTINCT user_id)
      FROM user_song_items
      WHERE catalog_song_id = ${songs.id}
    )`.as("unique_users"),
    lastPlayedAt: sql<string | null>`(
      SELECT MAX(last_played_at)
      FROM user_song_items
      WHERE catalog_song_id = ${songs.id}
    )`.as("last_played_at"),
  })
  .from(songs)
  .leftJoin(songLrclibIds, eq(songs.id, songLrclibIds.songId))
  .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)

// Sort by plays (default), recent, or alpha
const orderByClause = sort === "recent"
  ? desc(sql`last_played_at`)
  : sort === "alpha"
    ? asc(songs.artist)
    : desc(sql`COALESCE(${songs.totalPlayCount}, 0)`)
```

**Count Query** (separate for pagination):
```typescript
const [{ total }] = await db
  .select({ total: count() })
  .from(songs)
  .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
```

**Response Type** (define in route file):
```typescript
interface CatalogTrack {
  id: string
  lrclibId: number | null
  title: string
  artist: string
  album: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  spotifyId: string | null
  albumArtUrl: string | null
  totalPlayCount: number
  uniqueUsers: number
  lastPlayedAt: string | null
}

interface CatalogResponse {
  tracks: CatalogTrack[]
  total: number
  offset: number
  hasMore: boolean
}
```

**Cache Headers**:
```typescript
return NextResponse.json(response, {
  headers: {
    "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
  },
})
```

**Acceptance Criteria**:
- [x] Returns catalog tracks sorted by play count (default)
- [x] Includes usage metrics (totalPlayCount, uniqueUsers, lastPlayedAt)
- [x] Includes enrichment status (bpm, musicalKey, hasEnhancement)
- [x] Filter `missing_bpm` returns only tracks with `bpm IS NULL`
- [x] Filter `missing_enhancement` returns only tracks with `hasEnhancement = false`
- [x] Filter `missing_spotify` returns only tracks with `spotifyId IS NULL`
- [x] Sort options: `plays` (default), `recent`, `alpha`
- [x] Pagination with offset/limit works
- [x] Response time < 500ms for first page
- [x] Cache-Control headers set

---

## Phase 2: Search API

### Task 2.1: Create track search endpoint

**File**: `src/app/api/admin/tracks/search/route.ts`

New search-only endpoint with auto-detection for ID lookups.

**Imports**:
```typescript
import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { TursoService, type TursoSearchResult } from "@/services/turso"
import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse, type NextRequest } from "next/server"
```

**Query Detection** (helper functions):
```typescript
type SearchType = "lrclib_id" | "spotify_id" | "fts"

function detectSearchType(q: string): SearchType {
  const trimmed = q.trim()
  if (/^\d+$/.test(trimmed)) return "lrclib_id"
  if (trimmed.startsWith("spotify:track:") || trimmed.includes("open.spotify.com/track/")) return "spotify_id"
  return "fts"
}

function extractSpotifyId(q: string): string {
  if (q.startsWith("spotify:track:")) return q.replace("spotify:track:", "")
  const match = q.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/)
  return match?.[1] ?? q
}
```

**Search Logic** (Effect chain):
```typescript
const searchTracks = (query: string, limit: number) =>
  Effect.gen(function* () {
    // Auth check...

    const searchType = detectSearchType(query)
    const turso = yield* TursoService
    const { db } = yield* DbService

    // Get results from Turso based on search type
    let tursoResults: TursoSearchResult[]

    if (searchType === "lrclib_id") {
      const id = Number.parseInt(query.trim(), 10)
      const result = yield* turso.getById(id)
      tursoResults = result ? [result] : []
    } else if (searchType === "spotify_id") {
      const spotifyId = extractSpotifyId(query)
      // Use raw SQL for Spotify ID lookup (TursoService doesn't have this method)
      tursoResults = yield* turso.searchWithFilters({
        filter: "has_spotify",
        sort: "popular",
        offset: 0,
        limit,
        // Note: May need to add spotifyId filter to TursoService
      }).pipe(Effect.map(r => r.tracks.filter(t => t.spotifyId === spotifyId)))
    } else {
      tursoResults = yield* turso.search(query, limit)
    }

    // Batch check catalog status
    const lrclibIds = tursoResults.map(r => r.id)
    const catalogMappings = lrclibIds.length > 0
      ? yield* Effect.tryPromise({
          try: () => db.select({ lrclibId: songLrclibIds.lrclibId, songId: songLrclibIds.songId })
            .from(songLrclibIds)
            .where(inArray(songLrclibIds.lrclibId, lrclibIds)),
          catch: cause => new DatabaseError({ cause }),
        })
      : []

    const catalogMap = new Map(catalogMappings.map(m => [m.lrclibId, m.songId]))

    // Map to response format
    const results: SearchResult[] = tursoResults.map(t => ({
      lrclibId: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      durationSec: t.durationSec,
      spotifyId: t.spotifyId,
      popularity: t.popularity,
      tempo: t.tempo,
      musicalKey: t.musicalKey,
      albumImageUrl: t.albumImageUrl,
      inCatalog: catalogMap.has(t.id),
      catalogSongId: catalogMap.get(t.id) ?? null,
    }))

    return { results, searchType, query }
  })
```

**Response Type**:
```typescript
interface SearchResult {
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  albumImageUrl: string | null
  inCatalog: boolean
  catalogSongId: string | null
}

interface SearchResponse {
  results: SearchResult[]
  searchType: "fts" | "lrclib_id" | "spotify_id"
  query: string
}
```

**Acceptance Criteria**:
- [x] FTS5 search via `TursoService.search()` works
- [x] LRCLIB ID lookup works (pure digits → `TursoService.getById()`)
- [x] Spotify ID lookup works (spotify:track:xxx or URL)
- [x] Returns `inCatalog: true/false` and `catalogSongId` for each result
- [x] Empty query returns 400 ValidationError
- [ ] Response time < 1s for FTS, < 200ms for ID lookups

### Task 2.2: Create add-to-catalog endpoint

**File**: `src/app/api/admin/tracks/[lrclibId]/add-to-catalog/route.ts`

Endpoint to add Turso track to Neon catalog. **Reference**: `copy-enrichment/route.ts` (nearly identical flow).

**Imports**:
```typescript
import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import {
  AuthError,
  ConflictError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors"
import { formatMusicalKey } from "@/lib/musical-key"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { TursoService } from "@/services/turso"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"
```

**Key Difference from copy-enrichment**:
- copy-enrichment updates existing song if LRCLIB ID already mapped
- add-to-catalog should return 409 ConflictError if already in catalog

**Implementation** (Effect chain):
```typescript
const addToCatalog = (lrclibId: number) =>
  Effect.gen(function* () {
    // Auth check (same as copy-enrichment)...

    const { db } = yield* DbService

    // 1. Check if already in catalog → return 409
    const [existing] = yield* Effect.tryPromise({
      try: () => db.select({ songId: songLrclibIds.songId })
        .from(songLrclibIds)
        .where(eq(songLrclibIds.lrclibId, lrclibId)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existing) {
      return yield* Effect.fail(new ConflictError({
        message: `Track already in catalog as song ${existing.songId}`,
      }))
    }

    // 2. Fetch from Turso
    const turso = yield* TursoService
    const track = yield* turso.getById(lrclibId)

    if (!track) {
      return yield* Effect.fail(new NotFoundError({ resource: "track", id: String(lrclibId) }))
    }

    // 3. Create song (use simple normalization like copy-enrichment)
    const normalizeText = (s: string) => s.toLowerCase().trim()

    const [newSong] = yield* Effect.tryPromise({
      try: () => db.insert(songs).values({
        title: track.title,
        artist: track.artist,
        album: track.album ?? "",
        durationMs: track.durationSec * 1000,
        artistLower: normalizeText(track.artist),
        titleLower: normalizeText(track.title),
        albumLower: track.album ? normalizeText(track.album) : null,
        spotifyId: track.spotifyId,
        bpm: track.tempo ? Math.round(track.tempo) : null,
        musicalKey: formatMusicalKey(track.musicalKey, track.mode),
        bpmSource: track.tempo ? "Turso" : null,
        albumArtUrl: track.albumImageUrl,
        hasSyncedLyrics: true, // From LRCLIB
      }).returning({ id: songs.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!newSong) {
      return yield* Effect.fail(new DatabaseError({ cause: "Failed to create song" }))
    }

    // 4. Link LRCLIB ID
    yield* Effect.tryPromise({
      try: () => db.insert(songLrclibIds).values({
        songId: newSong.id,
        lrclibId,
        isPrimary: true,
      }),
      catch: cause => new DatabaseError({ cause }),
    })

    return {
      success: true as const,
      songId: newSong.id,
      lrclibId,
      title: track.title,
      artist: track.artist,
      bpm: track.tempo ? Math.round(track.tempo) : null,
      musicalKey: formatMusicalKey(track.musicalKey, track.mode),
      spotifyId: track.spotifyId,
    }
  })
```

**Response Type**:
```typescript
interface AddToCatalogResponse {
  success: true
  songId: string
  lrclibId: number
  title: string
  artist: string
  bpm: number | null
  musicalKey: string | null
  spotifyId: string | null
}
```

**Error Handling**:
```typescript
if (error._tag === "ConflictError") {
  return NextResponse.json({ error: error.message, songId: /* extract from message */ }, { status: 409 })
}
```

**Acceptance Criteria**:
- [x] Creates new song in Neon with all fields from Turso
- [x] Links LRCLIB ID via `songLrclibIds` table
- [x] Copies BPM/key from Turso if available (`bpmSource: "Turso"`)
- [x] Sets `hasSyncedLyrics: true` (LRCLIB tracks have synced lyrics)
- [x] Returns 409 ConflictError if LRCLIB ID already in catalog
- [x] Returns 404 NotFoundError if LRCLIB ID not found in Turso
- [x] Admin auth required

---

## Phase 3: Hooks

### Task 3.1: Create useAdminCatalog hook

**File**: `src/hooks/useAdminCatalog.ts`

SWR-based hook for catalog data.

**Implementation**:
```typescript
import useSWR from "swr"

// ============================================================================
// Types (shared with API)
// ============================================================================

export type CatalogFilter = "all" | "missing_bpm" | "missing_enhancement" | "missing_spotify"
export type CatalogSort = "plays" | "recent" | "alpha"

export interface CatalogTrack {
  id: string
  lrclibId: number | null
  title: string
  artist: string
  album: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  spotifyId: string | null
  albumArtUrl: string | null
  totalPlayCount: number
  uniqueUsers: number
  lastPlayedAt: string | null
}

export interface CatalogResponse {
  tracks: CatalogTrack[]
  total: number
  offset: number
  hasMore: boolean
}

// ============================================================================
// Hook
// ============================================================================

interface UseAdminCatalogParams {
  filter?: CatalogFilter
  sort?: CatalogSort
  offset?: number
  limit?: number
}

const fetcher = async (url: string): Promise<CatalogResponse> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  return res.json()
}

export function useAdminCatalog(params: UseAdminCatalogParams = {}) {
  const { filter = "all", sort = "plays", offset = 0, limit = 50 } = params

  const searchParams = new URLSearchParams()
  if (filter !== "all") searchParams.set("filter", filter)
  if (sort !== "plays") searchParams.set("sort", sort)
  searchParams.set("limit", limit.toString())
  searchParams.set("offset", offset.toString())

  const url = `/api/admin/catalog?${searchParams.toString()}`

  const { data, error, isLoading, isValidating, mutate } = useSWR<CatalogResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  )

  return { data, error, isLoading, isValidating, mutate }
}
```

**Acceptance Criteria**:
- [x] Fetches catalog data from `/api/admin/catalog`
- [x] Supports filter param (all, missing_bpm, missing_enhancement, missing_spotify)
- [x] Supports sort param (plays, recent, alpha)
- [x] Supports pagination (offset, limit)
- [x] Caches responses (60s deduping interval)
- [x] `mutate()` invalidates cache and refetches
- [x] Handles fetch errors properly

### Task 3.2: Create useAdminTrackSearch hook

**File**: `src/hooks/useAdminTrackSearch.ts`

SWR-based hook for track search.

**Implementation**:
```typescript
import useSWR from "swr"

// ============================================================================
// Types (shared with API)
// ============================================================================

export type SearchType = "fts" | "lrclib_id" | "spotify_id"

export interface SearchResult {
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  albumImageUrl: string | null
  inCatalog: boolean
  catalogSongId: string | null
}

export interface SearchResponse {
  results: SearchResult[]
  searchType: SearchType
  query: string
}

// ============================================================================
// Hook
// ============================================================================

const fetcher = async (url: string): Promise<SearchResponse> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  return res.json()
}

export function useAdminTrackSearch(query: string, limit = 20) {
  const trimmed = query.trim()

  // Don't fetch if query is empty
  const shouldFetch = trimmed.length > 0

  const searchParams = new URLSearchParams()
  searchParams.set("q", trimmed)
  searchParams.set("limit", limit.toString())

  const url = shouldFetch ? `/api/admin/tracks/search?${searchParams.toString()}` : null

  const { data, error, isLoading, isValidating, mutate } = useSWR<SearchResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000, // 5 seconds for search (shorter than catalog)
    }
  )

  return {
    data,
    error,
    isLoading: shouldFetch && isLoading,
    isValidating,
    searchType: data?.searchType ?? null,
    mutate,
  }
}
```

**Acceptance Criteria**:
- [x] Fetches from `/api/admin/tracks/search?q=...`
- [x] No request when query is empty (returns `data: undefined`)
- [x] Exposes `searchType` from response (fts, lrclib_id, spotify_id)
- [x] 5 second deduping interval (shorter than catalog hook)
- [x] Returns `mutate` for cache invalidation after add-to-catalog

---

## Phase 4: UI Redesign

### Task 4.1: Create CatalogFilters component

**File**: `src/components/admin/CatalogFilters.tsx`

Filter chip bar with counts for missing data. **Reference**: `TracksFilterBar.tsx` for pattern.

**Implementation**:
```typescript
"use client"

import type { CatalogFilter } from "@/hooks/useAdminCatalog"
import { motion } from "motion/react"

interface FilterCount {
  all: number
  missing_bpm: number
  missing_enhancement: number
  missing_spotify: number
}

interface CatalogFiltersProps {
  filter: CatalogFilter
  onFilterChange: (filter: CatalogFilter) => void
  counts?: FilterCount
}

const FILTERS: { key: CatalogFilter; label: string; warning?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "missing_bpm", label: "Missing BPM", warning: true },
  { key: "missing_enhancement", label: "Missing Enhancement" },
  { key: "missing_spotify", label: "No Spotify" },
]

export function CatalogFilters({ filter, onFilterChange, counts }: CatalogFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map(({ key, label, warning }) => {
        const isActive = filter === key
        const count = counts?.[key]

        return (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              isActive
                ? warning
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-primary/20 text-primary border border-primary/30"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {label}
            {count !== undefined && (
              <span className="ml-1.5 opacity-70">({count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

**Acceptance Criteria**:
- [x] Shows 4 filter chips: All, Missing BPM, Missing Enhancement, No Spotify
- [x] "Missing BPM" chip uses amber/warning color when active
- [x] Other chips use primary color when active
- [x] Shows counts in parentheses when `counts` prop provided
- [x] Click changes active filter
- [x] Follows existing TracksFilterBar styling patterns

### Task 4.2: Create CatalogTrackRow component

**File**: `src/components/admin/CatalogTrackRow.tsx`

Row component for catalog tracks. **Reference**: `TracksList.tsx` TrackRow for pattern.

**Implementation**:
```typescript
"use client"

import type { CatalogTrack } from "@/hooks/useAdminCatalog"
import { formatDistanceToNow } from "date-fns"
import { Warning, MusicNote, CheckCircle, CaretDown } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import Image from "next/image"
import { useState } from "react"

interface CatalogTrackRowProps {
  track: CatalogTrack
  isExpanded: boolean
  onToggle: () => void
}

export function CatalogTrackRow({ track, isExpanded, onToggle }: CatalogTrackRowProps) {
  const hasBpm = track.bpm !== null
  const lastPlayed = track.lastPlayedAt
    ? formatDistanceToNow(new Date(track.lastPlayedAt), { addSuffix: true })
    : "—"

  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          "w-full grid grid-cols-[48px_1fr_80px_60px_80px_60px_40px] gap-2 items-center p-2 text-left",
          "hover:bg-muted/50 transition-colors",
          !hasBpm && "bg-amber-500/5", // Subtle warning background for missing BPM
        )}
      >
        {/* Album Art */}
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
          {track.albumArtUrl ? (
            <Image
              src={track.albumArtUrl}
              alt=""
              width={48}
              height={48}
              className="object-cover"
              loading="lazy"
            />
          ) : (
            <MusicNote className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        {/* Title/Artist */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {!hasBpm && <Warning className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            <span className="font-medium truncate">{track.title}</span>
          </div>
          <div className="text-sm text-muted-foreground truncate">{track.artist}</div>
        </div>

        {/* Plays */}
        <div className="text-sm text-center">{track.totalPlayCount.toLocaleString()}</div>

        {/* Users */}
        <div className="text-sm text-center text-muted-foreground">{track.uniqueUsers}</div>

        {/* Last Played */}
        <div className="text-xs text-muted-foreground text-center">{lastPlayed}</div>

        {/* BPM */}
        <div className={cn("text-sm text-center", !hasBpm && "text-amber-500")}>
          {track.bpm ?? "—"}
        </div>

        {/* Enhancement */}
        <div className="flex justify-center">
          {track.hasEnhancement && <CheckCircle className="w-4 h-4 text-green-500" weight="fill" />}
        </div>
      </button>

      {/* Expanded Detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border bg-muted/30 overflow-hidden"
          >
            {/* TrackDetail + EnrichmentActions from existing components */}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
```

**Columns**:
| Column | Width | Content |
|--------|-------|---------|
| Art | 48px | `albumArtUrl` or MusicNote icon |
| Title/Artist | flex | Title (⚠️ warning icon if no BPM), Artist |
| Plays | 80px | `totalPlayCount` formatted |
| Users | 60px | `uniqueUsers` |
| Last | 80px | Relative time from `lastPlayedAt` |
| BPM | 60px | `bpm` or "—" (amber color if missing) |
| E | 40px | CheckCircle if `hasEnhancement` |

**Acceptance Criteria**:
- [x] Shows album art (lazy loaded with `loading="lazy"`)
- [x] Shows title with warning icon if no BPM
- [x] Shows artist below title
- [x] Shows usage metrics (plays, users, last played)
- [x] Shows BPM (amber color if missing)
- [x] Shows green checkmark if enhanced
- [x] Subtle amber background on rows missing BPM
- [x] Click expands/collapses for details
- [x] Uses existing TrackDetail/EnrichmentActions in expanded view

### Task 4.3: Create SearchResultRow component

**File**: `src/components/admin/SearchResultRow.tsx`

Row component for search results (Turso tracks).

**Implementation**:
```typescript
"use client"

import type { SearchResult } from "@/hooks/useAdminTrackSearch"
import { MusicNote, Plus, CheckCircle, SpinnerGap } from "@phosphor-icons/react"
import Image from "next/image"

interface SearchResultRowProps {
  result: SearchResult
  onAddToCatalog: (lrclibId: number) => Promise<void>
  isAdding?: boolean
}

export function SearchResultRow({ result, onAddToCatalog, isAdding }: SearchResultRowProps) {
  const formatDuration = (sec: number) => {
    const min = Math.floor(sec / 60)
    const s = sec % 60
    return `${min}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div className="grid grid-cols-[48px_1fr_80px_120px] gap-2 items-center p-2 hover:bg-muted/50 transition-colors">
      {/* Album Art */}
      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
        {result.albumImageUrl ? (
          <Image
            src={result.albumImageUrl}
            alt=""
            width={48}
            height={48}
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <MusicNote className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Title/Artist/Album */}
      <div className="min-w-0">
        <div className="font-medium truncate">{result.title}</div>
        <div className="text-sm text-muted-foreground truncate">
          {result.artist}
          {result.album && <span className="opacity-70"> · {result.album}</span>}
        </div>
      </div>

      {/* Duration */}
      <div className="text-sm text-muted-foreground text-center">
        {formatDuration(result.durationSec)}
      </div>

      {/* Action */}
      <div className="flex justify-end">
        {result.inCatalog ? (
          <span className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle className="w-4 h-4" weight="fill" />
            In catalog
          </span>
        ) : (
          <button
            onClick={() => onAddToCatalog(result.lrclibId)}
            disabled={isAdding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <SpinnerGap className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add to catalog
          </button>
        )}
      </div>
    </div>
  )
}
```

**Columns**:
| Column | Width | Content |
|--------|-------|---------|
| Art | 48px | `albumImageUrl` or MusicNote icon |
| Title/Artist | flex | Title, Artist · Album |
| Duration | 80px | Formatted duration |
| Action | 120px | "Add to catalog" button or "In catalog" badge |

**Acceptance Criteria**:
- [x] Shows Turso track data (art, title, artist, album, duration)
- [x] Shows "Add to catalog" button if `inCatalog === false`
- [x] Shows "In catalog" badge with checkmark if `inCatalog === true`
- [x] Shows spinner during add operation (`isAdding` prop)
- [x] Button disabled during add operation
- [x] Calls `onAddToCatalog(lrclibId)` on button click

### Task 4.4: Redesign admin songs page

**File**: `src/app/admin/songs/page.tsx`

Complete page redesign with dashboard + search modes.

**Imports**:
```typescript
"use client"

import { useSession } from "next-auth/react"
import { useState, useCallback } from "react"
import { useAdminCatalog, type CatalogFilter, type CatalogSort } from "@/hooks/useAdminCatalog"
import { useAdminTrackSearch } from "@/hooks/useAdminTrackSearch"
import { useDebounce } from "@/hooks/useDebounce"
import { CatalogFilters } from "@/components/admin/CatalogFilters"
import { CatalogTrackRow } from "@/components/admin/CatalogTrackRow"
import { SearchResultRow } from "@/components/admin/SearchResultRow"
import { ArrowLeft, MagnifyingGlass, X, SpinnerGap } from "@phosphor-icons/react"
import Link from "next/link"
import { toast } from "sonner"
```

**State Structure**:
```typescript
// Auth
const { data: session, status } = useSession()
const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

// Search
const [searchInput, setSearchInput] = useState("")
const { debouncedValue: debouncedSearch, isPending: isSearchPending } = useDebounce(searchInput, { delayMs: 300 })

// Catalog filters
const [filter, setFilter] = useState<CatalogFilter>("all")
const [sort, setSort] = useState<CatalogSort>("plays")
const [offset, setOffset] = useState(0)

// Expansion
const [expandedId, setExpandedId] = useState<string | null>(null)

// Add-to-catalog loading state
const [addingLrclibId, setAddingLrclibId] = useState<number | null>(null)

// Data
const catalogData = useAdminCatalog({ filter, sort, offset })
const searchData = useAdminTrackSearch(debouncedSearch)

// Derived
const isSearchMode = searchInput.length > 0
```

**Search Input with Type Detection**:
```typescript
function getSearchPlaceholder(query: string, isPending: boolean, searchType: string | null): string {
  if (isPending) {
    const trimmed = query.trim()
    if (/^\d+$/.test(trimmed)) return "Searching LRCLIB ID..."
    if (trimmed.includes("spotify")) return "Searching Spotify..."
    return "Searching..."
  }
  return "Search tracks or enter LRCLIB/Spotify ID..."
}

// In render:
<div className="relative">
  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
  <input
    type="text"
    value={searchInput}
    onChange={(e) => {
      setSearchInput(e.target.value)
      setOffset(0) // Reset pagination on search
    }}
    placeholder={getSearchPlaceholder(searchInput, isSearchPending, searchData.searchType)}
    className="w-full pl-10 pr-10 py-3 rounded-lg bg-muted border border-border"
  />
  {searchInput && (
    <button
      onClick={() => setSearchInput("")}
      className="absolute right-3 top-1/2 -translate-y-1/2"
    >
      <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
    </button>
  )}
</div>
```

**Add to Catalog Handler**:
```typescript
const handleAddToCatalog = useCallback(async (lrclibId: number) => {
  setAddingLrclibId(lrclibId)
  try {
    const res = await fetch(`/api/admin/tracks/${lrclibId}/add-to-catalog`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json()
      if (res.status === 409) {
        toast.info("Track already in catalog")
      } else {
        throw new Error(data.error || "Failed to add")
      }
    } else {
      toast.success("Track added to catalog")
      searchData.mutate() // Refresh search results
      catalogData.mutate() // Refresh catalog
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to add track")
  } finally {
    setAddingLrclibId(null)
  }
}, [searchData, catalogData])
```

**Mode Switching Render**:
```typescript
{isSearchMode ? (
  // Search results mode
  <div className="space-y-1">
    {searchData.isLoading ? (
      <div className="flex justify-center py-8">
        <SpinnerGap className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    ) : searchData.data?.results.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">No results found</div>
    ) : (
      searchData.data?.results.map((result) => (
        <SearchResultRow
          key={result.lrclibId}
          result={result}
          onAddToCatalog={handleAddToCatalog}
          isAdding={addingLrclibId === result.lrclibId}
        />
      ))
    )}
  </div>
) : (
  // Catalog dashboard mode
  <>
    <CatalogFilters filter={filter} onFilterChange={(f) => { setFilter(f); setOffset(0) }} />
    <div className="space-y-1 mt-4">
      {catalogData.isLoading ? (
        <div className="flex justify-center py-8">
          <SpinnerGap className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        catalogData.data?.tracks.map((track) => (
          <CatalogTrackRow
            key={track.id}
            track={track}
            isExpanded={expandedId === track.id}
            onToggle={() => setExpandedId(expandedId === track.id ? null : track.id)}
          />
        ))
      )}
    </div>
    {/* Pagination */}
    {catalogData.data && (
      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-muted-foreground">
          Showing {offset + 1}-{Math.min(offset + 50, catalogData.data.total)} of {catalogData.data.total}
        </span>
        <div className="flex gap-2">
          <button onClick={() => setOffset(Math.max(0, offset - 50))} disabled={offset === 0}>
            Previous
          </button>
          <button onClick={() => setOffset(offset + 50)} disabled={!catalogData.data.hasMore}>
            Next
          </button>
        </div>
      </div>
    )}
  </>
)}
```

**Acceptance Criteria**:
- [ ] Dashboard mode shows catalog tracks with CatalogTrackRow
- [ ] Search mode activates when `searchInput.length > 0`
- [ ] Debounced search (300ms delay)
- [ ] Placeholder shows detected search type while searching
- [ ] Clear button (X) returns to dashboard mode
- [ ] Missing BPM visually highlighted (amber background + icon)
- [ ] Filter chips work (reset offset on change)
- [ ] Pagination works (Previous/Next buttons)
- [ ] Add to catalog works with toast feedback
- [ ] Loading states for both catalog and search
- [ ] Empty states for no results
- [ ] Mobile responsive (may need responsive grid columns)

---

## File Reference

| File | Phase | Purpose | Status | Dependencies | Notes |
|------|-------|---------|--------|--------------|-------|
| `src/app/api/admin/catalog/route.ts` | 1.1 | Catalog API | Complete | None | Use DbLayer only |
| `src/app/api/admin/tracks/search/route.ts` | 2.1 | Search API | Complete | None | Use ServerLayer (needs Turso) |
| `src/app/api/admin/tracks/[lrclibId]/add-to-catalog/route.ts` | 2.2 | Add to catalog | Complete | None | Reference: copy-enrichment route |
| `src/hooks/useAdminCatalog.ts` | 3.1 | Catalog hook | Complete | Phase 1.1 | Exports shared types |
| `src/hooks/useAdminTrackSearch.ts` | 3.2 | Search hook | Complete | Phase 2.1 | Exports shared types |
| `src/components/admin/CatalogFilters.tsx` | 4.1 | Filter chips | Complete | None | Reference: TracksFilterBar |
| `src/components/admin/CatalogTrackRow.tsx` | 4.2 | Catalog row | Complete | None | Reference: TracksList TrackRow |
| `src/components/admin/SearchResultRow.tsx` | 4.3 | Search row | Complete | Phase 2.2 | — |
| `src/app/admin/songs/page.tsx` | 4.4 | Page redesign | Pending | All above | Reuse TrackDetail, EnrichmentActions |

---

## Implementation Order

The tasks have the following dependency graph:

```
Phase 1.1 (Catalog API) ─────────────────────────────┐
                                                      │
Phase 2.1 (Search API) ─────────────────────────────┐│
                                                     ││
Phase 2.2 (Add to Catalog API) ────────────────────┐││
                                                    │││
Phase 3.1 (useAdminCatalog) ← depends on 1.1 ─────┐│││
                                                   ││││
Phase 3.2 (useAdminTrackSearch) ← depends on 2.1 ┐││││
                                                  │││││
Phase 4.1 (CatalogFilters) ─────────────────────┐│││││
                                                 ││││││
Phase 4.2 (CatalogTrackRow) ───────────────────┐│││││││
                                                │││││││
Phase 4.3 (SearchResultRow) ← depends on 2.2 ─┐││││││││
                                               │││││││││
Phase 4.4 (Page) ← depends on all above ──────┴┴┴┴┴┴┴┴┘
```

**Parallel Execution Groups**:
1. **Group A** (can run in parallel): 1.1, 2.1, 2.2, 4.1, 4.2
2. **Group B** (after Group A): 3.1, 3.2, 4.3
3. **Group C** (final): 4.4

---

## Verification Checklist

**Build & Lint**:
- [ ] `bun run check` passes (lint + typecheck + test)
- [ ] `bun run build` succeeds
- [ ] No TypeScript errors
- [ ] No unused imports or variables

**Performance**:
- [ ] Dashboard loads in < 1 second (Neon query)
- [ ] FTS search responds in < 1 second
- [ ] ID lookups respond in < 200ms

**Functionality**:
- [ ] Dashboard shows catalog tracks sorted by plays
- [ ] Missing BPM tracks have amber background + warning icon
- [ ] Filter "Missing BPM" shows only tracks with `bpm IS NULL`
- [ ] Filter "Missing Enhancement" shows only tracks with `hasEnhancement = false`
- [ ] Filter "No Spotify" shows only tracks with `spotifyId IS NULL`
- [ ] Sort by plays/recent/alpha works
- [ ] Pagination Previous/Next works
- [ ] Search activates on typing (clears filters)
- [ ] LRCLIB ID lookup works (pure digits)
- [ ] Spotify ID lookup works (spotify:track:xxx or URL)
- [ ] FTS search works
- [ ] Add to catalog creates Neon entry + shows success toast
- [ ] Add to catalog returns 409 if already exists
- [ ] Clear search returns to dashboard

**UI/UX**:
- [ ] Mobile responsive (test on small viewport)
- [ ] Loading spinners during data fetch
- [ ] Empty state when no results
- [ ] Row expansion shows track details
- [ ] Toasts for success/error feedback
