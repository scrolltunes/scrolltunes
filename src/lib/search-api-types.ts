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
  readonly spotifyId?: string | undefined
  readonly lrclibId?: number | undefined
  // Enrichment data from Turso (Spotify dump)
  readonly popularity?: number | undefined
  readonly tempo?: number | undefined
}

export interface SearchApiResponse {
  readonly tracks: SearchResultTrack[]
  readonly error?: string
}
