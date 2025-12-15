/**
 * Lyrics caching utilities for localStorage
 *
 * Pure functions - no side effects outside localStorage
 */

import type { CachedLyrics } from "./recent-songs-types"
import { LYRICS_CACHE_TTL_MS } from "./recent-songs-types"

const LYRICS_KEY_PREFIX = "scrolltunes:lyrics:"

function lyricsKey(id: number): string {
  return `${LYRICS_KEY_PREFIX}${id}`
}

/**
 * Load cached lyrics by LRCLIB ID
 * Returns null if not found, expired, or parse error
 */
export function loadCachedLyrics(id: number): CachedLyrics | null {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(lyricsKey(id))
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedLyrics
    const now = Date.now()

    if (now - parsed.cachedAt > LYRICS_CACHE_TTL_MS) {
      localStorage.removeItem(lyricsKey(id))
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/**
 * Save lyrics to cache
 */
export function saveCachedLyrics(id: number, data: Omit<CachedLyrics, "cachedAt">): void {
  if (typeof window === "undefined") return

  try {
    const cached: CachedLyrics = {
      ...data,
      cachedAt: Date.now(),
    }
    localStorage.setItem(lyricsKey(id), JSON.stringify(cached))
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Remove cached lyrics for a specific ID
 */
export function removeCachedLyrics(id: number): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem(lyricsKey(id))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if cached lyrics exist and are valid (not expired)
 */
export function hasCachedLyrics(id: number): boolean {
  return loadCachedLyrics(id) !== null
}

/**
 * Clear all cached lyrics (useful for debugging/settings)
 */
export function clearAllCachedLyrics(): void {
  if (typeof window === "undefined") return

  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(LYRICS_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage errors
  }
}
