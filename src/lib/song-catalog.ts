/**
 * Song Catalog Utilities
 *
 * Functions for normalizing song metadata for the global catalog.
 * Used to create consistent deduplication keys across different sources.
 */

import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "./normalize-track"

/**
 * Create normalized lowercase key for song deduplication.
 * Strips common suffixes, punctuation, and normalizes whitespace.
 */
export function normalizeSongKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?'"():;\-–—]/g, "")
    .trim()
}

/**
 * Normalize title for catalog storage.
 * Applies track cleaning (removes remaster labels, etc.) then creates lowercase key.
 */
export function normalizeTitle(title: string): string {
  const cleaned = normalizeTrackName(title)
  return normalizeSongKey(cleaned)
}

/**
 * Normalize artist for catalog storage.
 * Removes featured artists, then creates lowercase key.
 */
export function normalizeArtist(artist: string): string {
  const cleaned = normalizeArtistName(artist)
  return normalizeSongKey(cleaned)
}

/**
 * Normalize album for catalog storage.
 * Applies album cleaning (removes remaster labels, etc.) then creates lowercase key.
 */
export function normalizeAlbum(album: string): string {
  const cleaned = normalizeAlbumName(album)
  return normalizeSongKey(cleaned)
}

/**
 * BPM attribution info for storage.
 */
export interface BpmAttribution {
  readonly bpm: number
  readonly musicalKey?: string | null | undefined
  readonly source: string
  readonly sourceUrl: string
}

/**
 * Input for creating/finding a song in the catalog.
 */
export interface CatalogSongInput {
  readonly title: string
  readonly artist: string
  readonly album?: string | null | undefined
  readonly durationMs?: number | null | undefined
  readonly spotifyId?: string | null | undefined
  readonly lrclibId?: number | null | undefined
  readonly hasSyncedLyrics?: boolean | undefined
  readonly bpmAttribution?: BpmAttribution | null | undefined
}

/**
 * Prepare song data for catalog upsert.
 * Returns both display values and normalized keys.
 */
export function prepareCatalogSong(input: CatalogSongInput) {
  return {
    // Display values (cleaned but preserving case)
    title: normalizeTrackName(input.title),
    artist: normalizeArtistName(input.artist),
    album: input.album ?? null,
    durationMs: input.durationMs ?? null,
    spotifyId: input.spotifyId ?? null,

    // Normalized keys for deduplication
    titleLower: normalizeTitle(input.title),
    artistLower: normalizeArtist(input.artist),

    // Normalized album for search (not deduplication)
    albumLower: input.album ? normalizeAlbum(input.album) : null,

    // Status
    hasSyncedLyrics: input.hasSyncedLyrics ?? false,

    // BPM metadata
    bpm: input.bpmAttribution?.bpm ?? null,
    musicalKey: input.bpmAttribution?.musicalKey ?? null,
    bpmSource: input.bpmAttribution?.source ?? null,
    bpmSourceUrl: input.bpmAttribution?.sourceUrl ?? null,
  }
}
