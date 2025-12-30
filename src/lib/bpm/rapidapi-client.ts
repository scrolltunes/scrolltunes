/**
 * RapidAPI Spotify Audio Features client
 *
 * Last-resort BPM provider using RapidAPI's Spotify Audio Features endpoint.
 * Free tier: 20 requests/day at 1 req/sec.
 *
 * API: https://rapidapi.com/music-metrics-music-metrics-default/api/spotify-audio-features-track-analysis
 * Endpoint: GET https://spotify-audio-features-track-analysis.p.rapidapi.com/
 * Query param: spotify_track_id
 * Headers: X-RapidAPI-Key, X-RapidAPI-Host
 *
 * Response matches Spotify's audio features format:
 * { tempo, key, mode, danceability, energy, ... }
 *
 * Rate limiting uses RapidAPI's response headers (x-ratelimit-requests-remaining)
 * as the source of truth. Caches remaining count with TTL matching reset time.
 */

import { PublicConfig } from "@/services/public-config"
import { ServerConfig } from "@/services/server-config"
import { Redis } from "@upstash/redis"
import { Effect } from "effect"

import { BPMAPIError, BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import type { ReccoBeatsQuery } from "./reccobeats-client"

const RAPIDAPI_BASE_URL =
  "https://spotify-audio-features-track-analysis.p.rapidapi.com/tracks/spotify_audio_features"
const RAPIDAPI_HOST = "spotify-audio-features-track-analysis.p.rapidapi.com"

const DAILY_REQUEST_CAP = 20
const WARNING_THRESHOLDS = [5, 3, 1] as const
const QUOTA_KEY = "rapidapi:remaining"

let lastRequestTime = 0
const RATE_LIMIT_MS = 1000

const getRedisClient: Effect.Effect<Redis, never, ServerConfig> = Effect.gen(function* () {
  const { kvRestApiUrl, kvRestApiToken } = yield* ServerConfig
  return new Redis({ url: kvRestApiUrl, token: kvRestApiToken })
})

interface SongContext {
  readonly title: string
  readonly artist: string
  readonly spotifyId: string
}

interface RateLimitInfo {
  readonly remaining: number
  readonly limit: number
  readonly resetSeconds: number
}

function parseRateLimitHeaders(response: Response): RateLimitInfo {
  return {
    remaining: Number.parseInt(response.headers.get("x-ratelimit-requests-remaining") ?? "0", 10),
    limit: Number.parseInt(response.headers.get("x-ratelimit-requests-limit") ?? "20", 10),
    resetSeconds: Number.parseInt(response.headers.get("x-ratelimit-requests-reset") ?? "0", 10),
  }
}

function formatResetTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

const checkQuotaAvailable = (): Effect.Effect<
  { available: boolean; ttl: number },
  never,
  ServerConfig
> =>
  Effect.gen(function* () {
    const redis = yield* getRedisClient

    const [remaining, ttl] = yield* Effect.all([
      Effect.tryPromise({
        try: () => redis.get<number>(QUOTA_KEY),
        catch: () => null,
      }),
      Effect.tryPromise({
        try: () => redis.ttl(QUOTA_KEY),
        catch: () => -1,
      }),
    ])

    if (remaining === null) return { available: true, ttl: 0 }

    if (remaining <= 0) {
      console.log(`[RapidAPI] Quota exhausted, resets in ${formatResetTime(ttl)}`)
      return { available: false, ttl }
    }

    return { available: true, ttl }
  }).pipe(Effect.catchAll(() => Effect.succeed({ available: true, ttl: 0 })))

const updateQuotaCache = (rateLimit: RateLimitInfo): Effect.Effect<void, never, ServerConfig> =>
  Effect.gen(function* () {
    const redis = yield* getRedisClient
    yield* Effect.tryPromise({
      try: () => redis.set(QUOTA_KEY, rateLimit.remaining, { ex: rateLimit.resetSeconds }),
      catch: () => null,
    })
  }).pipe(Effect.catchAll(() => Effect.void))

const sendUsageWarning = (
  remaining: number,
  song: SongContext,
  resetSeconds: number,
): Effect.Effect<void, never, PublicConfig> =>
  Effect.gen(function* () {
    const { web3FormsAccessKey } = yield* PublicConfig
    const accessKey = web3FormsAccessKey
    const used = DAILY_REQUEST_CAP - remaining
    const spotifyUrl = `https://open.spotify.com/track/${song.spotifyId}`

    yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key: accessKey,
            subject: `[ScrollTunes] RapidAPI: ${remaining} requests remaining`,
            from_name: "ScrollTunes Rate Limiter",
            message: `RapidAPI Spotify Audio Features usage warning:

Used: ${used}/${DAILY_REQUEST_CAP} requests
Remaining: ${remaining}
Resets in: ${formatResetTime(resetSeconds)}

Triggered by:
  Song: ${song.title}
  Artist: ${song.artist}
  Spotify ID: ${song.spotifyId}
  Spotify URL: ${spotifyUrl}

The free tier allows 20 requests/day. Exceeding this will incur $0.50/request charges.`,
          }),
        }),
      catch: () => null,
    }).pipe(Effect.asVoid)
  }).pipe(Effect.catchAll(() => Effect.void))

