"use client"

import { springs } from "@/animations"
import { EnrichmentActions } from "@/components/admin/EnrichmentActions"
import { SpotifySearchModal } from "@/components/admin/SpotifySearchModal"
import { TrackDetail } from "@/components/admin/TrackDetail"
import { type TracksFilter, TracksFilterBar } from "@/components/admin/TracksFilterBar"
import { type TrackWithEnrichment, TracksList } from "@/components/admin/TracksList"
import { useAccount, useIsAdmin } from "@/core"
import { makeCanonicalPath } from "@/lib/slug"
import { ArrowLeft, ArrowsDownUp, MagnifyingGlass, ShieldWarning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

// ============================================================================
// Types
// ============================================================================

interface TracksResponse {
  tracks: TrackWithEnrichment[]
  total: number
  offset: number
  hasMore: boolean
}

type SortType = "popular" | "alpha"

// ============================================================================
// Constants
// ============================================================================

const LIMIT = 50

// ============================================================================
// Header Component
// ============================================================================

function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/admin"
          className="flex items-center gap-2 transition-colors hover:brightness-125"
          style={{ color: "var(--color-text3)" }}
        >
          <ArrowLeft size={20} />
          <span>Admin</span>
        </Link>
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
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--color-surface1)" }}
          >
            <ShieldWarning size={32} style={{ color: "var(--color-text-muted)" }} />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="mb-6" style={{ color: "var(--color-text3)" }}>
            You don't have permission to view this page
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
// Main Component
// ============================================================================

export default function AdminTracksPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()

  // State
  const [tracks, setTracks] = useState<TrackWithEnrichment[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<TracksFilter>("all")
  const [sort, setSort] = useState<SortType>("popular")
  const [offset, setOffset] = useState(0)

  // Spotify search modal state
  const [spotifyModalTrack, setSpotifyModalTrack] = useState<TrackWithEnrichment | null>(null)

  // Fetch tracks from API
  const fetchTracks = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      if (filter !== "all") params.set("filter", filter)
      params.set("sort", sort)
      params.set("limit", LIMIT.toString())
      params.set("offset", offset.toString())

      const response = await fetch(`/api/admin/tracks?${params.toString()}`)
      if (response.ok) {
        const data = (await response.json()) as TracksResponse
        setTracks(data.tracks)
        setTotal(data.total)
        setHasMore(data.hasMore)
      }
    } catch {
      // Failed to fetch tracks
    } finally {
      setIsLoading(false)
    }
  }, [search, filter, sort, offset])

  // Fetch on mount and when dependencies change
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    fetchTracks()
  }, [isAuthenticated, isAdmin, fetchTracks])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [search, filter, sort])

  // Handle search submit
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        setOffset(0)
        fetchTracks()
      }
    },
    [fetchTracks],
  )

  // Action handlers
  const handleCopyFromTurso = useCallback(async (track: TrackWithEnrichment) => {
    const response = await fetch(`/api/admin/tracks/${track.lrclibId}/copy-enrichment`, {
      method: "POST",
    })
    if (!response.ok) {
      const data = (await response.json()) as { error?: string }
      throw new Error(data.error ?? "Failed to copy enrichment")
    }
  }, [])

  const handleFindSpotify = useCallback((track: TrackWithEnrichment) => {
    setSpotifyModalTrack(track)
  }, [])

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
    },
    [spotifyModalTrack],
  )

  const handleFetchBpm = useCallback(async (track: TrackWithEnrichment) => {
    const response = await fetch(`/api/admin/tracks/${track.lrclibId}/fetch-bpm`, {
      method: "POST",
    })
    if (!response.ok) {
      const data = (await response.json()) as { error?: string }
      throw new Error(data.error ?? "Failed to fetch BPM")
    }
  }, [])

  const handleManualBpm = useCallback((track: TrackWithEnrichment) => {
    // Navigate to song detail page for manual BPM entry
    if (track.neonSongId) {
      window.open(`/admin/songs/${track.neonSongId}`, "_blank")
    } else {
      // If not in catalog, show alert
      alert("Track must be in catalog first. Use 'Copy from Turso' or 'Find Spotify' to add it.")
    }
  }, [])

  const handleViewLyrics = useCallback((track: TrackWithEnrichment) => {
    const path = makeCanonicalPath({
      id: track.lrclibId,
      title: track.title,
      artist: track.artist,
    })
    window.open(path, "_blank")
  }, [])

  // Render expanded content
  const renderExpandedContent = useCallback(
    (track: TrackWithEnrichment) => (
      <TrackDetail
        track={track}
        renderActions={t => (
          <EnrichmentActions
            track={t}
            onCopyFromTurso={handleCopyFromTurso}
            onFindSpotify={handleFindSpotify}
            onFetchBpm={handleFetchBpm}
            onManualBpm={handleManualBpm}
            onViewLyrics={handleViewLyrics}
            onRefresh={fetchTracks}
          />
        )}
      />
    ),
    [
      handleCopyFromTurso,
      handleFindSpotify,
      handleFetchBpm,
      handleManualBpm,
      handleViewLyrics,
      fetchTracks,
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
      <Header />
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
              {total.toLocaleString()} track{total !== 1 ? "s" : ""} in LRCLIB database
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
                placeholder="Search tracks (FTS5)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none transition-colors"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <ArrowsDownUp
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--color-text-muted)" }}
              />
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortType)}
                className="appearance-none pl-10 pr-10 py-2.5 rounded-lg focus:outline-none transition-colors cursor-pointer"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="popular">Popular first</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </div>
          </motion.div>

          {/* Filter Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.default, delay: 0.15 }}
            className="mb-6"
          >
            <TracksFilterBar filter={filter} onFilterChange={setFilter} />
          </motion.div>

          {/* Tracks List */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...springs.default, delay: 0.2 }}
          >
            <TracksList
              tracks={tracks}
              total={total}
              offset={offset}
              limit={LIMIT}
              hasMore={hasMore}
              isLoading={isLoading}
              onPageChange={setOffset}
              onTrackSelect={() => {}}
              renderExpandedContent={renderExpandedContent}
            />
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
