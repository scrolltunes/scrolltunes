/**
 * Deezer API client for fetching album art
 *
 * Server-side only - uses Effect.ts patterns with tagged error classes.
 * No authentication required - Deezer API is public.
 */

import { Data, Effect } from "effect"

// --- Error Classes ---

export class DeezerAPIError extends Data.TaggedClass("DeezerAPIError")<{
  readonly message: string
}> {}

// --- Response Types ---

interface DeezerAlbum {
  readonly cover_small: string
  readonly cover_medium: string
  readonly cover_big: string
  readonly cover_xl: string
}

interface DeezerTrack {
  readonly album: DeezerAlbum
}

interface DeezerSearchResponse {
  readonly data: readonly DeezerTrack[]
}

// --- Constants ---

const DEEZER_BASE_URL = "https://api.deezer.com"

export type AlbumArtSize = "small" | "medium" | "big" | "xl"

// --- Helpers ---

/**
 * Normalize artist/track name for Deezer search.
 * - Extracts text from parentheses if present (e.g., "✝✝✝ (Crosses)" → "Crosses")
 * - Removes non-ASCII symbols that Deezer can't search
 * - Falls back to original if normalization produces empty string
 */
function normalizeForSearch(text: string): string {
  // Try extracting text from parentheses first (common for alt names)
  const parenMatch = text.match(/\(([^)]+)\)/)
  if (parenMatch?.[1]) {
    const extracted = parenMatch[1].trim()
    // Only use if it contains mostly ASCII letters
    if (/^[\w\s'-]+$/i.test(extracted)) {
      return extracted
    }
  }

  // Remove non-ASCII characters and special symbols, keep letters/numbers/spaces
  const cleaned = text
    .replace(/[^\w\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned || text
}

// --- Effect-based Functions ---

/**
 * Search Deezer for album art by artist and track name.
 * Returns the cover URL or null if not found.
 *
 * Uses Effect.gen for sequential composition with yield* to unwrap each step.
 */
export const searchAlbumArt = (
  artist: string,
  track: string,
  size: AlbumArtSize = "medium",
): Effect.Effect<string | null, DeezerAPIError> => {
  return Effect.gen(function* () {
    const normalizedArtist = normalizeForSearch(artist)
    const normalizedTrack = normalizeForSearch(track)
    const query = encodeURIComponent(`${normalizedArtist} ${normalizedTrack}`)
    const url = `${DEEZER_BASE_URL}/search?q=${query}&limit=1`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: error =>
        new DeezerAPIError({
          message: error instanceof Error ? error.message : "Network error",
        }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new DeezerAPIError({ message: `HTTP ${response.status}: ${response.statusText}` }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<DeezerSearchResponse>,
      catch: error =>
        new DeezerAPIError({
          message: error instanceof Error ? error.message : "Failed to parse response",
        }),
    })

    if (data.data.length === 0) {
      return null
    }

    const album = data.data[0]?.album
    if (!album) {
      return null
    }

    switch (size) {
      case "small":
        return album.cover_small
      case "medium":
        return album.cover_medium
      case "big":
        return album.cover_big
      case "xl":
        return album.cover_xl
    }
  })
}

// --- Async Wrapper ---

/**
 * Convenience async wrapper for use in API routes.
 * Returns null on any error (network, not found, etc.).
 */
export async function getAlbumArt(
  artist: string,
  track: string,
  size: AlbumArtSize = "medium",
): Promise<string | null> {
  return Effect.runPromise(
    searchAlbumArt(artist, track, size).pipe(
      Effect.catchTag("DeezerAPIError", () => Effect.succeed(null)),
    ),
  )
}
