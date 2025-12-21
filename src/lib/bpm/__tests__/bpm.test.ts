import type { PublicConfig } from "@/services/public-config"
import { ConfigLayer } from "@/services/server-base-layer"
import type { ServerConfig } from "@/services/server-config"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { clearBpmCache, withInMemoryCache } from "../bpm-cache"
import { BPMAPIError, BPMNotFoundError, BPMRateLimitError } from "../bpm-errors"
import { type BPMProvider, getBpmRace, getBpmWithFallback } from "../bpm-provider"
import type { BPMTrackQuery } from "../bpm-types"
import { makeCacheKey, normalizeTrackKey } from "../bpm-types"
import { deezerBpmProvider } from "../deezer-client"
import { getSongBpmProvider } from "../getsongbpm-client"
import { getMockBpm, hasMockBpm, mockBpmProvider } from "../mock-bpm"

const runWithConfig = <A, E>(effect: Effect.Effect<A, E, PublicConfig | ServerConfig>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ConfigLayer)))

const runWithConfigExit = <A, E>(effect: Effect.Effect<A, E, PublicConfig | ServerConfig>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(ConfigLayer)))

const originalWeb3FormsKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY

beforeEach(() => {
  if (!process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY) {
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = "test-web3forms-key"
  }
})

afterEach(() => {
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = originalWeb3FormsKey
})

describe("normalizeTrackKey", () => {
  test("lowercases and trims", () => {
    const result = normalizeTrackKey({ title: "  Hello World  ", artist: "  Test Artist  " })
    expect(result.title).toBe("hello world")
    expect(result.artist).toBe("test artist")
  })

  test("handles already normalized input", () => {
    const result = normalizeTrackKey({ title: "hello world", artist: "test artist" })
    expect(result.title).toBe("hello world")
    expect(result.artist).toBe("test artist")
  })

  test("handles uppercase input", () => {
    const result = normalizeTrackKey({ title: "HELLO WORLD", artist: "TEST ARTIST" })
    expect(result.title).toBe("hello world")
    expect(result.artist).toBe("test artist")
  })

  test("handles mixed case input", () => {
    const result = normalizeTrackKey({ title: "HeLLo WoRLd", artist: "TeSt ArTiSt" })
    expect(result.title).toBe("hello world")
    expect(result.artist).toBe("test artist")
  })

  test("removes feat. from artist", () => {
    const result = normalizeTrackKey({ title: "Song", artist: "Artist feat. Other" })
    expect(result.artist).toBe("artist")
  })

  test("removes ft. from artist", () => {
    const result = normalizeTrackKey({ title: "Song", artist: "Artist ft. Other" })
    expect(result.artist).toBe("artist")
  })

  test("removes parenthetical suffix from title", () => {
    const result = normalizeTrackKey({ title: "Song (Radio Edit)", artist: "Artist" })
    expect(result.title).toBe("song")
  })

  test("removes remaster suffix from title", () => {
    const result = normalizeTrackKey({ title: "Song - Remastered 2011", artist: "Artist" })
    expect(result.title).toBe("song")
  })

  test("removes live suffix from title", () => {
    const result = normalizeTrackKey({ title: "Song - Live", artist: "Artist" })
    expect(result.title).toBe("song")
  })
})

describe("makeCacheKey", () => {
  test("creates stable cache key", () => {
    const key = makeCacheKey({ title: "Song", artist: "Artist" })
    expect(key).toBe("artist:song")
  })

  test("produces same key for equivalent inputs after normalization", () => {
    const key1 = makeCacheKey({ title: "Hello World", artist: "Test Artist" })
    const key2 = makeCacheKey({ title: "  HELLO WORLD  ", artist: "TEST ARTIST" })
    expect(key1).toBe(key2)
  })

  test("uses artist:title format", () => {
    const key = makeCacheKey({ title: "My Song", artist: "The Band" })
    expect(key).toBe("the band:my song")
  })
})

