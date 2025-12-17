import { createSpotifyFilter } from "@web-scrobbler/metadata-filter"

const spotifyFilter = createSpotifyFilter()

/**
 * Clean track name by removing remaster labels, radio edit, live, etc.
 */
export function normalizeTrackName(name: string): string {
  // First pass: use the Spotify filter to clean up common remaster suffixes
  let title = spotifyFilter.filterField("track", name)

  // Second pass: remove common parenthetical suffixes the library misses
  title = title
    .replace(
      /\s*[\(\[](?:radio edit|single version|acoustic|deluxe(?: edition)?|explicit|clean|instrumental|extended|original mix)[\)\]]\s*$/gi,
      "",
    )
    .trim()

  return title
}

/**
 * Clean artist name by removing feat., ft., featuring, etc.
 */
export function normalizeArtistName(name: string): string {
  return name
    .replace(/\s+(feat\.?|ft\.?|featuring|&|,|;|\/)\s+.*/i, "")
    .trim()
}

/**
 * Clean album name by removing remaster labels, deluxe edition, etc.
 */
export function normalizeAlbumName(name: string): string {
  // First pass: use the Spotify filter to clean up common remaster suffixes
  let album = spotifyFilter.filterField("album", name)

  // Second pass: remove common parenthetical suffixes the library misses
  album = album
    .replace(
      /\s*[\(\[](?:remaster(?:ed)?(?:\s+\d{4})?|deluxe(?:\s+edition)?|expanded(?:\s+edition)?|anniversary(?:\s+edition)?|special(?:\s+edition)?|bonus\s+track(?:s)?|super\s+deluxe)[\)\]]\s*$/gi,
      "",
    )
    .trim()

  return album
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
