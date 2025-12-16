/**
 * Track normalization functions for matching Spotify tracks to LRCLIB
 */

/**
 * Normalize title by removing parenthetical suffixes and remaster labels
 */
function normalizeTitle(raw: string): string {
  let title = raw.toLowerCase().trim()

  // Remove anything in parentheses/brackets (Remastered 2011, feat. Artist, Live, etc.)
  title = title.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "")

  // Remove common suffixes like "- Remastered", "- Radio Edit", "- Single Version"
  title = title.replace(
    /\s*-\s*(remaster(ed)?(\s+\d{4})?|radio edit|single version|live|acoustic|remix).*$/gi,
    "",
  )

  // Strip "feat.", "ft.", "featuring" and everything after
  title = title.replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/gi, "")

  // Collapse whitespace and remove punctuation
  title = title.replace(/\s+/g, " ").replace(/[.,!?'"]/g, "")

  return title.trim()
}

/**
 * Normalize artist by keeping primary artist only
 */
function normalizeArtist(raw: string): string {
  let artist = raw.toLowerCase().trim()

  // Keep only primary artist (before feat./ft./featuring/&)
  artist = artist.replace(/\s+(feat\.?|ft\.?|featuring|&)\s+.*$/gi, "")

  // Collapse whitespace and remove punctuation
  artist = artist.replace(/\s+/g, " ").replace(/[.,!?'"]/g, "")

  return artist.trim()
}

/**
 * Normalize track info for matching Spotify tracks to LRCLIB
 */
export function normalizeForLRCLib(
  title: string,
  artist: string,
): { title: string; artist: string } {
  return {
    title: normalizeTitle(title),
    artist: normalizeArtist(artist),
  }
}

/**
 * Build a search query string for LRCLIB's q= parameter
 */
export function buildLRCLibSearchQuery(title: string, artist: string): string {
  const normalized = normalizeForLRCLib(title, artist)
  return `${normalized.artist} ${normalized.title}`
}