describe("BPM error classes", () => {
  test("BPMNotFoundError has correct tag", () => {
    const error = new BPMNotFoundError({ title: "Song", artist: "Artist" })
    expect(error._tag).toBe("BPMNotFoundError")
    expect(error.title).toBe("Song")
    expect(error.artist).toBe("Artist")
  })

  test("BPMAPIError has correct tag", () => {
    const error = new BPMAPIError({ status: 500, message: "Server error" })
    expect(error._tag).toBe("BPMAPIError")
    expect(error.status).toBe(500)
    expect(error.message).toBe("Server error")
  })

  test("BPMRateLimitError has correct tag", () => {
    const error = new BPMRateLimitError({ retryAfterMs: 60000 })
    expect(error._tag).toBe("BPMRateLimitError")
    expect(error.retryAfterMs).toBe(60000)
  })
})

const successProvider = (bpm: number, name: string): BPMProvider => ({
  name,
  getBpm: () => Effect.succeed({ bpm, source: name, key: null }),
})

const notFoundProvider = (name: string): BPMProvider => ({
  name,
  getBpm: query => Effect.fail(new BPMNotFoundError({ title: query.title, artist: query.artist })),
})

const apiErrorProvider = (name: string): BPMProvider => ({
  name,
  getBpm: () => Effect.fail(new BPMAPIError({ status: 500, message: "Server error" })),
})

const query: BPMTrackQuery = { title: "Song", artist: "Artist" }

describe("getBpmWithFallback", () => {
  test("returns result from first successful provider", async () => {
    const providers = [successProvider(120, "First")]
    const effect = getBpmWithFallback(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(120)
    expect(result.source).toBe("First")
  })

  test("falls back to second provider on BPMNotFoundError", async () => {
    const providers = [notFoundProvider("First"), successProvider(140, "Second")]
    const effect = getBpmWithFallback(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(140)
    expect(result.source).toBe("Second")
  })

  test("does NOT fall back on BPMAPIError", async () => {
    const providers = [apiErrorProvider("First"), successProvider(140, "Second")]
    const effect = getBpmWithFallback(providers, query)
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMNotFoundError when no providers", async () => {
    const effect = getBpmWithFallback<never>([], query)
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMNotFoundError when all providers fail with not found", async () => {
    const providers = [notFoundProvider("First"), notFoundProvider("Second")]
    const effect = getBpmWithFallback(providers, query)
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("returns result from third provider after two not found", async () => {
    const providers = [
      notFoundProvider("First"),
      notFoundProvider("Second"),
      successProvider(100, "Third"),
    ]
    const effect = getBpmWithFallback(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(100)
    expect(result.source).toBe("Third")
  })
})

describe("getBpmRace", () => {
  test("returns first successful result", async () => {
    const providers = [successProvider(120, "First"), successProvider(140, "Second")]
    const effect = getBpmRace(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBeGreaterThan(0)
  })

  test("returns result from second provider if first fails with not found", async () => {
    const providers = [notFoundProvider("ReccoBeats"), successProvider(140, "GetSongBPM")]
    const effect = getBpmRace(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(140)
    expect(result.source).toBe("GetSongBPM")
  })

  test("returns first successful result in order", async () => {
    const providers = [successProvider(120, "First"), successProvider(140, "Second")]
    const effect = getBpmRace(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(120)
    expect(result.source).toBe("First")
  })

  test("succeeds if any provider succeeds (others fail)", async () => {
    const providers = [
      notFoundProvider("ReccoBeats"),
      apiErrorProvider("Deezer"),
      successProvider(100, "GetSongBPM"),
    ]
    const effect = getBpmRace(providers, query)
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(100)
    expect(result.source).toBe("GetSongBPM")
  })

  test("fails with BPMNotFoundError when all providers fail", async () => {
    const providers = [notFoundProvider("First"), notFoundProvider("Second")]
    const effect = getBpmRace(providers, query)
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMNotFoundError when no providers", async () => {
    const effect = getBpmRace<never>([], query)
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })
})

describe("getSongBpmProvider", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    process.env.GETSONGBPM_API_KEY = "test-api-key"
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.useRealTimers()
    process.env.GETSONGBPM_API_KEY = undefined
  })

  test("returns BPM on successful lookup", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          search: [
            { id: "1", title: "Song", artist: { name: "Artist" }, tempo: "120", key_of: "C" },
          ],
        }),
    })

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(120)
    expect(result.source).toBe("GetSongBPM")
    expect(result.key).toBe("C")
  })

  test("fails with BPMNotFoundError when no match", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ search: [] }),
    })

    const effect = getSongBpmProvider.getBpm({ title: "Unknown", artist: "Nobody" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMAPIError on HTTP error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    })

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMAPIError on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test("matches by normalized title/artist", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          search: [
            { id: "1", title: "HELLO WORLD", artist: { name: "TEST ARTIST" }, tempo: "100" },
          ],
        }),
    })

    const effect = getSongBpmProvider.getBpm({ title: "hello world", artist: "test artist" })
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(100)
  })

  test("returns null key when key_of is not provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          search: [{ id: "1", title: "Song", artist: { name: "Artist" }, tempo: "120" }],
        }),
    })

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const result = await runWithConfig(effect)

    expect(result.key).toBeNull()
  })

  test("fails when API key is missing", async () => {
    process.env.GETSONGBPM_API_KEY = ""

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })

  test("fails with BPMNotFoundError on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })

    const effect = getSongBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
  })
})

