# Spec 003: Search API - Turso-First Architecture

## Overview

Simplify the search API to be Turso-first, leveraging embedded popularity and album art URLs. Remove Spotify Search API dependency.

## Context

- **Current file**: `src/app/api/search/route.ts`
- **Current flow**: Spotify Search → Turso verification → Deezer album art
- **New flow**: Turso search (with popularity ranking) → Deezer fallback for album art

## Requirements

### 3.1 New Search Flow

```
User types query
       │
       ▼
┌─────────────────────┐
│   Turso FTS Search  │  → ~100-350ms
│   ORDER BY:         │
│     popularity DESC │
│     quality DESC    │
│     bm25() ASC      │
└──────────┬──────────┘
           │
           ▼ (results have spotify_id, tempo, album_image_url, etc.)
┌─────────────────────┐
│   Return directly   │
│   No Spotify API!   │
└─────────────────────┘
```

### 3.2 Remove Spotify Search Integration

Delete or deprecate:
- `searchSpotifyWithTurso()` function
- `findLrclibMatch()` function
- `SpotifyTrackWithLrclib` interface
- Imports from `@/lib/spotify-client` (if only used for search)

### 3.3 New Primary Search Function

```typescript
function searchTurso(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, TursoService | ServerConfig | FetchService> {
  return Effect.gen(function* () {
    const turso = yield* TursoService
    const results = yield* turso.search(query, limit).pipe(
      Effect.catchAll(error => {
        console.log("[SEARCH] Turso search failed:", error.message)
        return Effect.succeed([] as readonly TursoSearchResult[])
      }),
    )

    if (results.length === 0) {
      return []
    }

    console.log(`[SEARCH] Turso returned ${results.length} results`)

    // Enrich with album art (use stored URL or fallback to Deezer)
    const enriched = yield* Effect.all(
      results.map(r => enrichWithAlbumArt(r)),
      { concurrency: 4 },
    )

    return enriched
  })
}
```

### 3.4 Album Art Enrichment

```typescript
function enrichWithAlbumArt(
  result: TursoSearchResult,
): Effect.Effect<SearchResultTrack, never, FetchService> {
  return Effect.gen(function* () {
    // Priority 1: Stored URL from Spotify dump (instant)
    let albumArt = result.albumImageUrl

    // Priority 2: Deezer lookup (if no stored URL)
    if (!albumArt) {
      albumArt = yield* Effect.tryPromise({
        try: () => getAlbumArt(result.artist, result.title, "medium"),
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    }

    return {
      id: `lrclib-${result.id}`,
      lrclibId: result.id,
      spotifyId: result.spotifyId ?? undefined,
      name: result.title,
      artist: result.artist,
      album: result.album ?? "",
      albumArt: albumArt ?? undefined,
      duration: result.durationSec * 1000,
      hasLyrics: true,
      // NEW: Expose enrichment data
      popularity: result.popularity ?? undefined,
      tempo: result.tempo ?? undefined,
    } satisfies SearchResultTrack
  })
}
```

### 3.5 Update SearchResultTrack Type

```typescript
// src/lib/search-api-types.ts

export interface SearchResultTrack {
  readonly id: string
  readonly lrclibId: number
  readonly spotifyId?: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string
  readonly duration: number
  readonly hasLyrics: boolean
  // NEW: Enrichment data
  readonly popularity?: number  // 0-100
  readonly tempo?: number       // BPM
}
```

### 3.6 Updated Search Function

```typescript
function search(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, FetchService | TursoService | ServerConfig> {
  return searchTurso(query, limit).pipe(
    Effect.flatMap(results => {
      if (results.length > 0) {
        console.log(`[SEARCH] Turso returned ${results.length} results`)
        return Effect.succeed(results)
      }
      console.log("[SEARCH] Turso returned no results, falling back to LRCLIB API")
      return searchLRCLibFallback(query, limit)
    }),
  )
}
```

### 3.7 Remove SpotifyService Dependency

Update the `search` function signature to no longer require `SpotifyService`:

```typescript
// Before
Effect.Effect<SearchResultTrack[], never, FetchService | SpotifyService | TursoService | ServerConfig>

// After
Effect.Effect<SearchResultTrack[], never, FetchService | TursoService | ServerConfig>
```

### 3.8 Keep LRCLIB API Fallback

Retain `searchLRCLibFallback()` for edge cases where Turso is unavailable or returns no results.

## Acceptance Criteria

1. Search works without any Spotify API calls
2. Popular songs rank first in results (Metallica's "Nothing Else Matters" before covers)
3. Album art displays from stored URLs when available
4. Deezer fallback works for tracks without stored album art
5. `bun run typecheck` passes
6. Search latency reduced (no external API calls)

## Files to Modify

- `src/app/api/search/route.ts` - Simplify to Turso-first
- `src/lib/search-api-types.ts` - Add popularity/tempo to SearchResultTrack

## Files to Potentially Remove

- `src/app/api/search/verify/route.ts` - May no longer be needed

## Testing

```bash
# TypeScript check
bun run typecheck

# Manual API test
curl "http://localhost:3000/api/search?q=nothing+else+matters" | jq '.'

# Verify popularity ranking (original should be first)
curl "http://localhost:3000/api/search?q=nothing+else+matters" | jq '.tracks[0].popularity'
# Should be 80+ for Metallica's version
```
