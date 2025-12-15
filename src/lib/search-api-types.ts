/**
 * Shared types for /api/search API response
 */

export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly duration: number
  readonly hasLyrics: boolean
}

export interface SearchApiResponse {
  readonly tracks: SearchResultTrack[]
  readonly error?: string
}
