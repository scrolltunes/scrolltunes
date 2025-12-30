/**
 * RapidAPI Spotify provider tests
 *
 * Tests quota management using RapidAPI response headers.
 * Uses real Vercel KV (Upstash Redis) for quota caching.
 * Mocks RapidAPI fetch calls, not Redis.
 *
 * Requirements:
 * - KV_REST_API_URL and KV_REST_API_TOKEN env vars must be set
 * - Run with: bun run test src/lib/bpm/__tests__/rapidapi.test.ts
 */

import type { PublicConfig } from "@/services/public-config"
import { ConfigLayer } from "@/services/server-base-layer"
import type { ServerConfig } from "@/services/server-config"
import { Redis } from "@upstash/redis"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { rapidApiSpotifyProvider } from "../rapidapi-client"
import type { ReccoBeatsQuery } from "../reccobeats-client"

const QUOTA_KEY = "rapidapi:remaining"

const createQuery = (spotifyId: string): ReccoBeatsQuery => ({
  title: "Test Song",
  artist: "Test Artist",
  spotifyId,
})

interface MockResponseOptions {
  tempo: string
  key: string
  mode: string
  remaining?: number
  limit?: number
  resetSeconds?: number
}

const mockRapidApiResponse = (options: MockResponseOptions) => {
  const headers = new Map([
    ["x-ratelimit-requests-remaining", String(options.remaining ?? 10)],
    ["x-ratelimit-requests-limit", String(options.limit ?? 20)],
    ["x-ratelimit-requests-reset", String(options.resetSeconds ?? 3600)],
  ])

  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers.get(name) ?? null,
    },
    json: () =>
      Promise.resolve({
        result: "success",
        message: "Data Retrieved.",
        audio_features: {
          tempo: options.tempo,
          key: options.key,
          mode: options.mode,
        },
      }),
  }
}

const mockErrorResponse = (status: number, remaining = 10) => {
  const headers = new Map([
    ["x-ratelimit-requests-remaining", String(remaining)],
    ["x-ratelimit-requests-limit", "20"],
    ["x-ratelimit-requests-reset", "3600"],
  ])

  return {
    ok: false,
    status,
    headers: {
      get: (name: string) => headers.get(name) ?? null,
    },
    json: () => Promise.resolve({}),
  }
}

const originalFetch = globalThis.fetch

const runWithConfig = <A, E>(effect: Effect.Effect<A, E, PublicConfig | ServerConfig>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ConfigLayer)))

const runWithConfigExit = <A, E>(effect: Effect.Effect<A, E, PublicConfig | ServerConfig>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(ConfigLayer)))

const hasRealRedis =
  !!process.env.KV_REST_API_URL && process.env.KV_REST_API_URL !== "https://test-kv.example.com"

function getRedis() {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function mockFetchForRapidApiOnly(response: ReturnType<typeof mockRapidApiResponse>) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("rapidapi.com") || url.includes("web3forms.com")) {
      return Promise.resolve(response as unknown as Response)
    }
    return originalFetch(input, _init)
  }) as unknown as typeof fetch
}

describe("rapidApiSpotifyProvider unit tests", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.RAPIDAPI_KEY = "test-api-key"
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = "test-web3forms-key"
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.assign(process.env, originalEnv)
  })

  test("fails without spotifyId", async () => {
    const effect = rapidApiSpotifyProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails without RAPIDAPI_KEY", async () => {
    process.env.RAPIDAPI_KEY = ""
    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })
})

describe("rapidApiSpotifyProvider with real Redis", () => {
  const originalEnv = { ...process.env }
  let redis: Redis | null = null

  beforeEach(async () => {
    if (!hasRealRedis) return
    process.env.RAPIDAPI_KEY = "test-api-key"
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = "test-web3forms-key"

    redis = getRedis()
    if (redis) {
      await redis.del(QUOTA_KEY)
      await redis.del("rapidapi:warned:5")
      await redis.del("rapidapi:warned:3")
      await redis.del("rapidapi:warned:1")
    }
  })

  afterEach(async () => {
    if (!hasRealRedis) return
    globalThis.fetch = originalFetch
    Object.assign(process.env, originalEnv)

    if (redis) {
      await redis.del(QUOTA_KEY)
      await redis.del("rapidapi:warned:5")
      await redis.del("rapidapi:warned:3")
      await redis.del("rapidapi:warned:1")
    }
  })

  test.skipIf(!hasRealRedis)("returns BPM on successful lookup", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120.5", key: "C", mode: "1", remaining: 19 }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(121)
    expect(result.source).toBe("RapidAPI")
    expect(result.key).toBe("C major")
  })

  test.skipIf(!hasRealRedis)("formats key correctly for minor", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "100", key: "C#", mode: "0", remaining: 18 }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await runWithConfig(effect)

    expect(result.key).toBe("C# minor")
  })

  test.skipIf(!hasRealRedis)("caches remaining count from response headers", async () => {
    if (!redis) return
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({
        tempo: "120",
        key: "C",
        mode: "1",
        remaining: 15,
        resetSeconds: 3600,
      }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    await runWithConfig(effect)

    const cached = await redis.get<number>(QUOTA_KEY)
    expect(cached).toBe(15)
  })

  test.skipIf(!hasRealRedis)("blocks requests when cached remaining is 0", async () => {
    if (!redis) return

    await redis.set(QUOTA_KEY, 0, { ex: 3600 })

    const rapidApiCalls: string[] = []
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("rapidapi.com")) {
        rapidApiCalls.push(url)
      }
      return originalFetch(input, init)
    }) as unknown as typeof fetch

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("BPMNotFoundError")
    }
    expect(rapidApiCalls).toHaveLength(0)
  })

  test.skipIf(!hasRealRedis)("allows requests when cached remaining > 0", async () => {
    if (!redis) return

    await redis.set(QUOTA_KEY, 5, { ex: 3600 })

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1", remaining: 4 }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(120)

    const newCached = await redis.get<number>(QUOTA_KEY)
    expect(newCached).toBe(4)
  })

  test.skipIf(!hasRealRedis)("allows requests when no cache exists", async () => {
    if (!redis) return

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockRapidApiResponse({ tempo: "120", key: "C", mode: "1", remaining: 19 }),
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(120)
  })

  test.skipIf(!hasRealRedis)("handles 404 as BPMNotFoundError", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockErrorResponse(404) as unknown as ReturnType<typeof mockRapidApiResponse>,
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test.skipIf(!hasRealRedis)("handles 429 rate limit as BPMNotFoundError", async () => {
    globalThis.fetch = mockFetchForRapidApiOnly(
      mockErrorResponse(429, 0) as unknown as ReturnType<typeof mockRapidApiResponse>,
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test.skipIf(!hasRealRedis)("updates cache even on 429 response", async () => {
    if (!redis) return

    globalThis.fetch = mockFetchForRapidApiOnly(
      mockErrorResponse(429, 0) as unknown as ReturnType<typeof mockRapidApiResponse>,
    )

    const effect = rapidApiSpotifyProvider.getBpm(createQuery("spotify123"))
    await runWithConfigExit(effect)

    const cached = await redis.get<number>(QUOTA_KEY)
    expect(cached).toBe(0)
  })
})
