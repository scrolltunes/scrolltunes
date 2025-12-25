/**
 * Types for recent songs and lyrics caching
 */

import type { Lyrics } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import type { ChordEnhancementPayloadV1 } from "@/lib/gp/chord-types"

/**
 * A recently played song entry stored in localStorage
 */
export interface RecentSong {
  readonly id: number // LRCLIB numeric ID
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly durationSeconds: number // seconds (matching Lyrics.duration)
  readonly lastPlayedAt: number // timestamp (ms since epoch)
  readonly lastPositionSeconds?: number | undefined // resume position (seconds)
  readonly lastPositionUpdatedAt?: number | undefined // timestamp (ms since epoch)
}

/**
 * Attribution source with name and URL
 */
export interface AttributionSource {
  readonly name: string
  readonly url: string
}

/**
 * Cached lyrics data with expiry tracking
 */
export interface CachedLyrics {
  readonly version?: number | undefined
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly albumArt?: string | undefined
  readonly spotifyId?: string | undefined
  readonly bpmSource?: AttributionSource | undefined
  readonly lyricsSource?: AttributionSource | undefined
  readonly hasEnhancement?: boolean | undefined
  readonly enhancement?: EnhancementPayload | null | undefined
  readonly hasChordEnhancement?: boolean | undefined
  readonly chordEnhancement?: ChordEnhancementPayloadV1 | null | undefined
  readonly cachedAt: number // timestamp (ms since epoch)
}

/**
 * Configuration for lyrics cache
 */
export const LYRICS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Configuration for recent songs
 */
export const MAX_RECENT_SONGS = 5

/**
 * Position validation constants (used internally by RecentSongsStore)
 */
export const POSITION_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2 hours
export const POSITION_MIN_SECONDS = 5
export const POSITION_END_BUFFER_SECONDS = 10
