/**
 * Client-side localStorage BPM cache
 *
 * Stores BPM values per song to reduce API calls across sessions.
 * Safe for SSR - no-ops when window is undefined.
 */

import { type BPMTrackQuery, makeCacheKey } from "./bpm-types"

const STORAGE_KEY = "scrolltunes.bpmCache.v1"
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface StoredEntry {
  readonly bpm: number
  readonly key?: string | null
  readonly source: string
  readonly storedAt: number
}

interface StoredBPMCache {
  [cacheKey: string]: StoredEntry
}

function loadCache(): StoredBPMCache {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as StoredBPMCache
  } catch {
    return {}
  }
}

function saveCache(cache: StoredBPMCache): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full or unavailable - ignore
  }
}

/**
 * Get cached BPM for a track
 * Returns null if not cached or expired
 */
export function getCachedBpm(query: BPMTrackQuery): StoredEntry | null {
  const cache = loadCache()
  const key = makeCacheKey(query)
  const entry = cache[key]

  if (!entry) return null

  // Check if expired
  if (Date.now() - entry.storedAt > MAX_AGE_MS) {
    return null
  }

  return entry
}

/**
 * Store BPM in localStorage cache
 */
export function setCachedBpm(
  query: BPMTrackQuery,
  bpm: number,
  source: string,
  key?: string | null,
): void {
  const cache = loadCache()
  const cacheKey = makeCacheKey(query)

  cache[cacheKey] = {
    bpm,
    key: key ?? null,
    source,
    storedAt: Date.now(),
  }

  saveCache(cache)
}

/**
 * Clear localStorage BPM cache
 */
export function clearLocalBpmCache(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
}
