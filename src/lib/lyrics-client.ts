/**
 * Lyrics client for fetching synced lyrics from LRCLIB API
 *
 * Server-side only - uses Effect.ts patterns with tagged error classes.
 *
 * ## Effect Patterns Used
 *
 * 1. **Tagged Error Classes** - Uses `Data.TaggedClass` for discriminated union errors.
 *    The `_tag` field enables exhaustive pattern matching in error handlers.
 *
 * 2. **Effect.gen** - Generator syntax for sequential, imperative-style Effect composition.
 *    Uses `yield*` to unwrap Effect values, similar to async/await but type-safe.
 *
 * 3. **Effect.tryPromise** - Wraps Promise-returning functions, converting rejections
 *    to typed Effect failures.
 *
 * 4. **Effect.fail** - Constructs a failed Effect with a typed error value.
 *
 * 5. **Effect.orElse** - Fallback combinator for error recovery with alternative Effects.
 *
 * 6. **Effect.runPromise** - Converts Effect to Promise for async wrapper functions.
 *    Used at the edge where Effect meets Promise-based consumers.
 */

import type { Lyrics } from "@/core"
import { Data, Effect } from "effect"
import { parseLRC } from "./lyrics-parser"

// --- Error Classes ---

/**
 * Lyrics not found for the requested track.
 * Uses Data.TaggedClass for discriminated union pattern matching.
 */
export class LyricsNotFoundError extends Data.TaggedClass("LyricsNotFoundError")<{
  readonly trackName: string
  readonly artistName: string
}> {}

/**
 * API-level error (network, HTTP status, parse failure).
 * Uses Data.TaggedClass for discriminated union pattern matching.
 */
export class LyricsAPIError extends Data.TaggedClass("LyricsAPIError")<{
  readonly status: number
  readonly message: string
}> {}

export type LyricsError = LyricsNotFoundError | LyricsAPIError

// --- API Response Types ---

export interface LRCLibResponse {
  readonly id: number
  readonly trackName: string
  readonly artistName: string
  readonly albumName: string | null
  readonly duration: number
  readonly syncedLyrics: string | null
  readonly plainLyrics: string | null
}

// --- Constants ---

const LRCLIB_BASE_URL = "https://lrclib.net/api"

const headers = {
  "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)",
}

// --- Effect-based Functions ---

/**
 * Fetch lyrics for a song using all LRCLIB required params.
 *
 * Returns `Effect.Effect<Lyrics, LyricsError>` - a lazy, composable computation
 * that will fetch lyrics when executed. The error channel is typed to the
 * union of possible failures (LyricsNotFoundError | LyricsAPIError).
 *
 * Uses Effect.gen for sequential composition with yield* to unwrap each step.
 */
export const getLyrics = (
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration: durationSeconds.toString(),
    })

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/get?${params.toString()}`, { headers }),
      catch: () => new LyricsAPIError({ status: 0, message: "Network error" }),
    })

    if (response.status === 404) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new LyricsAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse>,
      catch: () => new LyricsAPIError({ status: 0, message: "Failed to parse response" }),
    })

    if (!data.syncedLyrics) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    const songId = `lrclib-${data.id}`
    return parseLRC(data.syncedLyrics, songId, data.trackName, data.artistName)
  })
}

/**
 * Fetch lyrics from LRCLIB cached endpoint (faster, no external source fetch).
 *
 * Uses the `/api/get-cached` endpoint which only returns locally cached results.
 */
export const getLyricsCached = (
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration: durationSeconds.toString(),
    })

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/get-cached?${params.toString()}`, { headers }),
      catch: () => new LyricsAPIError({ status: 0, message: "Network error" }),
    })

    if (response.status === 404) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new LyricsAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse>,
      catch: () => new LyricsAPIError({ status: 0, message: "Failed to parse response" }),
    })

    if (!data.syncedLyrics) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    const songId = `lrclib-${data.id}`
    return parseLRC(data.syncedLyrics, songId, data.trackName, data.artistName)
  })
}

/**
 * Search result from LRCLIB containing track metadata
 */
export interface LRCLibTrackResult {
  readonly id: number
  readonly trackName: string
  readonly artistName: string
  readonly albumName: string | null
  readonly duration: number
  readonly hasSyncedLyrics: boolean
}

