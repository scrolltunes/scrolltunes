/**
 * GetSongBPM API client
 *
 * Provides BPM lookup via getsongbpm.com API.
 * API documentation: https://getsongbpm.com/api
 *
 * Requirements:
 * - API key required (set GETSONGBPM_API_KEY env var)
 * - Rate limit: 3000 requests/hour
 * - Attribution: MANDATORY backlink to getsongbpm.com
 */

import { ServerConfig } from "@/services/server-config"
import { Effect } from "effect"
import { BPMAPIError, BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import { normalizeTrackKey } from "./bpm-types"

// Correct API base URL per official docs
const GETSONGBPM_BASE_URL = "https://api.getsong.co"

const headers = {
  "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)",
}

// Simple per-process rate limiter
let lastRequestTime = 0
const RATE_LIMIT_MS = 1200 // 1.2s → max 3000 req/h

interface GetSongBpmArtist {
  readonly id: string
  readonly name: string
}

interface GetSongBpmTrack {
  readonly id: string
  readonly title: string
  readonly artist: GetSongBpmArtist
  readonly tempo: string // API returns tempo as string
  readonly key_of?: string
}

interface GetSongBpmResponse {
  readonly search?: readonly GetSongBpmTrack[]
}

function buildLookupParam(title: string, artist: string): string {
  return `song:${title} artist:${artist}`
}

/**
 * Enforce rate limit by delaying if needed
 */
const enforceRateLimit = (): Effect.Effect<void> =>
  Effect.suspend(() => {
    const now = Date.now()
    const elapsed = now - lastRequestTime
    if (elapsed < RATE_LIMIT_MS) {
      const delay = RATE_LIMIT_MS - elapsed
      lastRequestTime = now + delay
      return Effect.sleep(delay)
    }
    lastRequestTime = now
    return Effect.void
  })

/**
 * GetSongBPM provider implementation
 */
export const getSongBpmProvider: BPMProvider<ServerConfig> = {
  name: "GetSongBPM",

  getBpm(
    query: BPMTrackQuery,
  ): Effect.Effect<BPMResult, BPMNotFoundError | BPMAPIError, ServerConfig> {
    return Effect.gen(function* () {
      const normalized = normalizeTrackKey(query)

      // Enforce rate limit
      yield* enforceRateLimit()

      // Build URL with optional API key
      const params = new URLSearchParams({
        type: "both",
        lookup: buildLookupParam(query.title, query.artist),
      })

      // API key is required - unauthenticated requests are not allowed
      const { getSongBpmApiKey } = yield* ServerConfig
      const apiKey = getSongBpmApiKey
      params.set("api_key", apiKey)

      const url = `${GETSONGBPM_BASE_URL}/search/?${params.toString()}`

      // Fetch from API
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers }),
        catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
      })

      if (!response.ok) {
        if (response.status === 404) {
          return yield* Effect.fail(
            new BPMNotFoundError({ title: query.title, artist: query.artist }),
          )
        }
        return yield* Effect.fail(
          new BPMAPIError({
            status: response.status,
            message: response.statusText,
          }),
        )
      }

      // Parse response
      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<GetSongBpmResponse>,
        catch: () => new BPMAPIError({ status: 0, message: "Failed to parse response" }),
      })

      // Find matching track by normalized title/artist
      const results = Array.isArray(data.search) ? data.search : []
      const match = results.find(track => {
        const trackNormalized = normalizeTrackKey({
          title: track.title,
          artist: track.artist.name,
        })
        return (
          trackNormalized.title === normalized.title && trackNormalized.artist === normalized.artist
        )
      })

      if (!match) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const tempo = Number.parseInt(match.tempo, 10)
      if (Number.isNaN(tempo) || tempo <= 0) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      return {
        bpm: tempo,
        source: "GetSongBPM",
        key: match.key_of ?? null,
      }
    })
  },
}
