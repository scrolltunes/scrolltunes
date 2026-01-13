/**
 * Album art resolution with three-tier priority chain:
 * 1. Stored URL from Turso (instant, pre-enriched from Spotify dump)
 * 2. Deezer ISRC lookup (direct, ~100ms)
 * 3. Deezer search fallback (~200ms)
 */

import { type AlbumArtSize, getAlbumArt } from "@/lib/deezer-client"
import type { TursoSearchResult } from "@/services/turso"
import { Effect } from "effect"

/**
 * Fetch album art from Deezer by ISRC (International Standard Recording Code)
 * Returns the cover URL or null if not found
 */
const fetchDeezerByIsrc = (
  isrc: string,
  size: AlbumArtSize = "medium",
): Effect.Effect<string | null, never, never> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`https://api.deezer.com/track/isrc:${isrc}`, {
        cache: "force-cache",
        next: { revalidate: 86400 }, // 24 hours
      })
      if (!response.ok) return null
      const data = (await response.json()) as {
        album?: {
          cover_small?: string
          cover_medium?: string
          cover_big?: string
          cover_xl?: string
        }
      }
      const sizeKey = `cover_${size}` as const
      return data.album?.[sizeKey] ?? null
    },
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)))

/**
 * Get album art for a track using priority chain:
 * 1. Stored URL from Turso (instant)
 * 2. Deezer ISRC lookup (~100ms)
 * 3. Deezer search fallback (~200ms)
 */
export const getAlbumArtForTrack = (
  track: TursoSearchResult,
  size: AlbumArtSize = "medium",
): Effect.Effect<string | null, never, never> =>
  Effect.gen(function* () {
    // Priority 1: Stored URL from Spotify dump (instant)
    if (track.albumImageUrl) {
      return track.albumImageUrl
    }

    // Priority 2: Deezer ISRC lookup (direct, ~100ms)
    if (track.isrc) {
      const isrcResult = yield* fetchDeezerByIsrc(track.isrc, size)
      if (isrcResult) return isrcResult
    }

    // Priority 3: Deezer search fallback (~200ms)
    const searchResult = yield* Effect.tryPromise({
      try: () => getAlbumArt(track.artist, track.title, size),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    return searchResult
  })

/**
 * Get large album art for share editor / export features
 * Uses runtime lookup for high-resolution images (640px+)
 */
export const getLargeAlbumArt = (
  track: TursoSearchResult,
): Effect.Effect<string | null, never, never> =>
  Effect.gen(function* () {
    // For large images, prefer runtime lookup for quality
    // Stored URLs are medium (300px), we need large (640px+)

    // Priority 1: Deezer ISRC lookup (returns multiple sizes)
    if (track.isrc) {
      const isrcResult = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(`https://api.deezer.com/track/isrc:${track.isrc}`, {
            cache: "force-cache",
            next: { revalidate: 86400 },
          })
          if (!response.ok) return null
          const data = (await response.json()) as {
            album?: {
              cover_xl?: string
              cover_big?: string
            }
          }
          return data.album?.cover_xl ?? data.album?.cover_big ?? null
        },
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (isrcResult) return isrcResult
    }

    // Priority 2: Deezer search for large image
    const searchResult = yield* Effect.tryPromise({
      try: () => getAlbumArt(track.artist, track.title, "xl"),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

    return searchResult
  })
