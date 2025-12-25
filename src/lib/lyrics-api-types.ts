/**
 * Shared types for /api/lyrics API response
 * Used by both the route handler and client components
 */

import type { Lyrics } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"

export interface AttributionSource {
  readonly name: string
  readonly url: string
}

export interface LyricsApiAttribution {
  readonly lyrics?: AttributionSource | null | undefined
  readonly bpm?: AttributionSource | null | undefined
}

export interface LyricsApiSuccessResponse {
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly albumArt?: string | null
  readonly spotifyId?: string | null
  readonly attribution: LyricsApiAttribution
  readonly hasEnhancement?: boolean
  readonly enhancement?: EnhancementPayload | null
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
