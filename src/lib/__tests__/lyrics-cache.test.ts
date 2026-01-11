import type { Lyrics } from "@/core"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  LYRICS_CACHE_VERSION,
  LYRICS_KEY_PREFIX,
  clearAllCachedLyrics,
  getAllCachedLyrics,
  hasCachedLyrics,
  loadCachedLyrics,
  removeCachedLyrics,
  saveCachedLyrics,
} from "../lyrics-cache"
import type { CachedLyrics } from "../recent-songs-types"

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock })

const mockLyrics: Lyrics = {
  songId: "lrclib-12345",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test Album",
  duration: 180,
  lines: [
    { id: "line-1", text: "First line", startTime: 0, endTime: 5 },
    { id: "line-2", text: "Second line", startTime: 5, endTime: 10 },
  ],
}

const mockCachedData: Omit<CachedLyrics, "cachedAt"> = {
  version: LYRICS_CACHE_VERSION,
  lyrics: mockLyrics,
  bpm: 120,
  key: "C",
  albumArt: "https://example.com/art.jpg",
  albumArtLarge: "https://example.com/art-large.jpg",
  spotifyId: "spotify123",
  bpmSource: { name: "Test", url: "https://example.com" },
  lyricsSource: { name: "LRCLIB", url: "https://lrclib.net" },
  hasEnhancement: true,
  enhancement: { version: 1, algoVersion: 1, lines: [] },
  hasChordEnhancement: false,
  chordEnhancement: null,
}

