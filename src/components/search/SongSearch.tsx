"use client"

import { springs } from "@/animations"
import { ListeningWaveform, StreamingText, VoiceSearchButton } from "@/components/audio"
import { INPUT_LIMITS } from "@/constants/limits"
import { useIsAuthenticated } from "@/core"
import { useLocalSongCache, useVoiceSearch } from "@/hooks"
import { normalizeTrackKey } from "@/lib/bpm"
import { fuzzyMatchSongs } from "@/lib/fuzzy-search"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import type { SearchApiResponse, SearchResultTrack } from "@/lib/search-api-types"
import { makeCanonicalPath } from "@/lib/slug"
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
      className="absolute top-full left-0 right-0 z-50 mt-3 rounded-xl border border-neutral-700 bg-neutral-800 divide-y divide-neutral-700 shadow-2xl"
      aria-label="Loading search results"
    >
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-700" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-3/5 rounded bg-neutral-700" />
            <div className="h-3 w-4/5 rounded bg-neutral-700" />
          </div>
          <div className="flex-shrink-0 h-4 w-10 rounded bg-neutral-700" />
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

    const matches = fuzzyMatchSongs(trimmed, localSongCache, 0.7)

    return matches.slice(0, 5).map(match => ({
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
    }))
  }, [query, localSongCache])

  const results = useMemo((): NormalizedSearchResult[] => {
    if (localMatches.length === 0) return apiResults

    const localIds = new Set(localMatches.map(m => m.id))
    const filteredApiResults = apiResults.filter(r => !localIds.has(r.id))

    const highConfidenceLocals = localMatches.filter(m => m.score >= 0.85)
    const lowerConfidenceLocals = localMatches.filter(m => m.score < 0.85)

    return [...highConfidenceLocals, ...filteredApiResults, ...lowerConfidenceLocals]
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
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
            {voiceSearch.isRecording || voiceSearch.isProcessing || streamingText ? (
              <ListeningWaveform variant={voiceSearch.isProcessing ? "processing" : "listening"} />
            ) : isLoading ? (
              <CircleNotch size={20} weight="bold" className="text-indigo-500 animate-spin" />
            ) : (
              <MagnifyingGlass size={20} weight="bold" />
            )}
          </div>

          {/* Status overlay when recording, processing, or showing streaming text */}
          {(voiceSearch.isRecording || voiceSearch.isProcessing || streamingText) && (
            <div className="absolute left-12 top-1/2 -translate-y-1/2 right-20 pointer-events-none overflow-hidden z-20 bg-neutral-900">
              {voiceSearch.isProcessing ? (
                <span className="truncate block text-emerald-400">Processing...</span>
              ) : streamingText ? (
                <StreamingText text={streamingText} className="truncate block text-indigo-400" />
              ) : (
                <span className="truncate block text-indigo-400">Listening...</span>
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
            className={`w-full bg-neutral-900 text-white placeholder-neutral-500 rounded-xl py-3 pl-12 border transition-colors ${
              voiceSearch.isProcessing
                ? "border-emerald-500 ring-2 ring-emerald-500/20 text-transparent caret-transparent"
                : voiceSearch.isRecording || streamingText
                  ? "border-indigo-500 ring-2 ring-indigo-500/20 text-transparent caret-transparent"
                  : "border-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            } ${isAuthenticated ? (query ? "pr-20" : "pr-12") : "pr-10"}`}
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
                    className="p-1 text-neutral-500 hover:text-neutral-300 rounded-full hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-300 rounded-full hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
            <div className="absolute top-full left-0 right-0 z-50 mt-3 p-8 flex flex-col items-center gap-3 text-center bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl">
              <MusicNoteSimple size={32} weight="duotone" className="text-neutral-600" />
              <div>
                <p className="text-neutral-400">No songs found for "{query}"</p>
                <p className="text-sm text-neutral-600 mt-1">
                  Try a different spelling or search for the artist name
                </p>
              </div>
            </div>
          )}
        </AnimatePresence>

        {!error && isPending && results.length === 0 && query && <SearchSkeleton />}

        {!error && results.length > 0 && (
          <ul
            className="absolute top-full left-0 right-0 z-50 mt-3 max-h-80 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-800 divide-y divide-neutral-700 shadow-2xl"
            aria-label="Search results"
          >
            {results.map(track => (
              <li key={track.id}>
                <button
                  type="button"
                  onClick={() => handleTrackClick(track)}
                  className="w-full flex items-center gap-3 p-3 bg-neutral-800 hover:bg-neutral-700 transition-colors focus:outline-none focus-visible:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  aria-label={`${track.name} by ${track.artist}`}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-700 overflow-hidden flex items-center justify-center">
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.album}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <MusicNote size={24} weight="fill" className="text-neutral-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white font-medium truncate">{track.displayName}</p>
                    <p className="text-sm text-neutral-500 truncate">
                      {track.displayArtist}
                      {track.displayAlbum && track.displayAlbum !== "-"
                        ? ` • ${track.displayAlbum}`
                        : ""}
                    </p>
                  </div>

                  {track.duration > 0 && (
                    <span className="flex-shrink-0 text-sm text-neutral-600 tabular-nums">
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
