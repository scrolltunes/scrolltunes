/**
 * Shared types for /api/lyrics API response
 * Used by both the route handler and client components
 */

import type { Lyrics } from "@/core"

export interface AttributionSource {
  readonly name: string
  readonly url: string
}

/**
 * Warning types for lyrics loading issues that don't prevent loading
 * but indicate missing or potentially inaccurate metadata
 */
export type LyricsWarningType = "missing_spotify_metadata"

export interface LyricsWarning {
  readonly type: LyricsWarningType
  readonly message: string
}

export interface LyricsApiAttribution {
  readonly lyrics?: AttributionSource | null | undefined
  readonly bpm?: AttributionSource | null | undefined
}

export interface LyricsApiSuccessResponse {
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly timeSignature?: number | null
  readonly albumArt?: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId?: string | null
  readonly attribution: LyricsApiAttribution
  readonly hasEnhancement?: boolean
  readonly hasChordEnhancement?: boolean
  readonly warnings?: readonly LyricsWarning[]
}

export interface LyricsApiErrorResponse {
  readonly error: string
}

export type LyricsApiResponse = LyricsApiSuccessResponse | LyricsApiErrorResponse

/**
 * Type guard to check if response is successful
 */
export function isLyricsApiSuccess(
  response: LyricsApiResponse,
): response is LyricsApiSuccessResponse {
  return "lyrics" in response
}