describe("deezerBpmProvider", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("returns BPM when track found with valid BPM", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 123, title: "Song", artist: { name: "Artist" } }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ bpm: 120 }),
      })

    const effect = deezerBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(120)
    expect(result.source).toBe("Deezer")
    expect(result.key).toBeNull()
  })

  test("fails with BPMNotFoundError when BPM is 0", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 123, title: "Song", artist: { name: "Artist" } }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ bpm: 0 }),
      })

    const effect = deezerBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("BPMNotFoundError")
    }
  })

  test("fails with BPMNotFoundError when no search results", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const effect = deezerBpmProvider.getBpm({ title: "Unknown", artist: "Nobody" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("BPMNotFoundError")
    }
  })

  test("fails with BPMAPIError on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    const effect = deezerBpmProvider.getBpm({ title: "Song", artist: "Artist" })
    const exit = await runWithConfigExit(effect)

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error._tag).toBe("BPMAPIError")
    }
  })

  test("matches by normalized title/artist", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 456, title: "HELLO WORLD", artist: { name: "TEST ARTIST" } }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ bpm: 100 }),
      })

    const effect = deezerBpmProvider.getBpm({ title: "hello world", artist: "test artist" })
    const result = await runWithConfig(effect)

    expect(result.bpm).toBe(100)
  })
})

