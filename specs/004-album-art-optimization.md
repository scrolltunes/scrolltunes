# Spec 004: Album Art Optimization

## Overview

Implement a three-tier album art strategy using stored URLs, Deezer ISRC lookup, and Deezer search fallback.

## Context

- **Current approach**: Deezer search API for all album art (~200ms per request)
- **New approach**: Pre-stored URLs (0ms) → Deezer ISRC (100ms) → Deezer search (200ms)

## Requirements

### 4.1 Album Art Priority Chain

```typescript
async function getAlbumArtForTrack(track: TursoSearchResult): Promise<string | null> {
  // Priority 1: Stored URL from Spotify dump (0ms, pre-enriched)
  if (track.albumImageUrl) {
    return track.albumImageUrl
  }

  // Priority 2: Deezer ISRC lookup (no auth, direct, ~100ms)
  if (track.isrc) {
    try {
      const response = await fetch(`https://api.deezer.com/track/isrc:${track.isrc}`)
      if (response.ok) {
        const data = await response.json()
        if (data.album?.cover_medium) {
          return data.album.cover_medium
        }
      }
    } catch {
      // Fall through to search
    }
  }

  // Priority 3: Deezer search fallback (current approach, ~200ms)
  return getAlbumArt(track.artist, track.title, "medium")
}
```

### 4.2 Effect-Based Implementation

```typescript
// src/lib/album-art.ts

import { Effect } from "effect"
import type { TursoSearchResult } from "@/services/turso"
import { getAlbumArt } from "@/lib/deezer-client"

export const getAlbumArtForTrack = (
  track: TursoSearchResult,
): Effect.Effect<string | null, never, never> =>
  Effect.gen(function* () {
    // Priority 1: Stored URL
    if (track.albumImageUrl) {
      return track.albumImageUrl
    }

    // Priority 2: Deezer ISRC lookup
    if (track.isrc) {
      const isrcResult = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(`https://api.deezer.com/track/isrc:${track.isrc}`)
          if (!response.ok) return null
          const data = await response.json()
          return data.album?.cover_medium ?? null
        },
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (isrcResult) return isrcResult
    }

    // Priority 3: Deezer search
    const searchResult = yield* Effect.tryPromise({
      try: () => getAlbumArt(track.artist, track.title, "medium"),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    return searchResult
  })
```

### 4.3 Large Album Art (Share Editor)

For share/export features that need high-resolution images:

```typescript
export const getLargeAlbumArt = (
  track: TursoSearchResult,
): Effect.Effect<string | null, never, never> =>
  Effect.gen(function* () {
    // For large images, prefer runtime lookup for freshness
    // Stored URLs are medium (300px), we need large (640px+)

    // Priority 1: Deezer ISRC lookup (returns multiple sizes)
    if (track.isrc) {
      const isrcResult = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(`https://api.deezer.com/track/isrc:${track.isrc}`)
          if (!response.ok) return null
          const data = await response.json()
          return data.album?.cover_xl ?? data.album?.cover_big ?? null
        },
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (isrcResult) return isrcResult
    }

    // Priority 2: Deezer search for large image
    const searchResult = yield* Effect.tryPromise({
      try: () => getAlbumArt(track.artist, track.title, "large"),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    return searchResult
  })
```

### 4.4 Update Deezer Client

Add size parameter support if not already present:

```typescript
// src/lib/deezer-client.ts

export type AlbumArtSize = "small" | "medium" | "large" | "xl"

export async function getAlbumArt(
  artist: string,
  title: string,
  size: AlbumArtSize = "medium",
): Promise<string | null> {
  // ... existing search logic ...

  const sizeKey = {
    small: "cover_small",
    medium: "cover_medium",
    large: "cover_big",
    xl: "cover_xl",
  }[size]

  return data.album?.[sizeKey] ?? null
}
```

### 4.5 Spotify CDN URL Handling

Spotify CDN URLs typically follow this pattern:
```
https://i.scdn.co/image/{hash}
```

These URLs are generally stable for years but may eventually expire. Handle gracefully:

```typescript
function isValidImageUrl(url: string | null): boolean {
  if (!url) return false
  // Could add validation logic here if needed
  return true
}
```

### 4.6 Metrics Logging

Add logging to track album art source usage:

```typescript
console.log(`[ALBUM_ART] Source: ${source} for ${artist} - ${title}`)
// Where source is: "stored" | "isrc" | "search" | "none"
```

## Acceptance Criteria

1. Tracks with `album_image_url` display immediately (no network request)
2. Tracks with ISRC but no stored URL use Deezer ISRC lookup
3. Tracks without ISRC fall back to Deezer search
4. Large album art (share editor) uses runtime lookup for quality
5. Graceful degradation when all methods fail (show placeholder)
6. No breaking changes to existing album art display

## Files to Create

- `src/lib/album-art.ts` - New album art resolution module

## Files to Modify

- `src/app/api/search/route.ts` - Use new album art resolution
- `src/lib/deezer-client.ts` - Add ISRC lookup function (if not present)

## Testing

```bash
# TypeScript check
bun run typecheck

# Test stored URL (should be instant)
curl "http://localhost:3000/api/search?q=nothing+else+matters" | jq '.tracks[0].albumArt'

# Test ISRC lookup (for track without stored URL but with ISRC)
# Verify in browser Network tab that Deezer ISRC endpoint is called
```
