import { createSpotifyFilter } from "@web-scrobbler/metadata-filter"

const spotifyFilter = createSpotifyFilter()

/**
 * Patterns to remove from track names (applied in order after spotifyFilter)
 */
const trackCleanupPatterns: RegExp[] = [
  // Remaster variants (parenthetical/bracketed)
  /\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]/gi,
  // Remaster variants (dash-separated)
  /\s*[-–—]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)/gi,

  // Live/acoustic variants (parenthetical/bracketed)
  /\s*[\(\[](?:live(?:\s+(?:at|from|in)\s+[^)\]]+)?|acoustic(?:\s+version)?|unplugged)[\)\]]/gi,
  // Live/acoustic variants (dash-separated)
  /\s*[-–—]\s*(?:live(?:\s+(?:at|from|in)\s+.+)?|acoustic(?:\s+version)?)/gi,

  // Edition variants
  /\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]/gi,

  // Format variants
  /\s*[\(\[](?:album\s+version|extended(?:\s+(?:mix|version))?|original\s+mix|mono|stereo)[\)\]]/gi,

  // Content labels
  /\s*[\(\[](?:instrumental|karaoke)[\)\]]/gi,

  // Demo/alternate
  /\s*[\(\[](?:demo(?:\s+version)?|alternate(?:\s+(?:take|version))?|outtake)[\)\]]/gi,

  // Original patterns from second pass (radio edit, single version, etc.)
  /\s*[\(\[](?:radio\s+edit|single\s+version|explicit|clean|paused)[\)\]]/gi,

  // Year suffixes in parentheses/brackets (e.g., "(2016 Version)")
  /\s*[\(\[](?:\d{4}\s+(?:version|mix|edit|remaster(?:ed)?))[\)\]]/gi,

  // Year suffixes at end with dash (e.g., "- 2021", "- 2016 Version")
  /\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$/gi,
]

/**
 * Patterns to remove from album names (applied in order after spotifyFilter)
 */
const albumCleanupPatterns: RegExp[] = [
  // Remaster variants (parenthetical/bracketed)
  /\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)[\)\]]/gi,
  // Remaster variants (dash-separated)
  /\s*[-–—]\s*(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster(?:ed)?)/gi,

  // Edition variants
  /\s*[\(\[](?:deluxe|super\s+deluxe|expanded|anniversary|bonus\s+track(?:s)?|special|collector'?s?)(?:\s+edition)?[\)\]]/gi,

  // Other common album suffixes
  /\s*[\(\[](?:explicit|clean)[\)\]]/gi,

  // Year suffixes at end
  /\s*[-–—]\s*\d{4}(?:\s+(?:version|mix|edit))?$/gi,
]

/**
 * Clean track name by removing remaster labels, radio edit, live, etc.
 */
export function normalizeTrackName(name: string): string {
  // First pass: use the Spotify filter to clean up common remaster suffixes
  let title = spotifyFilter.filterField("track", name)

  // Second pass: apply all cleanup patterns in order
  for (const pattern of trackCleanupPatterns) {
    title = title.replace(pattern, "")
  }

  return title.trim()
}

/**
 * Patterns to remove from artist names
 */
const artistCleanupPatterns: RegExp[] = [
  // Featured artists (remove everything after)
  /\s+(?:feat\.?|ft\.?|featuring|with|&|,|;|\/)\s+.*/gi,
  // Band qualifiers at end
  /\s+(?:band|orchestra|ensemble|quartet|trio)$/gi,
]

/**
 * Clean artist name by removing feat., ft., featuring, band qualifiers, etc.
 */
export function normalizeArtistName(name: string): string {
  let result = name
  for (const pattern of artistCleanupPatterns) {
    result = result.replace(pattern, "")
  }
  return result.trim()
}

/**
 * Clean album name by removing remaster labels, deluxe edition, etc.
 */
export function normalizeAlbumName(name: string): string {
  // First pass: use the Spotify filter to clean up common remaster suffixes
  let album = spotifyFilter.filterField("album", name)

  // Second pass: apply all cleanup patterns in order
  for (const pattern of albumCleanupPatterns) {
    album = album.replace(pattern, "")
  }

  return album.trim()
}

/**
 * Create a normalized key for deduplication by combining cleaned title and artist
 */
export function createDeduplicationKey(title: string, artist: string): string {
  const normalizedTitle = normalizeTrackName(title)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?'"]/g, "")
    .trim()

  const normalizedArtist = normalizeArtistName(artist)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?'"]/g, "")
    .trim()

  return `${normalizedArtist}:${normalizedTitle}`
}

/**
 * Album type classification for best album selection.
 * Lower priority number = preferred album type.
 */
export type AlbumType = "studio" | "remaster" | "deluxe" | "compilation" | "live" | "soundtrack"

const ALBUM_TYPE_PRIORITY: Record<AlbumType, number> = {
  studio: 0,
  remaster: 1,
  deluxe: 2,
  compilation: 3,
  live: 4,
  soundtrack: 5,
}

/**
 * Classify album by type based on name patterns.
 * Used for selecting the best album when multiple are available.
 */
export function classifyAlbum(albumName: string): AlbumType {
  const lower = albumName.toLowerCase()

  if (/\b(live|concert|tour|unplugged)\b/.test(lower)) return "live"
  if (/\b(greatest\s+hits|best\s+of|collection|anthology|essential)\b/.test(lower))
    return "compilation"
  if (/\b(soundtrack|ost|motion\s+picture)\b/.test(lower)) return "soundtrack"
  if (/\b(remaster(?:ed)?|reissue)\b/.test(lower)) return "remaster"
  if (/\b(deluxe|expanded|anniversary|special|collector)\b/.test(lower)) return "deluxe"

  return "studio"
}

/**
 * Select the best album from a list of album names.
 * Prefers: studio > remaster > deluxe > compilation > live > soundtrack
 */
export function selectBestAlbum(albums: readonly string[]): string {
  if (albums.length === 0) return ""

  return (
    [...albums].sort((a, b) => {
      const typeA = classifyAlbum(a)
      const typeB = classifyAlbum(b)
      return (ALBUM_TYPE_PRIORITY[typeA] ?? 99) - (ALBUM_TYPE_PRIORITY[typeB] ?? 99)
    })[0] ?? ""
  )
}