describe("lyrics-cache", () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("saveCachedLyrics", () => {
    test("saves lyrics to localStorage", () => {
      saveCachedLyrics(12345, mockCachedData)

      const stored = localStorageMock.getItem(`${LYRICS_KEY_PREFIX}12345`)
      expect(stored).not.toBeNull()
      if (!stored) return

      const parsed = JSON.parse(stored) as CachedLyrics
      expect(parsed.lyrics.title).toBe("Test Song")
      expect(parsed.bpm).toBe(120)
      expect(parsed.cachedAt).toBe(Date.now())
    })

    test("includes cache version", () => {
      saveCachedLyrics(12345, mockCachedData)

      const stored = localStorageMock.getItem(`${LYRICS_KEY_PREFIX}12345`)
      expect(stored).not.toBeNull()
      if (!stored) return

      const parsed = JSON.parse(stored) as CachedLyrics
      expect(parsed.version).toBe(LYRICS_CACHE_VERSION)
    })
  })

  describe("loadCachedLyrics", () => {
    test("loads cached lyrics", () => {
      saveCachedLyrics(12345, mockCachedData)

      const loaded = loadCachedLyrics(12345)

      expect(loaded).not.toBeNull()
      expect(loaded?.lyrics.title).toBe("Test Song")
      expect(loaded?.bpm).toBe(120)
      expect(loaded?.enhancement).toEqual({ version: 1, algoVersion: 1, lines: [] })
    })

    test("returns null for non-existent cache", () => {
      const loaded = loadCachedLyrics(99999)
      expect(loaded).toBeNull()
    })

    test("returns null for expired cache", () => {
      saveCachedLyrics(12345, mockCachedData)

      // Advance time by 8 days (past 7-day TTL)
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000)

      const loaded = loadCachedLyrics(12345)
      expect(loaded).toBeNull()
    })

    test("returns valid cache within TTL", () => {
      saveCachedLyrics(12345, mockCachedData)

      // Advance time by 6 days (within 7-day TTL)
      vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000)

      const loaded = loadCachedLyrics(12345)
      expect(loaded).not.toBeNull()
    })

    test("returns null for old cache version", () => {
      // Manually save with old version
      const oldVersionData = {
        ...mockCachedData,
        version: 0,
        cachedAt: Date.now(),
      }
      localStorageMock.setItem(`${LYRICS_KEY_PREFIX}12345`, JSON.stringify(oldVersionData))

      const loaded = loadCachedLyrics(12345)
      expect(loaded).toBeNull()
    })

    test("returns null for cache with no lyrics lines", () => {
      const emptyLyricsData = {
        ...mockCachedData,
        lyrics: { ...mockLyrics, lines: [] },
        cachedAt: Date.now(),
      }
      localStorageMock.setItem(`${LYRICS_KEY_PREFIX}12345`, JSON.stringify(emptyLyricsData))

      const loaded = loadCachedLyrics(12345)
      expect(loaded).toBeNull()
    })
  })

  describe("hasCachedLyrics", () => {
    test("returns true for cached lyrics", () => {
      saveCachedLyrics(12345, mockCachedData)
      expect(hasCachedLyrics(12345)).toBe(true)
    })

    test("returns false for non-existent cache", () => {
      expect(hasCachedLyrics(99999)).toBe(false)
    })
  })

  describe("removeCachedLyrics", () => {
    test("removes cached lyrics", () => {
      saveCachedLyrics(12345, mockCachedData)
      expect(hasCachedLyrics(12345)).toBe(true)

      removeCachedLyrics(12345)
      expect(hasCachedLyrics(12345)).toBe(false)
    })
  })

  describe("getAllCachedLyrics", () => {
    test("returns all cached lyrics", () => {
      saveCachedLyrics(11111, mockCachedData)
      saveCachedLyrics(22222, { ...mockCachedData, lyrics: { ...mockLyrics, title: "Song 2" } })

      const all = getAllCachedLyrics()

      expect(all).toHaveLength(2)
      expect(all.map(c => c.id).sort()).toEqual([11111, 22222])
    })

    test("excludes expired entries", () => {
      // Save first entry
      saveCachedLyrics(11111, mockCachedData)

      // Save second entry before advancing time (both valid initially)
      saveCachedLyrics(22222, { ...mockCachedData, lyrics: { ...mockLyrics, title: "Song 2" } })

      // Verify both are present
      expect(getAllCachedLyrics()).toHaveLength(2)

      // Advance time past TTL
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000)

      // Both should now be expired
      const all = getAllCachedLyrics()
      expect(all).toHaveLength(0)
    })
  })

  describe("clearAllCachedLyrics", () => {
    test("clears all cached lyrics", () => {
      saveCachedLyrics(11111, mockCachedData)
      saveCachedLyrics(22222, mockCachedData)

      clearAllCachedLyrics()

      expect(getAllCachedLyrics()).toHaveLength(0)
    })

    test("does not clear other localStorage keys", () => {
      saveCachedLyrics(11111, mockCachedData)
      localStorageMock.setItem("other-key", "other-value")

      clearAllCachedLyrics()

      expect(localStorageMock.getItem("other-key")).toBe("other-value")
    })
  })

  describe("enhancement caching", () => {
    test("caches enhancements with lyrics", () => {
      const dataWithEnhancement = {
        ...mockCachedData,
        hasEnhancement: true,
        enhancement: { version: 1, algoVersion: 1, lines: [{ idx: 0, words: [] }] },
        hasChordEnhancement: true,
        chordEnhancement: {
          patchFormatVersion: "chords-json-v1" as const,
          algoVersion: "1.0",
          lines: [],
        },
      }

      saveCachedLyrics(12345, dataWithEnhancement)
      const loaded = loadCachedLyrics(12345)

      expect(loaded?.hasEnhancement).toBe(true)
      expect(loaded?.enhancement).toEqual({
        version: 1,
        algoVersion: 1,
        lines: [{ idx: 0, words: [] }],
      })
      expect(loaded?.hasChordEnhancement).toBe(true)
      expect(loaded?.chordEnhancement).toEqual({
        patchFormatVersion: "chords-json-v1",
        algoVersion: "1.0",
        lines: [],
      })
    })

    test("loads lyrics without enhancements", () => {
      const dataWithoutEnhancement = {
        ...mockCachedData,
        hasEnhancement: false,
        enhancement: null,
        hasChordEnhancement: false,
        chordEnhancement: null,
      }

      saveCachedLyrics(12345, dataWithoutEnhancement)
      const loaded = loadCachedLyrics(12345)

      expect(loaded?.hasEnhancement).toBe(false)
      expect(loaded?.enhancement).toBeNull()
    })
  })
})
