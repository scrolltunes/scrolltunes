/**
 * Lyrics client for fetching synced lyrics from LRCLIB API
 *
 * Server-side only - uses Effect.ts patterns with tagged error classes
 */

import type { Lyrics } from "@/core"
import { Data, Effect } from "effect"
import { parseLRC } from "./lyrics-parser"

// --- Error Classes ---

export class LyricsNotFoundError extends Data.TaggedClass("LyricsNotFoundError")<{
  readonly trackName: string
  readonly artistName: string
}> {}

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

// --- Effect-based Functions ---

/**
 * Fetch lyrics for a song by track and artist name
 */
export const getLyrics = (
  trackName: string,
  artistName: string,
): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/get?${params.toString()}`),
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
 * Search for lyrics and return the first match
 */
export const searchLyrics = (
  trackName: string,
  artistName: string,
): Effect.Effect<Lyrics, LyricsError> => {
  return Effect.gen(function* () {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    })

    const response = yield* Effect.tryPromise({
      try: () => fetch(`${LRCLIB_BASE_URL}/search?${params.toString()}`),
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
 * Get lyrics by Spotify track ID
 * Note: LRCLIB doesn't directly support Spotify IDs, but this is a placeholder
 * for future integration or alternative APIs that do support it
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

/**
 * Fetch lyrics for a song (async wrapper)
 */
export async function fetchLyrics(trackName: string, artistName: string): Promise<Lyrics> {
  return Effect.runPromise(getLyrics(trackName, artistName))
}

/**
 * Search for lyrics (async wrapper)
 */
export async function fetchLyricsSearch(trackName: string, artistName: string): Promise<Lyrics> {
  return Effect.runPromise(searchLyrics(trackName, artistName))
}

/**
 * Fetch lyrics with fallback to search if direct lookup fails
 */
export async function fetchLyricsWithFallback(
  trackName: string,
  artistName: string,
): Promise<Lyrics> {
  const effect = Effect.orElse(getLyrics(trackName, artistName), () =>
    searchLyrics(trackName, artistName),
  )
  return Effect.runPromise(effect)
}
