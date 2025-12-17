/**
 * RapidAPI Spotify provider tests
 *
 * Tests the daily request cap using real Vercel KV (Upstash Redis).
 * Mocks only the RapidAPI fetch calls, not Redis.
 *
 * Requirements:
 * - KV_REST_API_URL and KV_REST_API_TOKEN env vars must be set
 * - Run with: bun run test src/lib/bpm/__tests__/rapidapi-spotify.test.ts
 */

import { Redis } from "@upstash/redis"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { rapidApiSpotifyProvider } from "../rapidapi-client"
import type { ReccoBeatsQuery } from "../reccobeats-client"

const createQuery = (spotifyId: string): ReccoBeatsQuery => ({
  title: "Test Song",
  artist: "Test Artist",
  spotifyId,
})

const mockRapidApiResponse = (data: { tempo: string; key: string; mode: string }) => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      result: "success",
      message: "Data Retrieved.",
      audio_features: data,
    }),
})

const originalFetch = globalThis.fetch

function getRedis() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function mockFetchForRapidApiOnly(response: ReturnType<typeof mockRapidApiResponse>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("rapidapi.com") || url.includes("web3forms.com")) {
      return Promise.resolve(response as Response)
    }
    return originalFetch(input, init)
  })
}

function getTodayKey() {
  return `rapidapi:usage:${new Date().toISOString().slice(0, 10)}`
}

describe("rapidApiSpotifyProvider unit tests", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.RAPIDAPI_KEY = "test-api-key"
    process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS = "false"
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = ""
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.assign(process.env, originalEnv)
  })

  test("fails without spotifyId", async () => {
    const effect = rapidApiSpotifyProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await Effect.runPromiseExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails without RAPIDAPI_KEY", async () => {
    process.env.RAPIDAPI_KEY = ""
    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await Effect.runPromiseExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails when external APIs disabled", async () => {
    process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS = "true"
    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await Effect.runPromiseExit(effect)
    expect(exit._tag).toBe("Failure")
  })
})

describe("rapidApiSpotifyProvider with real Redis", () => {
  const originalEnv = { ...process.env }
  let redis: Redis | null = null

  beforeEach(async () => {
    process.env.RAPIDAPI_KEY = "test-api-key"
    process.env.NEXT_PUBLIC_DISABLE_EXTERNAL_APIS = "false"
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = ""

    redis = getRedis()
    if (redis) {
      await redis.del(getTodayKey())
    }
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    Object.assign(process.env, originalEnv)

    if (redis) {
      await redis.del(getTodayKey())
    }
  })

  test.skipIf(!process.env.KV_REST_API_URL)("returns BPM on successful lookup", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120.5", key: "C", mode: "1" }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await Effect.runPromise(effect)

    expect(result.bpm).toBe(121)
    expect(result.source).toBe("RapidAPI")
    expect(result.key).toBe("C major")
  })

  test.skipIf(!process.env.KV_REST_API_URL)("formats key correctly for minor", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "100", key: "C#", mode: "0" }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await Effect.runPromise(effect)

    expect(result.key).toBe("C# minor")
  })

  test.skipIf(!process.env.KV_REST_API_URL)("increments usage counter in Redis", async () => {
    if (!redis) return
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1" }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    await Effect.runPromise(effect)

    const count = await redis.get<number>(getTodayKey())
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test.skipIf(!process.env.KV_REST_API_URL)("blocks requests when cap is reached", async () => {
    if (!redis) return

    await redis.set(getTodayKey(), 20, { ex: 60 })

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1" }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await Effect.runPromiseExit(effect)

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("BPMNotFoundError")
    }
  })

  test.skipIf(!process.env.KV_REST_API_URL)("allows requests under cap", async () => {
    if (!redis) return

    await redis.set(getTodayKey(), 19, { ex: 60 })

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1" }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await Effect.runPromise(effect)

    expect(result.bpm).toBe(120)

    const newCount = await redis.get<number>(getTodayKey())
    expect(newCount).toBe(20)
  })

  test.skipIf(!process.env.KV_REST_API_URL)("multiple requests increment counter", async () => {
    if (!redis) return
    await redis.del(getTodayKey())

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1" }),
    )

    for (let i = 0; i < 3; i++) {
      const effect = rapidApiSpotifyProvider.getBpm(createQuery(`spotify${i}`))
      await Effect.runPromise(effect)
    }

    const count = await redis.get<number>(getTodayKey())
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test.skipIf(!process.env.KV_REST_API_URL)("handles 404 as BPMNotFoundError", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as ReturnType<typeof mockRapidApiResponse>)

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await Effect.runPromiseExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test.skipIf(!process.env.KV_REST_API_URL)(
    "handles 429 rate limit as BPMNotFoundError",
    async () => {
      globalThis.fetch = mockFetchForRapidApiOnly({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
      } as ReturnType<typeof mockRapidApiResponse>)

      const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
      const exit = await Effect.runPromiseExit(effect)

      expect(exit._tag).toBe("Failure")
    },
  )
})
