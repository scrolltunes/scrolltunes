# Lyrics Page Cold Lookup Optimization Plan

This document outlines performance improvements for the song/lyrics page, focusing on cold lookup latency.

## Current Flow

```
User navigates to /song/[artistSlug]/[trackSlugWithId]
    │
    ▼
Client hydrates (page.tsx is "use client")
    │
    ▼
useEffect triggers fetch to /api/lyrics/[id]
    │
    ▼
API Route (sequential operations):
    1. getCachedBpmFromCatalog (DB)
    2. getLyricsById (LRCLIB API)
    3. lookupSpotifyBySearch (Spotify API)
    4. getBpmWithFallback (multiple BPM providers)
    5. getAlbumArt medium (Deezer API)
    6. getAlbumArt large (Deezer API)
    7. Enhancement query (DB)
    8. Chord enhancement query (DB)
    │
    ▼
Response sent → Client renders lyrics
```

**Problem**: Multiple sequential external API calls + client round-trip = slow cold lookups.

---

## Phase 1: Parallelize API Route (Effort: S, Impact: High)

Parallelize independent operations that are currently sequential.

### 1.1 Parallelize initial lookups

**Current**:
```typescript
const cachedBpm = await getCachedBpmFromCatalog(id)
const lyricsEffect = getLyricsById(id)...
```

**Change**: Run BPM catalog lookup in parallel with lyrics fetch.

```typescript
const [cachedBpm, lyricsResult] = await Promise.all([
  getCachedBpmFromCatalog(id),
  Effect.runPromiseExit(lyricsEffect.pipe(Effect.provide(ServerBaseLayer)))
])
```

### 1.2 Parallelize Spotify lookup when spotifyId is known

**Current**: Always sequential (lyrics → then Spotify lookup).

**Change**: When `spotifyId` is in URL params, run lyrics + Spotify in parallel:

```typescript
if (spotifyId) {
  const [lyrics, spotifyResult] = await Effect.all([
    getLyricsById(id),
    lookupSpotifyById(spotifyId)
  ], { concurrency: 2 })
} else {
  // Current path: lyrics → search-based Spotify lookup
}
```

### 1.3 Parallelize Deezer + Enhancement queries

**Current**:
```typescript
const albumArt = spotifyAlbumArt ?? (await getAlbumArt(..., "medium"))
const albumArtLarge = spotifyAlbumArtLarge ?? (await getAlbumArt(..., "xl"))
const [enhancement] = await db.select(...)
const [chordEnhancement] = await db.select(...)
```

**Change**: Run all four in parallel:

```typescript
const [albumArt, albumArtLarge, enhancement, chordEnhancement] = await Promise.all([
  spotifyAlbumArt ?? getAlbumArt(artist, title, "medium"),
  spotifyAlbumArtLarge ?? getAlbumArt(artist, title, "xl"),
  db.select(...).from(lrcWordEnhancements).where(...).limit(1).then(r => r[0] ?? null),
  db.select(...).from(chordEnhancements).where(...).limit(1).then(r => r[0] ?? null),
])
```

### 1.4 Add Cache-Control headers

**Current**: No caching headers on API response.

**Change**: Add edge caching for immutable song data:

```typescript
return NextResponse.json(body, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
  },
})
```

**Files to modify**:
- `src/app/api/lyrics/[id]/route.ts`

---

## Phase 2: Server-Side Data Fetching (Effort: M, Impact: High)

Eliminate the client→server round-trip by fetching data at render time.

### 2.1 Extract shared data loader

Create a shared function used by both the API route and server component:

```typescript
// src/services/song-loader.ts
export interface SongData {
  readonly _tag: "Success"
  readonly lyrics: Lyrics
  readonly lrcHash: string
  readonly enhancement: EnhancementPayload | null
  readonly chordEnhancement: ChordEnhancementPayloadV1 | null
  readonly bpm: number | null
  readonly key: string | null
  readonly albumArt: string | null
  readonly albumArtLarge: string | null
  readonly spotifyId: string | null
  readonly bpmSource: AttributionSource | null
  readonly lyricsSource: AttributionSource | null
}

export type SongDataResult =
  | SongData
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "InvalidLyrics" }
  | { readonly _tag: "Error"; readonly message: string }

export async function loadSongData(
  lrclibId: number,
  spotifyId: string | null
): Promise<SongDataResult>
```

### 2.2 Convert page to server component + client component split

**Current structure**:
```
page.tsx ("use client") - fetches data in useEffect
```

**New structure**:
```
page.tsx (server component) - fetches data at render time
SongPageClient.tsx ("use client") - receives data as props
```

```typescript
// page.tsx (server component)
import { loadSongData } from "@/services/song-loader"
import { SongPageClient } from "./SongPageClient"

export default async function SongPage({ params, searchParams }) {
  const lrclibId = parseTrackSlugWithId(params.trackSlugWithId)
  const spotifyId = searchParams.spotifyId ?? null

  if (lrclibId === null) {
    return <SongPageClient initialState={{ _tag: "Error", errorType: "invalid-url" }} />
  }

  const result = await loadSongData(lrclibId, spotifyId)
  return <SongPageClient initialState={result} lrclibId={lrclibId} />
}
```

### 2.3 Update layout to reuse loader

Currently `generateMetadata` duplicates the LRCLIB + Deezer calls. Reuse `loadSongData`:

