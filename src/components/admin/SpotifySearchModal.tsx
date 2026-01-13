"use client"

import { springs } from "@/animations"
import { MagnifyingGlass, MusicNote, Spinner, SpotifyLogo, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

// ============================================================================
// Types
// ============================================================================

interface SpotifySearchResult {
  spotifyId: string
  name: string
  artist: string
  album: string
  albumArt: string | null
  durationMs: number
  popularity: number
}

export interface SpotifySearchModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly lrclibId: number
  readonly title: string
  readonly artist: string
  readonly onSelect: (spotifyId: string) => Promise<void>
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

// ============================================================================
// Component
// ============================================================================

export function SpotifySearchModal({
  isOpen,
  onClose,
  lrclibId,
  title,
  artist,
  onSelect,
}: SpotifySearchModalProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SpotifySearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pre-fill search with track info when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialQuery = `${title} ${artist}`.trim()
      setQuery(initialQuery)
      setResults([])
      setError(null)
      setSelectedId(null)
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, title, artist])

  const handleSearch = useCallback(async () => {
    if (!query.trim() || isSearching) return

    setIsSearching(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/admin/spotify/search?q=${encodeURIComponent(query.trim())}`,
      )
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limited. Please wait and try again.")
        }
        throw new Error("Search failed")
      }
      const data = (await response.json()) as { results: SpotifySearchResult[] }
      setResults(data.results)
      if (data.results.length === 0) {
        setError("No results found")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [query, isSearching])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch()
      }
    },
    [handleSearch],
  )

  const handleSelect = useCallback(
    async (spotifyId: string) => {
      if (isLinking) return

      setIsLinking(true)
      setSelectedId(spotifyId)
      setError(null)

      try {
        await onSelect(spotifyId)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link track")
        setSelectedId(null)
      } finally {
        setIsLinking(false)
      }
    },
    [isLinking, onSelect, onClose],
  )

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isLinking) {
        onClose()
      }
    },
    [onClose, isLinking],
  )

  const handleClose = useCallback(() => {
    if (!isLinking) {
      onClose()
    }
  }, [onClose, isLinking])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 p-4 flex items-start gap-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#1DB954" }}
              >
                <SpotifyLogo size={24} weight="fill" style={{ color: "#000" }} />
              </div>
              <div className="flex-1 min-w-0 pr-8">
                <h2 className="font-semibold truncate" style={{ color: "var(--color-text)" }}>
                  Find Spotify track
                </h2>
                <p className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>
                  {title} - {artist}
                </p>
                <p className="text-xs mt-1 tabular-nums" style={{ color: "var(--color-text3)" }}>
                  LRCLIB #{lrclibId}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isLinking}
                className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:brightness-110 disabled:opacity-50"
                style={{ color: "var(--color-text3)" }}
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            {/* Search Input */}
            <div
              className="flex-shrink-0 p-4"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlass
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--color-text3)" }}
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search Spotify..."
                    disabled={isLinking}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 disabled:opacity-50"
                    style={{
                      background: "var(--color-surface2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching || isLinking || !query.trim()}
                  className="px-4 py-2.5 rounded-lg font-medium transition-colors hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ background: "#1DB954", color: "#000" }}
                >
                  {isSearching ? (
                    <Spinner size={18} className="animate-spin" />
                  ) : (
                    <MagnifyingGlass size={18} />
                  )}
                  Search
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {error && !isSearching && (
                <div className="p-4 text-center">
                  <p style={{ color: "var(--color-error)" }}>{error}</p>
                </div>
              )}

              {!error && results.length === 0 && !isSearching && (
                <div className="p-8 flex flex-col items-center justify-center gap-3">
                  <MusicNote size={48} style={{ color: "var(--color-text3)" }} />
                  <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
                    Search for a track to link
                  </p>
                </div>
              )}

              {isSearching && (
                <div className="p-8 flex flex-col items-center justify-center gap-3">
                  <Spinner size={32} className="animate-spin" style={{ color: "#1DB954" }} />
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Searching Spotify...
                  </p>
                </div>
              )}

              {results.length > 0 && (
                <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {results.map((result, index) => (
                    <motion.button
                      key={result.spotifyId}
                      type="button"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springs.default, delay: index * 0.05 }}
                      onClick={() => handleSelect(result.spotifyId)}
                      disabled={isLinking}
                      className="w-full p-4 flex items-center gap-3 text-left transition-colors hover:brightness-95 disabled:opacity-50"
                      style={{
                        background:
                          selectedId === result.spotifyId ? "var(--color-surface2)" : "transparent",
                      }}
                    >
                      {/* Album Art */}
                      <div
                        className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden"
                        style={{ background: "var(--color-surface2)" }}
                      >
                        {result.albumArt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={result.albumArt}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <MusicNote size={24} style={{ color: "var(--color-text3)" }} />
                          </div>
                        )}
                      </div>

                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                          {result.name}
                        </p>
                        <p
                          className="text-sm truncate"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {result.artist}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--color-text3)" }}>
                          {result.album} · {formatDuration(result.durationMs)}
                        </p>
                      </div>

                      {/* Linking indicator */}
                      {selectedId === result.spotifyId && isLinking && (
                        <Spinner size={20} className="animate-spin" style={{ color: "#1DB954" }} />
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            {results.length > 0 && (
              <div
                className="flex-shrink-0 px-4 py-3 text-center text-xs"
                style={{
                  borderTop: "1px solid var(--color-border)",
                  color: "var(--color-text3)",
                }}
              >
                Click a track to link and fetch audio features from Spotify
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
