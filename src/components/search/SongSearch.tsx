"use client"

import { springs } from "@/animations"
import { ListeningWaveform, StreamingText, VoiceSearchButton } from "@/components/audio"
import { INPUT_LIMITS } from "@/constants/limits"
import { favoritesStore, recentSongsStore, useIsAuthenticated } from "@/core"
import { useLocalSongCache, useVoiceSearch } from "@/hooks"
import { normalizeTrackKey } from "@/lib/bpm"
import { fuzzyMatchSongs } from "@/lib/fuzzy-search"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import type { SearchApiResponse, SearchResultTrack } from "@/lib/search-api-types"
import { makeCanonicalPath } from "@/lib/slug"
import { runRefreshMissingAlbums } from "@/services/lyrics-prefetch"
import {
  CircleNotch,
  MagnifyingGlass,
  MusicNote,
  MusicNoteSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

interface VerifyResponse {
  readonly found: boolean
  readonly lrclibId?: number
  readonly trackName?: string
  readonly artistName?: string
}

interface NormalizedSearchResult extends SearchResultTrack {
  readonly displayName: string
  readonly displayArtist: string
  readonly displayAlbum: string
}

function deduplicateTracks(tracks: SearchResultTrack[]): NormalizedSearchResult[] {
  const seen = new Map<string, NormalizedSearchResult>()

  for (const track of tracks) {
    const normalized = normalizeTrackKey({ title: track.name, artist: track.artist })
    const key = `${normalized.artist}:${normalized.title}`

    if (!seen.has(key)) {
      seen.set(key, {
        ...track,
        displayName: normalizeTrackName(track.name),
        displayArtist: normalizeArtistName(track.artist),
        displayAlbum: track.album ? normalizeAlbumName(track.album) : "",
      })
    }
  }

  return Array.from(seen.values())
}

export interface SongSearchProps {
  readonly onSelectTrack?: (track: SearchResultTrack) => void
  readonly className?: string
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function SearchSkeleton() {
  return (
    <div
      className="absolute top-full left-0 right-0 z-50 mt-3 rounded-xl shadow-2xl"
      style={{
        background: "var(--color-surface1)",
        border: "1px solid var(--color-border)",
      }}
      aria-label="Loading search results"
    >
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 animate-pulse"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="flex-shrink-0 w-12 h-12 rounded-lg"
            style={{ background: "var(--color-surface2)" }}
          />
          <div className="flex-1 min-w-0 space-y-2">
            <div
              className="h-4 w-3/5 rounded"
              style={{ background: "var(--color-surface2)" }}
            />
            <div
              className="h-3 w-4/5 rounded"
              style={{ background: "var(--color-surface2)" }}
            />
          </div>
          <div
            className="flex-shrink-0 h-4 w-10 rounded"
            style={{ background: "var(--color-surface2)" }}
          />
        </div>
      ))}
    </div>
  )
}

