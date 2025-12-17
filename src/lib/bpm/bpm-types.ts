import { createSpotifyFilter } from "@web-scrobbler/metadata-filter"

/**
 * BPM domain types
 */

export interface BPMTrackQuery {
  readonly title: string
  readonly artist: string
}

export interface NormalizedTrackKey {
  readonly title: string
  readonly artist: string
}

export interface BPMResult {
  readonly bpm: number
  readonly source: string
  readonly key: string | null
}

const spotifyFilter = createSpotifyFilter()

function simplifyTitle(raw: string): string {
  // First pass: use the Spotify filter to clean up common remaster suffixes
  let title = spotifyFilter.filterField("track", raw)

  // Second pass: remove common parenthetical suffixes the library misses
  title = title
    .replace(
      /\s*[\(\[](?:radio edit|single version|acoustic|deluxe(?: edition)?|explicit|clean|instrumental|extended|original mix)[\)\]]\s*$/gi,
      "",
    )
    .toLowerCase()
    .trim()

  // Collapse whitespace and remove punctuation
  title = title.replace(/\s+/g, " ").replace(/[.,!?'"]/g, "")

  return title
}

function simplifyArtist(raw: string): string {
  let artist = raw.toLowerCase().trim()

  // Keep only primary artist (before feat./ft./featuring/&)
  artist = artist.replace(/\s+(feat\.?|ft\.?|featuring|&)\s+.*$/gi, "")

  // Collapse whitespace and remove punctuation
  artist = artist.replace(/\s+/g, " ").replace(/[.,!?'"]/g, "")

  return artist
}

/**
 * Normalize track info for consistent matching/caching
 */
export function normalizeTrackKey(query: BPMTrackQuery): NormalizedTrackKey {
  return {
    title: simplifyTitle(query.title),
    artist: simplifyArtist(query.artist),
  }
}

/**
 * Create a cache key from normalized track info
 */
export function makeCacheKey(query: BPMTrackQuery): string {
  const normalized = normalizeTrackKey(query)
  return `${normalized.artist}:${normalized.title}`
}
