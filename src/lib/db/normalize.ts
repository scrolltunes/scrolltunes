/**
 * Database normalization helpers
 *
 * Ensures song titles and artist names are normalized before persisting to the database.
 * Use these helpers when inserting or updating song data.
 */

import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"

export interface SongInput {
  readonly songTitle: string
  readonly songArtist: string
  readonly songAlbum: string
}

export interface NormalizedSongInput {
  readonly songTitle: string
  readonly songArtist: string
  readonly songAlbum: string
}

/**
 * Normalize song title, artist, and album before database insert/update
 */
export function normalizeSongInput<T extends SongInput>(input: T): T {
  return {
    ...input,
    songTitle: normalizeTrackName(input.songTitle),
    songArtist: normalizeArtistName(input.songArtist),
    songAlbum: normalizeAlbumName(input.songAlbum),
  } as T
}

/**
 * Normalize title and artist fields (for APIs using title/artist instead of songTitle/songArtist)
 */
export function normalizeTitleArtist<T extends { title: string; artist: string }>(input: T): T {
  return {
    ...input,
    title: normalizeTrackName(input.title),
    artist: normalizeArtistName(input.artist),
  }
}
