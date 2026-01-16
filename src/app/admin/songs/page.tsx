"use client"

import { springs } from "@/animations"
import { CatalogFilters } from "@/components/admin/CatalogFilters"
import {
  CatalogEmptyState,
  CatalogTrackLoadingRow,
  CatalogTrackRow,
} from "@/components/admin/CatalogTrackRow"
import { EnrichmentActions } from "@/components/admin/EnrichmentActions"
import {
  SearchEmptyState,
  SearchResultLoadingRow,
  SearchResultRow,
} from "@/components/admin/SearchResultRow"
import { SpotifySearchModal } from "@/components/admin/SpotifySearchModal"
import { TrackDetail } from "@/components/admin/TrackDetail"
import type { TrackWithEnrichment } from "@/components/admin/TracksList"
import { useAccount, useIsAdmin } from "@/core"
import {
  type CatalogFilter,
  type CatalogSort,
  type CatalogTrack,
  useAdminCatalog,
} from "@/hooks/useAdminCatalog"
import { useAdminTrackSearch } from "@/hooks/useAdminTrackSearch"
import { useDebounce } from "@/hooks/useDebounce"
import { makeCanonicalPath } from "@/lib/slug"
import { ArrowLeft, ArrowsDownUp, MagnifyingGlass, ShieldWarning, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useCallback, useState } from "react"

// ============================================================================
// Constants
// ============================================================================

const LIMIT = 50

// ============================================================================
// Header Component
// ============================================================================

function Header({
  isSearchMode,
  onBackToCatalog,
}: {
  isSearchMode?: boolean
  onBackToCatalog?: () => void
}) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center">
        {isSearchMode && onBackToCatalog ? (
          <button
            type="button"
            onClick={onBackToCatalog}
            className="flex items-center gap-2 transition-colors hover:brightness-125"
            style={{ color: "var(--color-text3)" }}
          >
            <ArrowLeft size={20} />
            <span>Catalog</span>
          </button>
        ) : (
          <Link
            href="/admin"
            className="flex items-center gap-2 transition-colors hover:brightness-125"
            style={{ color: "var(--color-text3)" }}
          >
            <ArrowLeft size={20} />
            <span>Admin</span>
          </Link>
        )}
      </div>
    </header>
  )
}

// ============================================================================
// Access Denied Component
// ============================================================================

function AccessDenied() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="text-center max-w-sm"
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-sm flex items-center justify-center"
            style={{ background: "var(--color-surface1)" }}
          >
            <ShieldWarning size={32} style={{ color: "var(--color-text-muted)" }} />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="mb-6" style={{ color: "var(--color-text3)" }}>
            You don&apos;t have permission to view this page
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            Go home
          </Link>
        </motion.div>
      </main>
    </div>
  )
}

// ============================================================================
// Loading Screen Component
// ============================================================================

