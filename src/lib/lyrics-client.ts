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
import { FetchService } from "@/services/fetch"
import { Data, Effect } from "effect"
import { parseLRC } from "./lyrics-parser"
import { formatArtists, searchTracksEffect, type SpotifyService } from "./spotify-client"

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

/**
 * Lyrics data is invalid or malformed (e.g., no valid synced lines).
 * Uses Data.TaggedClass for discriminated union pattern matching.
 */
export class LyricsInvalidError extends Data.TaggedClass("LyricsInvalidError")<{
  readonly id: number
  readonly trackName: string
  readonly artistName: string
  readonly reason: string
}> {}

export type LyricsError = LyricsNotFoundError | LyricsAPIError | LyricsInvalidError

type LyricsClientEnv = FetchService
type LyricsSpotifyEnv = FetchService | SpotifyService

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

const fetchResponse = (
  url: string,
  init?: RequestInit,
  message = "Network error",
): Effect.Effect<Response, LyricsAPIError, FetchService> =>
  FetchService.pipe(
    Effect.flatMap(({ fetch }) =>
      fetch(url, init).pipe(
        Effect.mapError(() => new LyricsAPIError({ status: 0, message })),
      ),
    ),
  )

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
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration: durationSeconds.toString(),
    })

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/get?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
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
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration: durationSeconds.toString(),
    })

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/get-cached?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
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
): Effect.Effect<readonly LRCLibTrackResult[], LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({ q: query })

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/search?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
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
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })
    if (albumName) {
      params.set("album_name", albumName)
    }

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/search?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
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
 * Fetch lyrics by LRCLIB numeric ID.
 *
 * Uses the `/api/get/{id}` endpoint to fetch lyrics by database ID.
 * Useful when you already have a track ID from a previous search.
 */
export const getLyricsById = (
  id: number,
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/get/${id}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
    })

    if (response.status === 404) {
      return yield* Effect.fail(
        new LyricsNotFoundError({ trackName: `ID: ${id}`, artistName: "unknown" }),
      )
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
      return yield* Effect.fail(
        new LyricsNotFoundError({ trackName: data.trackName, artistName: data.artistName }),
      )
    }

    const songId = `lrclib-${data.id}`
    const lyrics = parseLRC(data.syncedLyrics, songId, data.trackName, data.artistName)

    if (lyrics.lines.length === 0) {
      return yield* Effect.fail(
        new LyricsInvalidError({
          id: data.id,
          trackName: data.trackName,
          artistName: data.artistName,
          reason: "No valid synced lyrics lines found",
        }),
      )
    }

    return lyrics
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
export const getLyricsBySpotifyId = (
  trackId: string,
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.fail(
    new LyricsAPIError({
      status: 501,
      message: `Spotify ID lookup not supported by LRCLIB. Track ID: ${trackId}`,
    }),
  )
}

/**
 * Search LRCLIB for a single track by name and artist.
 * Returns empty array on error (for parallel aggregation).
 */
const searchLRCLibByTrack = (
  trackName: string,
  artistName: string,
): Effect.Effect<readonly LRCLibTrackResult[], never, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/search?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
    }).pipe(Effect.orElseSucceed(() => null))

    if (!response || !response.ok) {
      return []
    }

    const results = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse[]>,
      catch: () => [] as LRCLibResponse[],
    })

    return results.map(r => ({
      id: r.id,
      trackName: r.trackName,
      artistName: r.artistName,
      albumName: r.albumName,
      duration: r.duration,
      hasSyncedLyrics: r.syncedLyrics !== null && r.syncedLyrics.length > 0,
    }))
  }).pipe(Effect.catchAll(() => Effect.succeed([] as readonly LRCLibTrackResult[])))
}

/**
 * Search LRCLIB using Spotify metadata for improved accuracy.
 *
 * Flow:
 * 1. Search Spotify for top 8 results to get canonical track metadata
 * 2. Search LRCLIB in parallel for each Spotify result
 * 3. Merge and deduplicate results
 * 4. Falls back to regular LRCLIB search if Spotify fails
 *
 * This improves search accuracy by using Spotify's fuzzy matching
 * to normalize user queries into canonical track/artist names.
 */