function getWarnedKey(remaining: number): string {
  return `rapidapi:warned:${remaining}`
}

const checkAndSendWarnings = (
  rateLimit: RateLimitInfo,
  song: SongContext,
): Effect.Effect<void, never, ServerConfig | PublicConfig> =>
  Effect.gen(function* () {
    for (const threshold of WARNING_THRESHOLDS) {
      if (rateLimit.remaining > threshold) continue

      const redis = yield* getRedisClient
      const warnedKey = getWarnedKey(threshold)

      const alreadyWarned = yield* Effect.tryPromise({
        try: () => redis.get<boolean>(warnedKey),
        catch: () => false,
      })

      if (!alreadyWarned) {
        yield* Effect.tryPromise({
          try: () => redis.set(warnedKey, true, { ex: rateLimit.resetSeconds }),
          catch: () => null,
        })
        yield* sendUsageWarning(rateLimit.remaining, song, rateLimit.resetSeconds)
      }
      break
    }
  }).pipe(Effect.catchAll(() => Effect.void))

interface RapidAPIResponse {
  readonly result: "success" | "error"
  readonly message: string
  readonly audio_features?: {
    readonly tempo: string
    readonly key: string
    readonly mode: string
  }
}

function formatKey(key: string, mode: string): string | null {
  if (!key) return null
  const modeName = mode === "1" || mode === "1.0" ? "major" : "minor"
  return `${key} ${modeName}`
}

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
 * RapidAPI Spotify Audio Features provider implementation.
 *
 * Requires a spotifyId in the query and RAPIDAPI_KEY env var.
 * Uses RapidAPI response headers to track remaining quota.
 * Caches remaining count in Redis with TTL matching reset time.
 * Silently returns BPMNotFoundError on quota exceeded to allow fallback.
 */
export const rapidApiSpotifyProvider: BPMProvider<ServerConfig | PublicConfig> = {
  name: "RapidAPI",

  getBpm(
    query: BPMTrackQuery,
  ): Effect.Effect<BPMResult, BPMNotFoundError | BPMAPIError, ServerConfig | PublicConfig> {
    return Effect.gen(function* () {
      const spotifyId = (query as ReccoBeatsQuery).spotifyId
      if (!spotifyId) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const { rapidApiKey } = yield* ServerConfig
      const apiKey = rapidApiKey

      const songContext: SongContext = {
        title: query.title,
        artist: query.artist,
        spotifyId,
      }

      const { available } = yield* checkQuotaAvailable()
      if (!available) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      yield* enforceRateLimit()

      const url = `${RAPIDAPI_BASE_URL}?spotify_track_id=${encodeURIComponent(spotifyId)}`

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            headers: {
              "X-RapidAPI-Key": apiKey,
              "X-RapidAPI-Host": RAPIDAPI_HOST,
            },
          }),
        catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
      })

      const rateLimit = parseRateLimitHeaders(response)
      yield* updateQuotaCache(rateLimit)
      yield* checkAndSendWarnings(rateLimit, songContext)

      if (!response.ok) {
        if (response.status === 404) {
          return yield* Effect.fail(
            new BPMNotFoundError({ title: query.title, artist: query.artist }),
          )
        }
        if (response.status === 429) {
          return yield* Effect.fail(
            new BPMNotFoundError({ title: query.title, artist: query.artist }),
          )
        }
        return yield* Effect.fail(
          new BPMAPIError({ status: response.status, message: response.statusText }),
        )
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<RapidAPIResponse>,
        catch: () => new BPMAPIError({ status: 0, message: "Failed to parse response" }),
      })

      if (data.result !== "success" || !data.audio_features) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const bpm = Math.round(Number.parseFloat(data.audio_features.tempo))
      if (Number.isNaN(bpm) || bpm <= 0) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      return {
        bpm,
        source: "RapidAPI",
        key: formatKey(data.audio_features.key, data.audio_features.mode),
      }
    })
  },
}
