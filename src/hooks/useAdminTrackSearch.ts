"use client"

import useSWR from "swr"

// ============================================================================
// Types (shared with API)
// ============================================================================

export type SearchType = "fts" | "lrclib_id" | "spotify_id"

export interface SearchResult {
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  albumImageUrl: string | null
  inCatalog: boolean
  catalogSongId: string | null
}

export interface SearchResponse {
  results: SearchResult[]
  searchType: SearchType
  query: string
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetcher(url: string): Promise<SearchResponse> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`)
  }
  return res.json() as Promise<SearchResponse>
}

// ============================================================================
// Hook
// ============================================================================

export function useAdminTrackSearch(query: string, limit = 20) {
  const trimmed = query.trim()

  // Don't fetch if query is empty
  const shouldFetch = trimmed.length > 0

  const searchParams = new URLSearchParams()
  searchParams.set("q", trimmed)
  searchParams.set("limit", limit.toString())

  const url = shouldFetch ? `/api/admin/tracks/search?${searchParams.toString()}` : null

  const { data, error, isLoading, isValidating, mutate } = useSWR<SearchResponse>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000, // 5 seconds for search (shorter than catalog)
  })

  return {
    data,
    error,
    isLoading: shouldFetch && isLoading,
    isValidating,
    searchType: data?.searchType ?? null,
    mutate,
  }
}
