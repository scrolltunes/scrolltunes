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
 * Uses Vercel KV to enforce daily request cap (prevents billing overages).
 */

import { Redis } from "@upstash/redis"
import { Effect } from "effect"

function getRedisClient() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    return null
  }
  return new Redis({ url, token })
}
import { BPMAPIError, BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import type { ReccoBeatsQuery } from "./reccobeats-client"

const RAPIDAPI_BASE_URL =
  "https://spotify-audio-features-track-analysis.p.rapidapi.com/tracks/spotify_audio_features"
const RAPIDAPI_HOST = "spotify-audio-features-track-analysis.p.rapidapi.com"

const DAILY_REQUEST_CAP = 20
const KV_KEY_PREFIX = "rapidapi:usage:"
const KV_WARNED_PREFIX = "rapidapi:warned:"
const WARNING_THRESHOLDS = [0.75, 0.85, 0.95] as const

let lastRequestTime = 0
const RATE_LIMIT_MS = 1000

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getTodayKey(): string {
  return `${KV_KEY_PREFIX}${getToday()}`
}

function getWarnedKey(threshold: number): string {
  return `${KV_WARNED_PREFIX}${getToday()}:${threshold}`
}

async function sendUsageWarning(current: number, threshold: number): Promise<void> {
  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY
  if (!accessKey) return

  const percentage = Math.round(threshold * 100)

  try {
    await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `[ScrollTunes] RapidAPI usage at ${percentage}%`,
        from_name: "ScrollTunes Rate Limiter",
        message: `RapidAPI Spotify Audio Features usage warning:\n\nCurrent usage: ${current}/${DAILY_REQUEST_CAP} requests (${percentage}%)\nDate: ${getToday()}\n\nThe free tier allows 20 requests/day. Exceeding this will incur $0.50/request charges.`,
      }),
    })
  } catch {
    // Silently ignore notification failures
  }
}

async function checkAndSendWarnings(redis: Redis, current: number): Promise<void> {
  for (const threshold of WARNING_THRESHOLDS) {
    const thresholdCount = Math.floor(DAILY_REQUEST_CAP * threshold)
    if (current >= thresholdCount) {
      const warnedKey = getWarnedKey(threshold)
      const alreadyWarned = await redis.get<boolean>(warnedKey)
      if (!alreadyWarned) {
        await redis.set(warnedKey, true, { ex: 48 * 60 * 60 })
        await sendUsageWarning(current, threshold)
      }
    }
  }
}

const checkAndIncrementUsage = (): Effect.Effect<boolean, BPMAPIError> =>
  Effect.tryPromise({
    try: async () => {
      const redis = getRedisClient()
      if (!redis) {
        return true
      }
      const key = getTodayKey()
      const current = await redis.get<number>(key)
      if (current !== null && current >= DAILY_REQUEST_CAP) {
        return false
      }
      const newCount = await redis.incr(key)
      if (current === null) {
        await redis.expire(key, 48 * 60 * 60)
      }
      await checkAndSendWarnings(redis, newCount)
      return true
    },
    catch: () => new BPMAPIError({ status: 0, message: "KV storage error" }),
  })

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
 * Silently returns BPMNotFoundError on quota exceeded (429) to allow fallback.
 */
export const rapidApiSpotifyProvider: BPMProvider = {
  name: "RapidAPI-Spotify",

  getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMNotFoundError | BPMAPIError> {
    return Effect.gen(function* () {
      const spotifyId = (query as ReccoBeatsQuery).spotifyId
      if (!spotifyId) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      if (process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS === "true") {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const apiKey = process.env.RAPIDAPI_KEY
      if (!apiKey) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const allowed = yield* checkAndIncrementUsage()
      if (!allowed) {
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
        source: "RapidAPI-Spotify",
        key: formatKey(data.audio_features.key, data.audio_features.mode),
      }
    })
  },
}
