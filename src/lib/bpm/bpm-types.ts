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

/**
 * Simplify title by removing parenthetical suffixes and remaster labels
 */
function simplifyTitle(raw: string): string {
  let title = raw.toLowerCase().trim()

  // Remove anything in parentheses/brackets at the end
  title = title.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/g, "")

  // Remove common suffixes
  title = title
    .replace(
      /\s*-\s*(remaster(ed)?(\s+\d{4})?|radio edit|single version|live|acoustic|remix).*$/gi,
      "",
    )
    .trim()

  // Collapse whitespace and remove punctuation
  title = title.replace(/\s+/g, " ").replace(/[.,!?'"]/g, "")

  return title
}

/**
 * Simplify artist by removing "feat." and variations
 */
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