/**
 * Search LRCLIB for tracks matching the query.
 * Returns track metadata without fetching full lyrics.
 *
 * Useful for checking lyrics availability before selection.
 */
export const searchLRCLibTracks = (
  query: string,
): Effect.Effect<readonly LRCLibTrackResult[], LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({ q: query })

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/search?${params.toString()}`, { headers }),
      catch: () => new LyricsAPIError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new LyricsAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const results = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse[]>,
      catch: () => new LyricsAPIError({ status: 0, message: "Failed to parse response" }),
    })

    return results.map(r => ({
      id: r.id,
      trackName: r.trackName,
      artistName: r.artistName,
      albumName: r.albumName,
      duration: r.duration,
      hasSyncedLyrics: r.syncedLyrics !== null && r.syncedLyrics.length > 0,
    }))
  })
}

/**
 * Search for lyrics and return the first match with synced lyrics.
 *
 * Similar to getLyrics but uses the search endpoint which may return
 * multiple results. Filters for the first result with syncedLyrics available.
 */
export const searchLyrics = (
  trackName: string,
  artistName: string,
  albumName?: string,
): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })
    if (albumName) {
      params.set("album_name", albumName)
    }

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/search?${params.toString()}`, { headers }),
      catch: () => new LyricsAPIError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new LyricsAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const results = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse[]>,
      catch: () => new LyricsAPIError({ status: 0, message: "Failed to parse response" }),
    })

    const syncedResult = results.find(r => r.syncedLyrics)
    if (!syncedResult?.syncedLyrics) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    const songId = `lrclib-${syncedResult.id}`
    return parseLRC(
      syncedResult.syncedLyrics,
      songId,
      syncedResult.trackName,
      syncedResult.artistName,
    )
  })
}

/**
 * Get lyrics by Spotify track ID.
 *
 * Currently returns Effect.fail since LRCLIB doesn't support Spotify IDs.
 * Placeholder for future integration with Spotify-aware lyrics APIs.
 *
 * Demonstrates Effect.fail for immediate typed failure construction.
 */
export const getLyricsBySpotifyId = (trackId: string): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.fail(
    new LyricsAPIError({
      status: 501,
      message: `Spotify ID lookup not supported by LRCLIB. Track ID: ${trackId}`,
    }),
  )
}

// --- Async Convenience Wrappers ---
// These use Effect.runPromise to convert Effects to Promises for consumers
// that aren't Effect-aware. Errors become Promise rejections.

/**
 * Fetch lyrics for a song (async wrapper).
 *
 * Uses Effect.runPromise to execute the Effect and convert to Promise.
 * LyricsError failures become Promise rejections.
 */
export async function fetchLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Promise<Lyrics> {
  return Effect.runPromise(getLyrics(trackName, artistName, albumName, durationSeconds))
}

/**
 * Fetch lyrics from cached endpoint (async wrapper).
 */
export async function fetchLyricsCached(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Promise<Lyrics> {
  return Effect.runPromise(getLyricsCached(trackName, artistName, albumName, durationSeconds))
}

/**
 * Search for lyrics (async wrapper).
 */
export async function fetchLyricsSearch(
  trackName: string,
  artistName: string,
  albumName?: string,
): Promise<Lyrics> {
  return Effect.runPromise(searchLyrics(trackName, artistName, albumName))
}

/**
 * Search LRCLIB for tracks (async wrapper).
 */
export async function fetchLRCLibTracks(query: string): Promise<readonly LRCLibTrackResult[]> {
  return Effect.runPromise(searchLRCLibTracks(query))
}

/**
 * Fetch lyrics with fallback chain: cached -> full lookup -> search.
 *
 * Demonstrates Effect.orElse for error recovery - tries each source
 * in order until one succeeds or all fail.
 */
export async function fetchLyricsWithFallback(
  trackName: string,
  artistName: string,
  albumName: string,
  durationSeconds: number,
): Promise<Lyrics> {
  const effect = Effect.orElse(
    getLyricsCached(trackName, artistName, albumName, durationSeconds),
    () =>
      Effect.orElse(getLyrics(trackName, artistName, albumName, durationSeconds), () =>
        searchLyrics(trackName, artistName, albumName),
      ),
  )
  return Effect.runPromise(effect)
}