```typescript
export async function generateMetadata({ params, searchParams }): Promise<Metadata> {
  const lrclibId = parseTrackSlugWithId(params.trackSlugWithId)
  if (lrclibId === null) return { title: "Song | ScrollTunes" }

  const result = await loadSongData(lrclibId, searchParams.spotifyId ?? null)
  if (result._tag !== "Success") return { title: "Song | ScrollTunes" }

  const pageTitle = `${result.lyrics.title} by ${result.lyrics.artist} | ScrollTunes`
  // ... rest of metadata
}
```

**Files to modify**:
- Create `src/services/song-loader.ts`
- `src/app/song/[artistSlug]/[trackSlugWithId]/page.tsx` → split into server + client
- `src/app/song/[artistSlug]/[trackSlugWithId]/layout.tsx`
- `src/app/api/lyrics/[id]/route.ts` → use shared loader

---

## Phase 3: Extended Catalog Caching (Effort: M, Impact: Medium)

Cache more data in the catalog to avoid redundant external API calls on warm hits.

### 3.1 Extend catalog schema

Add fields to `songs` table:

```typescript
// Additional columns
albumArtUrl: text("album_art_url"),
albumArtLargeUrl: text("album_art_large_url"),
```

### 3.2 Extend catalog lookup

**Current**: `getCachedBpmFromCatalog` only fetches BPM fields.

**Change**: Create `getCachedSongFromCatalog` that also returns:
- `spotifyId`
- `album`
- `albumArtUrl`
- `albumArtLargeUrl`

### 3.3 Skip external calls when cached

In `loadSongData`:

```typescript
const cached = await getCachedSongFromCatalog(lrclibId)

if (cached) {
  // Skip Spotify lookup if we have spotifyId + albumArt cached
  // Skip Deezer if we have albumArtUrl cached
}
```

**Files to modify**:
- `src/lib/db/schema.ts` (add columns)
- `drizzle/` (migration)
- `src/app/api/lyrics/[id]/route.ts` (or song-loader.ts)

---

## Phase 4: Defer Non-Critical Work (Effort: M, Impact: Medium)

Move non-essential data off the critical path.

### 4.1 Defer BPM on cache miss

**Current**: BPM providers block response.

**Change**: Return immediately with `bpm: null`, fetch BPM in background:

```typescript
if (!cachedBpm) {
  // Fire-and-forget BPM fetch
  fetchAndCacheBpm(lrclibId, lyrics.title, lyrics.artist, spotifyId).catch(console.error)
  
  // Return response without waiting
  return { ...response, bpm: null, key: null }
}
```

Client shows "Detecting tempo..." placeholder, polls or re-fetches later.

### 4.2 Defer large album art

**Current**: Both medium + large fetched on critical path.

**Change**: Only fetch medium initially:

```typescript
// Initial response
albumArt: spotifyAlbumArt ?? await getAlbumArt(artist, title, "medium"),
albumArtLarge: null, // Defer
```

Fetch large art lazily when share modal opens or via `requestIdleCallback`.

### 4.3 Defer enhancements (optional)

Split enhancements into separate endpoint `/api/lyrics/[id]/enhancements`:

```typescript
// Initial response
hasEnhancement: true,
hasChordEnhancement: true,
enhancement: null,      // Deferred
chordEnhancement: null, // Deferred
```

Client fetches enhancements after initial render if flags are true.

**Files to modify**:
- `src/services/song-loader.ts`
- `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx`
- Create `src/app/api/lyrics/[id]/enhancements/route.ts` (optional)

---

## Phase 5: Future Optimizations (Effort: L)

For later consideration if Phase 1-4 aren't sufficient.

### 5.1 Cache lyrics in database

Store LRCLIB responses in own DB to eliminate external dependency:

```typescript
// New table
lyricsCache: {
  lrclibId: integer,
  payload: jsonb, // Full LRCLIB response
  fetchedAt: timestamp,
}
```

### 5.2 Pre-warm popular songs

Background job to pre-fetch and cache data for popular/trending songs.

### 5.3 Edge-rendered snapshots

Precompute complete "song snapshots" stored in KV/edge cache for instant delivery.

---

## Implementation Priority

| Phase | Effort | Impact | Priority | Status |
|-------|--------|--------|----------|--------|
| 1.1 Parallelize initial lookups | S | High | 🔴 P0 | ✅ Done |
| 1.2 Parallelize Spotify when ID known | S | Medium | 🔴 P0 | ✅ Done |
| 1.3 Parallelize Deezer + enhancements | S | Medium | 🔴 P0 | ✅ Done |
| 1.4 Add Cache-Control headers | S | High | 🔴 P0 | ✅ Done |
| 2.1-2.3 Server-side fetching | M | High | 🟠 P1 | ✅ Done |
| 3.1-3.3 Extended catalog caching | M | Medium | 🟡 P2 | ✅ Done |
| 4.1 Defer BPM | M | Medium | 🟡 P2 | ✅ Done |
| 4.2 Defer large album art | S | Low | 🟢 P3 | ⏸️ Skipped (cached with regular art) |
| 4.3 Defer enhancements | M | Low | 🟢 P3 | ✅ Done |
| 5.x Future optimizations | L | Varies | 🔵 Later | ⏳ Pending |

---

## Success Metrics

- **Cold lookup P50**: Target < 800ms (from ~1.5-2s)
- **Cold lookup P95**: Target < 1.5s
- **Warm lookup (cached)**: Target < 200ms
- **Time to first lyrics visible**: Target < 1s

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Parallelization error propagation | Catch errors per-call, return `null` for optional data |
| SSR/CSR hydration mismatch | Ensure client doesn't re-fetch if `initialState` is success |
| Cache invalidation | Use `updatedAt` + reasonable TTL (24h), lyrics rarely change |
| External API rate limits | Parallelization reduces total calls; caching reduces frequency |