describe("withInMemoryCache", () => {
  afterEach(() => {
    clearBpmCache()
  })

  test("caches successful results", async () => {
    let callCount = 0
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => {
        callCount++
        return Effect.succeed({ bpm: 120, source: "Test", key: null })
      },
    }

    const cached = withInMemoryCache(baseProvider)
    const testQuery = { title: "Song", artist: "Artist" }

    await runWithConfig(cached.getBpm(testQuery))
    await runWithConfig(cached.getBpm(testQuery))

    expect(callCount).toBe(1)
  })

  test("returns cached value", async () => {
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => Effect.succeed({ bpm: 120, source: "Test", key: "C" }),
    }

    const cached = withInMemoryCache(baseProvider)
    const testQuery = { title: "Song", artist: "Artist" }

    const result1 = await runWithConfig(cached.getBpm(testQuery))
    const result2 = await runWithConfig(cached.getBpm(testQuery))

    expect(result1).toEqual(result2)
    expect(result1.bpm).toBe(120)
  })

  test("caches by normalized key", async () => {
    let callCount = 0
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => {
        callCount++
        return Effect.succeed({ bpm: 120, source: "Test", key: null })
      },
    }

    const cached = withInMemoryCache(baseProvider)

    await runWithConfig(cached.getBpm({ title: "Song", artist: "Artist" }))
    await runWithConfig(cached.getBpm({ title: "SONG", artist: "ARTIST" }))

    expect(callCount).toBe(1)
  })

  test("has correct name suffix", () => {
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => Effect.succeed({ bpm: 120, source: "Test", key: null }),
    }

    const cached = withInMemoryCache(baseProvider)
    expect(cached.name).toBe("TestCached")
  })

  test("different queries are cached separately", async () => {
    let callCount = 0
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => {
        callCount++
        return Effect.succeed({ bpm: 120, source: "Test", key: null })
      },
    }

    const cached = withInMemoryCache(baseProvider)

    await runWithConfig(cached.getBpm({ title: "Song1", artist: "Artist" }))
    await runWithConfig(cached.getBpm({ title: "Song2", artist: "Artist" }))

    expect(callCount).toBe(2)
  })

  test("clearBpmCache clears all cached values", async () => {
    let callCount = 0
    const baseProvider: BPMProvider = {
      name: "Test",
      getBpm: () => {
        callCount++
        return Effect.succeed({ bpm: 120, source: "Test", key: null })
      },
    }

    const cached = withInMemoryCache(baseProvider)
    const testQuery = { title: "Song", artist: "Artist" }

    await runWithConfig(cached.getBpm(testQuery))
    clearBpmCache()
    await runWithConfig(cached.getBpm(testQuery))

    expect(callCount).toBe(2)
  })
})

describe("getMockBpm", () => {
  test("returns mock BPM for known song", () => {
    const result = getMockBpm({ title: "Demo Song", artist: "ScrollTunes" })
    expect(result).not.toBeNull()
    expect(result?.bpm).toBe(120)
  })

  test("returns null for unknown song", () => {
    const result = getMockBpm({ title: "Unknown Song", artist: "Nobody" })
    expect(result).toBeNull()
  })

  test("returns key for known song", () => {
    const result = getMockBpm({ title: "Demo Song", artist: "ScrollTunes" })
    expect(result?.key).toBe("C")
  })

  test("matches case-insensitively", () => {
    const result = getMockBpm({ title: "DEMO SONG", artist: "SCROLLTUNES" })
    expect(result).not.toBeNull()
    expect(result?.bpm).toBe(120)
  })
})

describe("hasMockBpm", () => {
  test("returns true for known song", () => {
    expect(hasMockBpm({ title: "Demo Song", artist: "ScrollTunes" })).toBe(true)
  })

  test("returns false for unknown song", () => {
    expect(hasMockBpm({ title: "Unknown", artist: "Nobody" })).toBe(false)
  })

  test("handles case-insensitive matching", () => {
    expect(hasMockBpm({ title: "demo song", artist: "scrolltunes" })).toBe(true)
  })
})

describe("mockBpmProvider", () => {
  test("succeeds for known song", async () => {
    const effect = mockBpmProvider.getBpm({ title: "Demo Song", artist: "ScrollTunes" })
    const result = await runWithConfig(effect)
    expect(result.bpm).toBe(120)
    expect(result.source).toBe("MockBPM")
  })

  test("returns key for known song", async () => {
    const effect = mockBpmProvider.getBpm({ title: "Demo Song", artist: "ScrollTunes" })
    const result = await runWithConfig(effect)
    expect(result.key).toBe("C")
  })

  test("fails for unknown song", async () => {
    const effect = mockBpmProvider.getBpm({ title: "Unknown", artist: "Nobody" })
    const exit = await runWithConfigExit(effect)
    expect(exit._tag).toBe("Failure")
  })

  test("has correct provider name", () => {
    expect(mockBpmProvider.name).toBe("MockBPM")
  })
})
