/**
 * Deezer BPM provider
 *
 * Uses Deezer's public API to fetch BPM data.
 * No authentication required.
 */

import { Effect } from "effect"
import { BPMAPIError, BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import { normalizeTrackKey } from "./bpm-types"

const DEEZER_BASE_URL = "https://api.deezer.com"

const headers = {
  "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)",
}

interface DeezerSearchTrack {
  readonly id: number
  readonly title: string
  readonly artist: {
    readonly name: string
  }
}

interface DeezerSearchResponse {
  readonly data: readonly DeezerSearchTrack[]
}

interface DeezerTrackDetails {
  readonly bpm: number
}

/**
 * Normalize artist/track name for Deezer search.
 * - Extracts text from parentheses if present (e.g., "✝✝✝ (Crosses)" → "Crosses")
 * - Removes non-ASCII symbols that Deezer can't search
 * - Falls back to original if normalization produces empty string
 */
function normalizeForSearch(text: string): string {
  const parenMatch = text.match(/\(([^)]+)\)/)
  if (parenMatch?.[1]) {
    const extracted = parenMatch[1].trim()
    if (/^[\w\s'-]+$/i.test(extracted)) {
      return extracted
    }
  }

  const cleaned = text
    .replace(/[^\w\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned || text
}

/**
 * Deezer BPM provider implementation
 */
export const deezerBpmProvider: BPMProvider = {
  name: "Deezer",

  getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMNotFoundError | BPMAPIError> {
    return Effect.gen(function* () {
      const normalized = normalizeTrackKey(query)

      const normalizedArtist = normalizeForSearch(query.artist)
      const normalizedTrack = normalizeForSearch(query.title)
      const searchQuery = encodeURIComponent(
        `artist:"${normalizedArtist}" track:"${normalizedTrack}"`,
      )
      const searchUrl = `${DEEZER_BASE_URL}/search?q=${searchQuery}&limit=5`

      const searchResponse = yield* Effect.tryPromise({
        try: () => fetch(searchUrl, { headers }),
        catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
      })

      if (!searchResponse.ok) {
        if (searchResponse.status === 404) {
          return yield* Effect.fail(
            new BPMNotFoundError({ title: query.title, artist: query.artist }),
          )
        }
        return yield* Effect.fail(
          new BPMAPIError({
            status: searchResponse.status,
            message: searchResponse.statusText,
          }),
        )
      }

      const searchData = yield* Effect.tryPromise({
        try: () => searchResponse.json() as Promise<DeezerSearchResponse>,
        catch: () => new BPMAPIError({ status: 0, message: "Failed to parse search response" }),
      })

      if (searchData.data.length === 0) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const match = searchData.data.find(track => {
        const trackNormalized = normalizeTrackKey({
          title: track.title,
          artist: track.artist.name,
        })
        return (
          trackNormalized.title === normalized.title && trackNormalized.artist === normalized.artist
        )
      })

      const trackId = match?.id ?? searchData.data[0]?.id
      if (!trackId) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const trackUrl = `${DEEZER_BASE_URL}/track/${trackId}`
      const trackResponse = yield* Effect.tryPromise({
        try: () => fetch(trackUrl, { headers }),
        catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
      })

      if (!trackResponse.ok) {
        return yield* Effect.fail(
          new BPMAPIError({
            status: trackResponse.status,
            message: trackResponse.statusText,
          }),
        )
      }

      const trackData = yield* Effect.tryPromise({
        try: () => trackResponse.json() as Promise<DeezerTrackDetails>,
        catch: () => new BPMAPIError({ status: 0, message: "Failed to parse track response" }),
      })

      if (!trackData.bpm || trackData.bpm === 0) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      return {
        bpm: trackData.bpm,
        source: "Deezer",
        key: null,
      }
    })
  },
}
