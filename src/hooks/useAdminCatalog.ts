"use client"

import useSWR from "swr"

// ============================================================================
// Types (shared with API)
// ============================================================================

export type CatalogFilter = "all" | "missing_bpm" | "missing_enhancement" | "missing_spotify"
export type CatalogSort = "plays" | "recent" | "alpha"

export interface CatalogTrack {
  id: string
  lrclibId: number | null
  title: string
  artist: string
  album: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  spotifyId: string | null
  albumArtUrl: string | null
  totalPlayCount: number
  uniqueUsers: number
  lastPlayedAt: string | null
}

export interface CatalogResponse {
  tracks: CatalogTrack[]
  total: number
  offset: number
  hasMore: boolean
}

// ============================================================================
// Fetcher
// ============================================================================

async function fetcher(url: string): Promise<CatalogResponse> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`)
  }
  return res.json() as Promise<CatalogResponse>
}

// ============================================================================
// Hook
// ============================================================================

interface UseAdminCatalogParams {
  filter?: CatalogFilter
  sort?: CatalogSort
  offset?: number
  limit?: number
}

export function useAdminCatalog(params: UseAdminCatalogParams = {}) {
  const { filter = "all", sort = "plays", offset = 0, limit = 50 } = params

  const searchParams = new URLSearchParams()
  if (filter !== "all") searchParams.set("filter", filter)
  if (sort !== "plays") searchParams.set("sort", sort)
  searchParams.set("limit", limit.toString())
  searchParams.set("offset", offset.toString())

  const url = `/api/admin/catalog?${searchParams.toString()}`

  const { data, error, isLoading, isValidating, mutate } = useSWR<CatalogResponse>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute
  })

  return { data, error, isLoading, isValidating, mutate }
}