export const SongSearch = memo(function SongSearch({
  onSelectTrack,
  className = "",
}: SongSearchProps) {
  const router = useRouter()
  const isAuthenticated = useIsAuthenticated()
  const voiceSearch = useVoiceSearch()
  const localSongCache = useLocalSongCache()
  const [query, setQuery] = useState("")
  const [apiResults, setApiResults] = useState<NormalizedSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, setIsPending] = useState(false) // True immediately on typing
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [_verifyingTrackId, setVerifyingTrackId] = useState<string | null>(null)
  const [_inlineMessage, setInlineMessage] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cacheRef = useRef(new Map<string, NormalizedSearchResult[]>())
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFinalTranscriptRef = useRef<string | null>(null)
  const queryRef = useRef(query)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const localMatches = useMemo((): Array<NormalizedSearchResult & { score: number }> => {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 2) return []

    const seenKeys = new Set<string>()
    const seenLrclibIds = new Set<number>()
    const dedupedMatches: Array<NormalizedSearchResult & { score: number }> = []

    const cacheMatches = fuzzyMatchSongs(trimmed, localSongCache, 0.7)

    for (const match of cacheMatches) {
      const normalized = normalizeTrackKey({ title: match.item.title, artist: match.item.artist })
      const key = `${normalized.artist}:${normalized.title}`

      if (seenKeys.has(key) || seenLrclibIds.has(match.item.id)) continue
      seenKeys.add(key)
      seenLrclibIds.add(match.item.id)

      dedupedMatches.push({
        id: `lrclib-${match.item.id}`,
        name: match.item.title,
        artist: match.item.artist,
        album: match.item.album ?? "",
        albumArt: match.item.albumArt,
        duration: match.item.durationMs,
        hasLyrics: true,
        lrclibId: match.item.id,
        displayName: normalizeTrackName(match.item.title),
        displayArtist: normalizeArtistName(match.item.artist),
        displayAlbum: match.item.album ? normalizeAlbumName(match.item.album) : "",
        score: match.score,
      })
    }

    dedupedMatches.sort((a, b) => b.score - a.score)

    return dedupedMatches.slice(0, 10)
  }, [query, localSongCache])

  const results = useMemo((): NormalizedSearchResult[] => {
    if (localMatches.length === 0) return apiResults

    // Build maps of API results by lrclibId and title+artist for enrichment
    const apiResultsByLrclibId = new Map(
      apiResults.filter(r => r.lrclibId).map(r => [r.lrclibId, r]),
    )
    const apiResultsByTitleArtist = new Map<string, NormalizedSearchResult>(
      apiResults.map(r => {
        const normalized = normalizeTrackKey({ title: r.name, artist: r.artist })
        return [`${normalized.artist}:${normalized.title}`, r]
      }),
    )

    // Enrich local matches with API data when available
    // Try matching by lrclibId first, then fall back to title+artist
    const enrichedLocalMatches = localMatches.map(local => {
      // Try lrclibId match first
      let apiMatch = local.lrclibId ? apiResultsByLrclibId.get(local.lrclibId) : undefined

      // Fall back to title+artist match for different versions
      if (!apiMatch) {
        const normalized = normalizeTrackKey({ title: local.name, artist: local.artist })
        const key = `${normalized.artist}:${normalized.title}`
        apiMatch = apiResultsByTitleArtist.get(key)
      }

      // Use API data for display (proper casing, album art) but keep local score
      if (apiMatch) {
        return {
          ...local,
          name: apiMatch.name,
          artist: apiMatch.artist,
          album: apiMatch.album,
          displayName: apiMatch.displayName,
          displayArtist: apiMatch.displayArtist,
          displayAlbum: apiMatch.displayAlbum,
          albumArt: apiMatch.albumArt ?? local.albumArt,
        }
      }
      return local
    })

    // Use both lrclibId AND title+artist for deduplication
    const localLrclibIds = new Set(enrichedLocalMatches.map(m => m.lrclibId).filter(Boolean))
    const localTitleArtistKeys = new Set(
      enrichedLocalMatches.map(m => {
        const normalized = normalizeTrackKey({ title: m.name, artist: m.artist })
        return `${normalized.artist}:${normalized.title}`
      }),
    )
    const filteredApiResults = apiResults.filter(r => {
      // Exclude if same lrclibId
      if (r.lrclibId && localLrclibIds.has(r.lrclibId)) return false
      // Exclude if same title+artist (different version/duration)
      const normalized = normalizeTrackKey({ title: r.name, artist: r.artist })
      const key = `${normalized.artist}:${normalized.title}`
      if (localTitleArtistKeys.has(key)) return false
      return true
    })

    // Keep all local matches at top (sorted by score), then append API-only results below
    // This ensures initial results remain stable when API results arrive
    return [...enrichedLocalMatches, ...filteredApiResults]
  }, [localMatches, apiResults])

  // Persist enriched album info to stores when API results provide missing data
  // Also trigger background refresh for local matches still missing album after enrichment
  useEffect(() => {
    if (localMatches.length === 0) return

    const apiResultsByLrclibId = new Map(
      apiResults.filter(r => r.lrclibId).map(r => [r.lrclibId, r]),
    )
    const stillMissingAlbum: Array<{ id: number; album: string | undefined }> = []

    for (const local of localMatches) {
      if (!local.lrclibId) continue

      const apiMatch = apiResultsByLrclibId.get(local.lrclibId)
      if (apiMatch && !local.album && apiMatch.album) {
        // Only include defined values to satisfy exactOptionalPropertyTypes
        const updates: { album?: string; albumArt?: string } = {
          album: apiMatch.album,
        }
        if (apiMatch.albumArt) {
          updates.albumArt = apiMatch.albumArt
        }
        // Update both stores - they'll no-op if song isn't in that store
        favoritesStore.updateMetadata(local.lrclibId, updates)
        recentSongsStore.updateAlbumInfo(local.lrclibId, updates)
      } else if (!local.album) {
        // Local match without album - trigger refresh (whether or not API matched)
        stillMissingAlbum.push({ id: local.lrclibId, album: undefined })
      }
    }

    // Background refresh for songs still missing album info
    if (stillMissingAlbum.length > 0) {
      runRefreshMissingAlbums(stillMissingAlbum)
    }
  }, [localMatches, apiResults])

  const searchTracks = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim()

    if (!trimmed) {
      setApiResults([])
      setHasSearched(false)
      setError(null)
      setIsPending(false)
      return
    }

    if (trimmed.length < 2) {
      setApiResults([])
      setHasSearched(false)
      setIsPending(false)
      return
    }

    const cacheKey = trimmed.toLowerCase()
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setApiResults(cached)
      setHasSearched(true)
      setIsPending(false)
      setIsLoading(false)
      return
    }

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=10`, {
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error("Search failed")
      }

      const data: SearchApiResponse = await response.json()
      const tracks = deduplicateTracks(data.tracks ?? [])
      cacheRef.current.set(cacheKey, tracks)
      setApiResults(tracks)
      setHasSearched(true)
      setIsPending(false)
      setIsLoading(false)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      setError("Unable to search. Please try again")
      setApiResults([])
      setIsPending(false)
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      // Show skeleton immediately on typing (only if no local matches)
      if (value.trim()) {
        setIsPending(true)
        setHasSearched(false)
        setError(null)
      } else {
        // Cancel any in-flight request when text is cleared
        abortControllerRef.current?.abort()
        setIsPending(false)
        setIsLoading(false)
        setApiResults([])
        setHasSearched(false)
      }

      debounceRef.current = setTimeout(() => {
        searchTracks(value)
      }, 250)
    },
    [searchTracks],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setApiResults([])
    setHasSearched(false)
    setError(null)
    setIsPending(false)
    setIsLoading(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    abortControllerRef.current?.abort()
    if (voiceSearch.isRecording) {
      voiceSearch.stop()
    }
    lastFinalTranscriptRef.current = null
  }, [voiceSearch])

  const showInlineMessage = useCallback((message: string) => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
    }
    setInlineMessage(message)
    messageTimeoutRef.current = setTimeout(() => {
      setInlineMessage(null)
    }, 4000)
  }, [])

  const handleTrackClick = useCallback(
    async (track: SearchResultTrack) => {
      if (track.id.startsWith("spotify-")) {
        if (!track.spotifyId) {
          onSelectTrack?.(track)
          return
        }

        setVerifyingTrackId(track.id)
        setInlineMessage(null)

        try {
          const response = await fetch(
            `/api/search/verify?title=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`,
          )

          if (!response.ok) {
            throw new Error("Verification failed")
          }

          const data: VerifyResponse = await response.json()

          if (data.found && data.lrclibId !== undefined) {
            const canonicalPath = makeCanonicalPath({
              id: data.lrclibId,
              title: data.trackName ?? track.name,
              artist: data.artistName ?? track.artist,
            })
            router.push(`${canonicalPath}?spotifyId=${track.spotifyId}`)
          } else {
            showInlineMessage("No synced lyrics available for this song")
          }
        } catch {
          showInlineMessage("Unable to verify lyrics. Please try again")
        } finally {
          setVerifyingTrackId(null)
        }
        return
      }

      if (track.id.startsWith("lrclib-")) {
        const numericId = Number(track.id.replace("lrclib-", ""))
        if (!Number.isNaN(numericId)) {
          const canonicalPath = makeCanonicalPath({
            id: numericId,
            title: track.name,
            artist: track.artist,
          })
          const url = track.spotifyId
            ? `${canonicalPath}?spotifyId=${track.spotifyId}`
            : canonicalPath
          router.push(url)
          return
        }
      }

      onSelectTrack?.(track)
    },
    [router, onSelectTrack, showInlineMessage],
  )

  const handleVoiceSearchClick = useCallback(() => {
    if (voiceSearch.isRecording) {
      voiceSearch.stop()
    } else {
      // Clear existing query and any previous error before starting
      setQuery("")
      setApiResults([])
      setError(null)
      if (voiceSearch.error) {
        voiceSearch.clearError()
      }
      voiceSearch.start()
    }
  }, [voiceSearch])

  // Keep queryRef in sync with query state
  useEffect(() => {
    queryRef.current = query
  }, [query])

  // Track streaming text for visual feedback using a ref to avoid batching issues
  // The ref accumulates partials immediately, state is updated for rendering
  const streamingTextAccumulatorRef = useRef<string | null>(null)

  useEffect(() => {
    if (voiceSearch.partialTranscript) {
      // Immediately capture the partial in the ref
      streamingTextAccumulatorRef.current = voiceSearch.partialTranscript
      // Clear any pending clear timeout
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = null
      }
      // Update state for rendering
      setStreamingText(voiceSearch.partialTranscript)
    }
  }, [voiceSearch.partialTranscript])

  // Track previous isRecording state to detect transitions
  const wasRecordingRef = useRef(false)

  // When recording stops, show the last captured partial briefly
  useEffect(() => {
    const wasRecording = wasRecordingRef.current
    wasRecordingRef.current = voiceSearch.isRecording

    // Only trigger on transition from recording to not recording
    if (wasRecording && !voiceSearch.isRecording && streamingTextAccumulatorRef.current) {
      // Use the final transcript if available, otherwise use the last partial
      const textToShow = voiceSearch.finalTranscript || streamingTextAccumulatorRef.current
      // Ensure the text is shown with animation
      setStreamingText(textToShow)
      // Clear after a delay
      streamingTimeoutRef.current = setTimeout(() => {
        setStreamingText(null)
        streamingTextAccumulatorRef.current = null
        streamingTimeoutRef.current = null
      }, 600)
    }

    // Clear streaming text when recording starts fresh
    if (!wasRecording && voiceSearch.isRecording) {
      streamingTextAccumulatorRef.current = null
      setStreamingText(null)
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
        streamingTimeoutRef.current = null
      }
    }
  }, [voiceSearch.isRecording, voiceSearch.finalTranscript])

  useEffect(() => {
    if (
      voiceSearch.finalTranscript &&
      voiceSearch.finalTranscript !== lastFinalTranscriptRef.current
    ) {
      lastFinalTranscriptRef.current = voiceSearch.finalTranscript
      const transcript = voiceSearch.finalTranscript
      const currentQuery = queryRef.current.trim().toLowerCase()
      const newQuery = transcript.trim().toLowerCase()

      setQuery(transcript)
      voiceSearch.clearTranscript()

      // Don't clear streaming text here - let the isRecording effect handle it
      // This ensures the last partial is visible briefly before showing results

      // Skip search if final transcript matches current query (from partial results)
      if (currentQuery === newQuery) {
        return
      }

      setIsPending(true)
      setHasSearched(false)
      setError(null)
      searchTracks(transcript)
    }
  }, [voiceSearch.finalTranscript, voiceSearch.clearTranscript, searchTracks])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  return (
    <div className={`w-full ${className}`}>
      {/* Search input and results dropdown container */}
      <div className="relative">
        {/* Search input */}
        <div className="relative z-10">
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-muted)" }}
          >
            {voiceSearch.isRecording || voiceSearch.isProcessing || streamingText ? (
              <ListeningWaveform variant={voiceSearch.isProcessing ? "processing" : "listening"} />
            ) : isLoading ? (
              <CircleNotch
                size={20}
                weight="bold"
                className="animate-spin"
                style={{ color: "var(--color-accent)" }}
              />
            ) : (
              <MagnifyingGlass size={20} weight="bold" />
            )}
          </div>

          {/* Status overlay when recording, processing, or showing streaming text */}
          {(voiceSearch.isRecording || voiceSearch.isProcessing || streamingText) && (
            <div
              className="absolute left-12 top-1/2 -translate-y-1/2 right-20 pointer-events-none overflow-hidden z-20"
              style={{ background: "var(--color-surface1)" }}
            >
              {voiceSearch.isProcessing ? (
                <span
                  className="truncate block"
                  style={{ color: "var(--color-success)" }}
                >
                  Processing...
                </span>
              ) : streamingText ? (
                <StreamingText
                  text={streamingText}
                  className="truncate block"
                  style={{ color: "var(--color-accent)" }}
                />
              ) : (
                <span
                  className="truncate block"
                  style={{ color: "var(--color-accent)" }}
                >
                  Listening...
                </span>
              )}
            </div>
          )}

          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder={
              voiceSearch.isRecording || voiceSearch.isProcessing || streamingText
                ? ""
                : "Search by song title or artist name"
            }
            maxLength={INPUT_LIMITS.SEARCH_QUERY}
            className={`w-full rounded-xl py-3 pl-12 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent ${
              voiceSearch.isProcessing
                ? "text-transparent caret-transparent"
                : voiceSearch.isRecording || streamingText
                  ? "text-transparent caret-transparent"
                  : ""
            } ${isAuthenticated ? (query ? "pr-20" : "pr-12") : "pr-10"}`}
            style={{
              background: "var(--color-surface1)",
              color: "var(--color-text)",
              borderColor: voiceSearch.isProcessing
                ? "var(--color-success)"
                : voiceSearch.isRecording || streamingText
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              ...(voiceSearch.isProcessing && {
                boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.3)",
              }),
              ...((voiceSearch.isRecording || streamingText) && {
                boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.3)",
              }),
            }}
            aria-label="Search for a song"
          />

          {isAuthenticated && voiceSearch.isQuotaAvailable && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    onClick={handleClear}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={springs.snap}
                    className="p-1 rounded-full transition-colors focus:outline-none focus-visible:ring-2"
                    style={{
                      color: "var(--color-text-muted)",
                    }}
                    aria-label="Clear search"
                  >
                    <X size={16} weight="bold" />
                  </motion.button>
                )}
              </AnimatePresence>
              <VoiceSearchButton
                onClick={handleVoiceSearchClick}
                isRecording={voiceSearch.isRecording}
                isConnecting={voiceSearch.isConnecting}
                hasError={!!voiceSearch.error}
              />
            </div>
          )}

          {(!isAuthenticated || !voiceSearch.isQuotaAvailable) && (
            <AnimatePresence>
              {query && (
                <motion.button
                  type="button"
                  onClick={handleClear}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={springs.snap}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors focus:outline-none focus-visible:ring-2"
                  style={{
                    color: "var(--color-text-muted)",
                  }}
                  aria-label="Clear search"
                >
                  <X size={16} weight="bold" />
                </motion.button>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Floating dropdown for results, error, empty, and loading states */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={springs.default}
              className="absolute top-full left-0 right-0 z-50 mt-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-col items-center gap-3 shadow-2xl backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 text-red-400">
                <WarningCircle size={20} weight="fill" />
                <span className="text-sm">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => searchTracks(query)}
                className="px-4 py-1.5 text-sm font-medium text-white bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                Try again
              </button>
            </motion.div>
          )}

          {!error && hasSearched && results.length === 0 && !isPending && (
            <div
              className="absolute top-full left-0 right-0 z-50 mt-3 p-8 flex flex-col items-center gap-3 text-center rounded-xl shadow-2xl"
              style={{
                background: "var(--color-surface1)",
                border: "1px solid var(--color-border)",
              }}
            >
              <MusicNoteSimple
                size={32}
                weight="duotone"
                style={{ color: "var(--color-text-muted)" }}
              />
              <div>
                <p style={{ color: "var(--color-text3)" }}>No songs found for "{query}"</p>
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Try a different spelling or search for the artist name
                </p>
              </div>
            </div>
          )}
        </AnimatePresence>

        {!error && isPending && results.length === 0 && query && <SearchSkeleton />}

        {!error && results.length > 0 && (
          <ul
            className="absolute top-full left-0 right-0 z-50 mt-3 max-h-80 overflow-y-auto rounded-xl shadow-2xl"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Search results"
          >
            {results.map((track, index) => (
              <li
                key={track.id}
                style={index > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => handleTrackClick(track)}
                  className="w-full flex items-center gap-3 p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset hover:brightness-110"
                  style={{ background: "var(--color-surface1)" }}
                  aria-label={`${track.name} by ${track.artist}`}
                >
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ background: "var(--color-surface2)" }}
                  >
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.album}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <MusicNote
                        size={24}
                        weight="fill"
                        style={{ color: "var(--color-text-muted)" }}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {track.displayName}
                    </p>
                    <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
                      {track.displayArtist}
                      {track.displayAlbum && track.displayAlbum !== "-"
                        ? ` • ${track.displayAlbum}`
                        : ""}
                    </p>
                  </div>

                  {track.duration > 0 && (
                    <span
                      className="flex-shrink-0 text-sm tabular-nums"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {formatDuration(track.duration)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
})
