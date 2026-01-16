/**
 * Album art resolution with priority chain:
 * 1. Stored URL from Turso (instant, pre-enriched from Spotify dump)
 * 2. Spotify API lookup by ID (if spotifyId available, ~100ms)
 * 3. Race: Spotify search vs Deezer search (~200ms)
 */

import { type AlbumArtSize, getAlbumArt as getDeezerAlbumArt } from "@/lib/deezer-client"
import { SpotifyService } from "@/lib/spotify-client"
import type { TursoSearchResult } from "@/services/turso"
import { Effect } from "effect"

/**
 * Get album image URL from Spotify track, preferring ~300px size
 */
function getSpotifyImageUrl(
  images: readonly { url: string; height: number | null; width: number | null }[],
  size: AlbumArtSize,
): string | null {
  if (images.length === 0) return null

  // Target heights for each size
  const targetHeight = size === "small" ? 64 : size === "medium" ? 300 : size === "big" ? 640 : 640

  // Sort by distance from target height
  const sorted = [...images].sort((a, b) => {
    const aDist = Math.abs((a.height ?? 0) - targetHeight)
    const bDist = Math.abs((b.height ?? 0) - targetHeight)
    return aDist - bDist
  })

  return sorted[0]?.url ?? null
}

/**
 * Fetch album art from Spotify by track ID
 */
const fetchSpotifyById = (
  spotifyId: string,
  size: AlbumArtSize,
): Effect.Effect<string | null, never, SpotifyService> =>
  Effect.gen(function* () {
    const spotify = yield* SpotifyService
    const track = yield* spotify.getTrack(spotifyId).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )
    if (!track) return null
    return getSpotifyImageUrl(track.album.images, size)
  })

/**
 * Search Spotify for album art by artist and title
 */
const searchSpotify = (
  artist: string,
  title: string,
  size: AlbumArtSize,
): Effect.Effect<string | null, never, SpotifyService> =>
  Effect.gen(function* () {
    const spotify = yield* SpotifyService
    const query = `${title} ${artist}`
    const result = yield* spotify.searchTracks(query, 1).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )
    if (!result?.tracks?.items?.[0]) return null
    return getSpotifyImageUrl(result.tracks.items[0].album.images, size)
  })

/**
 * Search Deezer for album art by artist and title
 */
const searchDeezer = (
  artist: string,
  title: string,
  size: AlbumArtSize,
): Effect.Effect<string | null, never, never> =>
  Effect.tryPromise({
    try: () => getDeezerAlbumArt(artist, title, size),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)))

/**
 * Get album art for a track using priority chain:
 * 1. Stored URL from Turso (instant)
 * 2. Spotify API by ID (if spotifyId available)
 * 3. Race: Spotify search vs Deezer search
 */
export const getAlbumArtForTrack = (
  track: TursoSearchResult,
  size: AlbumArtSize = "medium",
): Effect.Effect<string | null, never, SpotifyService> =>
  Effect.gen(function* () {
    // Priority 1: Stored URL from Spotify dump (instant)
    if (track.albumImageUrl) {
      return track.albumImageUrl
    }

    // Priority 2: Spotify API by ID (if we have spotifyId)
    if (track.spotifyId) {
      const spotifyResult = yield* fetchSpotifyById(track.spotifyId, size)
      if (spotifyResult) return spotifyResult
    }

    // Priority 3: Race between Spotify search and Deezer search
    const spotifySearch = searchSpotify(track.artist, track.title, size)
    const deezerSearch = searchDeezer(track.artist, track.title, size)

    // Race both searches, return first non-null result
    const raceResult = yield* Effect.raceAll([
      spotifySearch.pipe(Effect.map(r => ({ source: "spotify" as const, url: r }))),
      deezerSearch.pipe(Effect.map(r => ({ source: "deezer" as const, url: r }))),
    ]).pipe(
      Effect.flatMap(result => {
        if (result.url) return Effect.succeed(result.url)
        // First one returned null, wait for the other
        return result.source === "spotify" ? deezerSearch : spotifySearch
      }),
    )

    return raceResult
  })

/**
 * Get large album art for share editor / export features
 * Uses runtime lookup for high-resolution images (640px+)
 */
export const getLargeAlbumArt = (
  track: TursoSearchResult,
): Effect.Effect<string | null, never, SpotifyService> =>
  Effect.gen(function* () {
    // Priority 1: Spotify API by ID (if we have spotifyId)
    if (track.spotifyId) {
      const spotifyResult = yield* fetchSpotifyById(track.spotifyId, "xl")
      if (spotifyResult) return spotifyResult
    }

    // Priority 2: Race between Spotify search and Deezer search
    const spotifySearch = searchSpotify(track.artist, track.title, "xl")
    const deezerSearch = searchDeezer(track.artist, track.title, "xl")

    const raceResult = yield* Effect.raceAll([
      spotifySearch.pipe(Effect.map(r => ({ source: "spotify" as const, url: r }))),
      deezerSearch.pipe(Effect.map(r => ({ source: "deezer" as const, url: r }))),
    ]).pipe(
      Effect.flatMap(result => {
        if (result.url) return Effect.succeed(result.url)
        return result.source === "spotify" ? deezerSearch : spotifySearch
      }),
    )

    return raceResult
  })
