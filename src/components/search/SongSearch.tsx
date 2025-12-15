"use client"

import { springs } from "@/animations"
import type { SearchApiResponse, SearchResultTrack } from "@/lib/search-api-types"
import { extractLrclibId, makeCanonicalPath } from "@/lib/slug"
import {
  CircleNotch,
  MagnifyingGlass,
  MusicNote,
  MusicNoteSimple,
  TextAa,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useRef, useState } from "react"

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
      className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800"
      aria-label="Loading search results"
    >
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-800" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-3/5 rounded bg-neutral-800" />
            <div className="h-3 w-4/5 rounded bg-neutral-800" />
          </div>
          <div className="flex-shrink-0 h-4 w-10 rounded bg-neutral-800" />
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
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResultTrack[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, setIsPending] = useState(false) // True immediately on typing
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const searchTracks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setHasSearched(false)
      setError(null)
      setIsPending(false)
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
      // Batch these updates together to avoid skeleton flicker
      setResults(data.tracks ?? [])
      setHasSearched(true)
      setIsPending(false)
      setIsLoading(false)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      setError("Unable to search. Please try again")
      setResults([])
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

      // Show skeleton immediately on typing
      if (value.trim()) {
        setIsPending(true)
        setHasSearched(false)
        setError(null)
      } else {
        // Cancel any in-flight request when text is cleared
        abortControllerRef.current?.abort()
        setIsPending(false)
        setResults([])
        setHasSearched(false)
      }

      debounceRef.current = setTimeout(() => {
        searchTracks(value)
      }, 150)
    },
    [searchTracks],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setResults([])
    setHasSearched(false)
    setError(null)
    setIsPending(false)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    abortControllerRef.current?.abort()
  }, [])

  const handleTrackClick = useCallback(
    (track: SearchResultTrack) => {
      const numericId = extractLrclibId(track.id)
      if (numericId === null) {
        onSelectTrack?.(track)
        return
      }
      const canonicalPath = makeCanonicalPath({
        id: numericId,
        title: track.name,
        artist: track.artist,
      })
      router.push(canonicalPath)
    },
    [router, onSelectTrack],
  )

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
      {/* Search input - fixed position at top */}
      <div className="relative z-10">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
          {isLoading ? (
            <CircleNotch size={20} weight="bold" className="text-indigo-500 animate-spin" />
          ) : (
            <MagnifyingGlass size={20} weight="bold" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search by song title or artist name"
          className="w-full bg-neutral-900 text-white placeholder-neutral-500 rounded-xl py-3 pl-12 pr-10 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
          aria-label="Search for a song"
        />

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
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={springs.default}
            className="mt-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-col items-center gap-3"
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
          <div className="mt-3 p-8 flex flex-col items-center gap-3 text-center">
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
          className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800"
          aria-label="Search results"
        >
          {results.map(track => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => handleTrackClick(track)}
                className="w-full flex items-center gap-3 p-3 hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                aria-label={`${track.name} by ${track.artist}`}
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-800 overflow-hidden flex items-center justify-center">
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
                  <p className="text-white font-medium truncate">{track.name}</p>
                  <p className="text-sm text-neutral-500 truncate">
                    {track.artist} • {track.album}
                  </p>
                </div>

                <span className="flex-shrink-0 text-sm text-neutral-600 tabular-nums">
                  {formatDuration(track.duration)}
                </span>

                {track.hasLyrics && (
                  <span
                    className="flex-shrink-0 ml-2 px-1.5 py-0.5 text-xs font-medium text-green-400 bg-green-400/10 rounded"
                    title="Synced lyrics available"
                  >
                    <TextAa size={14} weight="bold" className="inline" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