export const searchLRCLibBySpotifyMetadata = (
  query: string,
): Effect.Effect<readonly LRCLibTrackResult[], LyricsError, LyricsSpotifyEnv> => {
  // Try to get canonical metadata from Spotify (top 8 results)
  // Falls back to null if Spotify fails (config error, rate limit, network, etc.)
  const getSpotifyTracks = searchTracksEffect(query, 8).pipe(
    Effect.map(result =>
      result.tracks.items.map(track => ({
        trackName: track.name,
        artistName: formatArtists(track.artists),
      })),
    ),
    Effect.catchAll(error => {
      console.log(`[Search] Spotify failed, falling back to direct LRCLIB search: ${error._tag}`)
      return Effect.succeed(null)
    }),
  )

  return Effect.gen(function* () {
    const spotifyTracks = yield* getSpotifyTracks

    // If Spotify failed or returned no results, use direct LRCLIB search
    if (!spotifyTracks || spotifyTracks.length === 0) {
      return yield* searchLRCLibTracks(query)
    }

    // Search LRCLIB in parallel for each Spotify track
    const allResults = yield* Effect.all(
      spotifyTracks.map(track => searchLRCLibByTrack(track.trackName, track.artistName)),
      { concurrency: 8 },
    )

    // Flatten and deduplicate by normalized track name + artist
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, "") // Remove punctuation
        .replace(/\s+/g, " ")
        .trim()

    const seen = new Set<string>()
    const deduped: LRCLibTrackResult[] = []

    for (const results of allResults) {
      for (const r of results) {
        const key = `${normalize(r.trackName)}|${normalize(r.artistName)}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(r)
      }
    }

    // If no results from Spotify-based search, fall back to direct search
    if (deduped.length === 0) {
      return yield* searchLRCLibTracks(query)
    }

    return deduped
  })
}

// --- Fallback Search with Ranking ---

/**
 * Album names that indicate low-quality or placeholder entries
 */
const LOW_QUALITY_ALBUMS = new Set([
  "-",
  ".",
  "null",
  "unknown",
  "title",
  "e",
  "vari",
  "valirock",
  "drumless",
])

/**
 * Check if syncedLyrics contains valid LRC timestamps
 */
function hasValidLrcTimestamps(syncedLyrics: string | null): boolean {
  if (!syncedLyrics) return false
  // Must have at least 5 timestamp lines to be valid
  const timestampMatches = syncedLyrics.match(/\[\d{2}:\d{2}\.\d{2}\]/g)
  return timestampMatches !== null && timestampMatches.length >= 5
}

/**
 * Score a lyrics result for ranking (higher is better)
 */
function scoreLyricsResult(result: LRCLibResponse, targetDuration: number | null): number {
  let score = 0

  // Has valid synced lyrics with timestamps (+100 base)
  if (hasValidLrcTimestamps(result.syncedLyrics)) {
    score += 100
  } else {
    return 0 // No valid lyrics = not usable
  }

  // Duration match (within ±2s = +50, within ±5s = +30, within ±10s = +10)
  if (targetDuration !== null) {
    const durationDiff = Math.abs(result.duration - targetDuration)
    if (durationDiff <= 2) {
      score += 50
    } else if (durationDiff <= 5) {
      score += 30
    } else if (durationDiff <= 10) {
      score += 10
    }
  }

  // Album name quality (+20 for good album names)
  const albumLower = (result.albumName ?? "").toLowerCase().trim()
  if (albumLower && !LOW_QUALITY_ALBUMS.has(albumLower)) {
    score += 20
  }

  // Prefer official album names
  if (
    albumLower.includes("hybrid theory") ||
    albumLower.includes("meteora") ||
    albumLower.includes("papercuts")
  ) {
    score += 15
  }

  return score
}

/**
 * Search for alternative lyrics when primary ID fails.
 * Returns the best matching lyrics based on ranking criteria.
 *
 * @param trackName - Track title to search for
 * @param artistName - Artist name to search for
 * @param targetDuration - Expected duration in seconds (for matching)
 * @param excludeId - ID to exclude from results (the failed one)
 */
export const findBestAlternativeLyrics = (
  trackName: string,
  artistName: string,
  targetDuration: number | null,
  excludeId?: number,
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })

    const response = yield* fetchResponse(`${LRCLIB_BASE_URL}/search?${params.toString()}`, {
      headers,
      cache: "force-cache",
      next: { revalidate: 600 },
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

    // Score and rank results
    const scored = results
      .filter(r => r.id !== excludeId)
      .map(r => ({ result: r, score: scoreLyricsResult(r, targetDuration) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    // Use the best match
    const best = scored[0]
    if (!best) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    const data = best.result
    if (!data.syncedLyrics) {
      return yield* Effect.fail(new LyricsNotFoundError({ trackName, artistName }))
    }

    const songId = `lrclib-${data.id}`
    const lyrics = parseLRC(data.syncedLyrics, songId, data.trackName, data.artistName)

    if (lyrics.lines.length === 0) {
      return yield* Effect.fail(
        new LyricsInvalidError({
          id: data.id,
          trackName: data.trackName,
          artistName: data.artistName,
          reason: "No valid synced lyrics lines found",
        }),
      )
    }

    return lyrics
  })
}

/**
 * Get lyrics by ID with automatic fallback to search if the ID has invalid data.
 *
 * @param id - Primary LRCLIB ID to try
 * @param trackName - Track name for fallback search
 * @param artistName - Artist name for fallback search
 * @param targetDuration - Expected duration for ranking alternatives
 */
export const getLyricsByIdWithFallback = (
  id: number,
  trackName: string,
  artistName: string,
  targetDuration: number | null,
): Effect.Effect<Lyrics, LyricsError, LyricsClientEnv> => {
  return getLyricsById(id).pipe(
    Effect.catchTag("LyricsInvalidError", error => {
      console.log(`[Lyrics] ID ${error.id} has invalid data, searching for alternative...`)
      return findBestAlternativeLyrics(trackName, artistName, targetDuration, error.id)
    }),
  )
}