function LoadingScreen() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div
              className="h-8 w-40 rounded animate-pulse mb-2"
              style={{ background: "var(--color-surface2)" }}
            />
            <div
              className="h-5 w-32 rounded animate-pulse"
              style={{ background: "var(--color-surface2)" }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSearchPlaceholder(query: string, isPending: boolean): string {
  if (isPending && query.trim().length > 0) {
    const trimmed = query.trim()
    if (/^\d+$/.test(trimmed)) return "Searching LRCLIB ID..."
    if (trimmed.includes("spotify")) return "Searching Spotify..."
    return "Searching..."
  }
  return "Search tracks or enter LRCLIB/Spotify ID..."
}

// Convert CatalogTrack to TrackWithEnrichment for TrackDetail compatibility
function catalogTrackToEnrichment(track: CatalogTrack): TrackWithEnrichment {
  return {
    lrclibId: track.lrclibId ?? 0,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSec: 0, // Not available from catalog
    quality: 0, // Not available from catalog
    spotifyId: track.spotifyId,
    popularity: null,
    tempo: track.bpm,
    musicalKey: null, // Stored as string in catalog
    mode: null,
    timeSignature: null,
    isrc: null,
    albumImageUrl: track.albumArtUrl,
    inCatalog: true,
    neonSongId: track.id,
    neonBpm: track.bpm,
    neonMusicalKey: track.musicalKey,
    neonBpmSource: track.bpmSource,
    hasEnhancement: track.hasEnhancement,
    hasChordEnhancement: track.hasChordEnhancement,
    totalPlayCount: track.totalPlayCount,
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function AdminTracksPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()

  // Search state
  const [searchInput, setSearchInput] = useState("")
  const { debouncedValue: debouncedSearch, isPending: isSearchPending } = useDebounce(searchInput, {
    delayMs: 300,
  })

  // Catalog state
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [sort, setSort] = useState<CatalogSort>("plays")
  const [offset, setOffset] = useState(0)

  // Expansion state
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add-to-catalog loading state
  const [addingLrclibId, setAddingLrclibId] = useState<number | null>(null)

  // Spotify search modal state
  const [spotifyModalTrack, setSpotifyModalTrack] = useState<TrackWithEnrichment | null>(null)

  // Data hooks
  const catalogData = useAdminCatalog({ filter, sort, offset, limit: LIMIT })
  const searchData = useAdminTrackSearch(debouncedSearch)

  // Derived state
  const isSearchMode = searchInput.length > 0

  // Handler: Add to catalog
  const handleAddToCatalog = useCallback(
    async (lrclibId: number) => {
      setAddingLrclibId(lrclibId)
      try {
        const res = await fetch(`/api/admin/tracks/${lrclibId}/add-to-catalog`, { method: "POST" })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          if (res.status === 409) {
            // Track already in catalog - this is fine, just refresh to show updated status
          } else {
            throw new Error(data.error ?? "Failed to add")
          }
        }
        // Refresh data to show updated status
        await searchData.mutate()
        await catalogData.mutate()
      } catch (error) {
        console.error("Failed to add track:", error)
      } finally {
        setAddingLrclibId(null)
      }
    },
    [searchData, catalogData],
  )

  // Handler: Copy from Turso (for catalog tracks)
  const handleCopyFromTurso = useCallback(
    async (track: TrackWithEnrichment) => {
      const response = await fetch(`/api/admin/tracks/${track.lrclibId}/copy-enrichment`, {
        method: "POST",
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to copy enrichment")
      }
      await catalogData.mutate()
    },
    [catalogData],
  )

  // Handler: Find Spotify
  const handleFindSpotify = useCallback((track: TrackWithEnrichment) => {
    setSpotifyModalTrack(track)
  }, [])

  // Handler: Spotify select
  const handleSpotifySelect = useCallback(
    async (spotifyId: string) => {
      if (!spotifyModalTrack) return

      const response = await fetch(`/api/admin/tracks/${spotifyModalTrack.lrclibId}/link-spotify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotifyId }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to link Spotify track")
      }

      await catalogData.mutate()
    },
    [spotifyModalTrack, catalogData],
  )

  // Handler: Fetch BPM
  const handleFetchBpm = useCallback(
    async (track: TrackWithEnrichment) => {
      const response = await fetch(`/api/admin/tracks/${track.lrclibId}/fetch-bpm`, {
        method: "POST",
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch BPM")
      }
      await catalogData.mutate()
    },
    [catalogData],
  )

  // Handler: Manual BPM
  const handleManualBpm = useCallback((track: TrackWithEnrichment) => {
    if (track.neonSongId) {
      window.open(`/admin/songs/${track.neonSongId}`, "_blank")
    }
    // If not in catalog, the action is effectively a no-op
  }, [])

  // Handler: View Lyrics
  const handleViewLyrics = useCallback((track: TrackWithEnrichment) => {
    const path = makeCanonicalPath({
      id: track.lrclibId,
      title: track.title,
      artist: track.artist,
    })
    window.open(path, "_blank")
  }, [])

  // Handler: Delete from catalog
  const handleDelete = useCallback(
    async (track: TrackWithEnrichment) => {
      if (!track.neonSongId) return
      const response = await fetch(`/api/admin/catalog/${track.neonSongId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to delete")
      }
      setExpandedId(null)
      await catalogData.mutate()
    },
    [catalogData],
  )

  // Handler: Filter change
  const handleFilterChange = useCallback((newFilter: CatalogFilter) => {
    setFilter(newFilter)
    setOffset(0)
    setExpandedId(null)
  }, [])

  // Handler: Sort change
  const handleSortChange = useCallback((newSort: CatalogSort) => {
    setSort(newSort)
    setOffset(0)
    setExpandedId(null)
  }, [])

  // Handler: Clear search
  const handleClearSearch = useCallback(() => {
    setSearchInput("")
    setExpandedId(null)
  }, [])

  // Render expanded content for catalog tracks
  const renderCatalogExpandedContent = useCallback(
    (track: CatalogTrack) => {
      const enrichmentTrack = catalogTrackToEnrichment(track)
      return (
        <TrackDetail
          track={enrichmentTrack}
          renderActions={t => (
            <EnrichmentActions
              track={t}
              onCopyFromTurso={handleCopyFromTurso}
              onFindSpotify={handleFindSpotify}
              onFetchBpm={handleFetchBpm}
              onManualBpm={handleManualBpm}
              onViewLyrics={handleViewLyrics}
              onDelete={handleDelete}
              onRefresh={() => catalogData.mutate()}
            />
          )}
        />
      )
    },
    [
      handleCopyFromTurso,
      handleFindSpotify,
      handleFetchBpm,
      handleManualBpm,
      handleViewLyrics,
      handleDelete,
      catalogData,
    ],
  )

  // Auth check
  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header isSearchMode={isSearchMode} onBackToCatalog={handleClearSearch} />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Page Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold mb-1">Track Catalog</h1>
            <p style={{ color: "var(--color-text3)" }}>
              {isSearchMode
                ? `Searching ${searchData.data?.results.length ?? 0} results`
                : `${catalogData.data?.total.toLocaleString() ?? "..."} tracks in catalog`}
            </p>
          </motion.div>

          {/* Search and Sort */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.default, delay: 0.1 }}
            className="flex flex-col sm:flex-row gap-3 mb-4"
          >
            {/* Search Input */}
            <div className="relative flex-1">
              <MagnifyingGlass
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-muted)" }}
              />
              <input
                type="text"
                placeholder={getSearchPlaceholder(searchInput, isSearchPending)}
                value={searchInput}
                onChange={e => {
                  setSearchInput(e.target.value)
                  setOffset(0)
                }}
                className="w-full pl-10 pr-10 py-2.5 rounded-lg focus:outline-none transition-colors"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:brightness-125"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Sort Dropdown (only in dashboard mode) */}
            {!isSearchMode && (
              <div className="relative">
                <ArrowsDownUp
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--color-text-muted)" }}
                />
                <select
                  value={sort}
                  onChange={e => handleSortChange(e.target.value as CatalogSort)}
                  className="appearance-none pl-10 pr-10 py-2.5 rounded-lg focus:outline-none transition-colors cursor-pointer"
                  style={{
                    background: "var(--color-surface1)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  <option value="plays">Most played</option>
                  <option value="recent">Recently played</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </div>
            )}
          </motion.div>

          {/* Filter Bar (only in dashboard mode) */}
          {!isSearchMode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.default, delay: 0.15 }}
              className="mb-6"
            >
              <CatalogFilters filter={filter} onFilterChange={handleFilterChange} />
            </motion.div>
          )}

          {/* Search Type Indicator */}
          {isSearchMode && searchData.searchType && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-4 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Search type:{" "}
              <span style={{ color: "var(--color-accent)" }}>
                {searchData.searchType === "lrclib_id"
                  ? "LRCLIB ID"
                  : searchData.searchType === "spotify_id"
                    ? "Spotify ID"
                    : "Full-text search"}
              </span>
            </motion.div>
          )}

          {/* Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...springs.default, delay: 0.2 }}
          >
            {isSearchMode ? (
              // Search Results Mode
              <div
                className="rounded-sm overflow-hidden"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <th
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Track
                      </th>
                      <th
                        className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider hidden md:table-cell"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Duration
                      </th>
                      <th
                        className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchData.isLoading ? (
                      <>
                        <SearchResultLoadingRow />
                        <SearchResultLoadingRow />
                        <SearchResultLoadingRow />
                      </>
                    ) : searchData.data?.results.length === 0 ? (
                      <SearchEmptyState query={debouncedSearch} />
                    ) : (
                      searchData.data?.results.map((result, index) => (
                        <SearchResultRow
                          key={result.lrclibId}
                          result={result}
                          index={index}
                          onAddToCatalog={handleAddToCatalog}
                          isAdding={addingLrclibId === result.lrclibId}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              // Catalog Dashboard Mode
              <>
                <div
                  className="rounded-sm overflow-hidden"
                  style={{
                    background: "var(--color-surface1)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Track
                        </th>
                        <th
                          className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider hidden md:table-cell"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Plays
                        </th>
                        <th
                          className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider hidden md:table-cell"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Users
                        </th>
                        <th
                          className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider hidden lg:table-cell"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Last
                        </th>
                        <th
                          className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider hidden lg:table-cell"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          BPM
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Status
                        </th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {catalogData.isLoading ? (
                        <>
                          <CatalogTrackLoadingRow />
                          <CatalogTrackLoadingRow />
                          <CatalogTrackLoadingRow />
                          <CatalogTrackLoadingRow />
                          <CatalogTrackLoadingRow />
                        </>
                      ) : catalogData.data?.tracks.length === 0 ? (
                        <CatalogEmptyState />
                      ) : (
                        catalogData.data?.tracks.map((track, index) => (
                          <CatalogTrackRow
                            key={`${track.id}-${track.lrclibId ?? index}`}
                            track={track}
                            index={index}
                            isExpanded={expandedId === track.id}
                            onToggle={() =>
                              setExpandedId(expandedId === track.id ? null : track.id)
                            }
                            renderExpandedContent={renderCatalogExpandedContent}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {catalogData.data && catalogData.data.total > 0 && (
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      Showing {offset + 1}-{Math.min(offset + LIMIT, catalogData.data.total)} of{" "}
                      {catalogData.data.total.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                        disabled={offset === 0}
                        className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: "var(--color-surface2)",
                          color: "var(--color-text3)",
                        }}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => setOffset(offset + LIMIT)}
                        disabled={!catalogData.data.hasMore}
                        className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: "var(--color-surface2)",
                          color: "var(--color-text3)",
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      </main>

      {/* Spotify Search Modal */}
      {spotifyModalTrack && (
        <SpotifySearchModal
          isOpen={spotifyModalTrack !== null}
          onClose={() => setSpotifyModalTrack(null)}
          lrclibId={spotifyModalTrack.lrclibId}
          title={spotifyModalTrack.title}
          artist={spotifyModalTrack.artist}
          onSelect={handleSpotifySelect}
        />
      )}
    </div>
  )
}
