"use client"

import { springs } from "@/animations"
import { MagnifyingGlass, MusicNote, SpinnerGap, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string
  readonly duration: number
}

export interface SongSearchProps {
  readonly onSelectTrack: (track: SearchResultTrack) => void
  readonly className?: string
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export const SongSearch = memo(function SongSearch({
  onSelectTrack,
  className = "",
}: SongSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResultTrack[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const searchTracks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setHasSearched(false)
      setError(null)
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

      const data = await response.json()
      setResults(data.tracks ?? [])
      setHasSearched(true)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      setError("Unable to search. Please try again")
      setResults([])
    } finally {
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

      debounceRef.current = setTimeout(() => {
        searchTracks(value)
      }, 300)
    },
    [searchTracks],
  )

  const handleClear = useCallback(() => {
    setQuery("")
    setResults([])
    setHasSearched(false)
    setError(null)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    abortControllerRef.current?.abort()
  }, [])

  const handleTrackClick = useCallback(
    (track: SearchResultTrack) => {
      onSelectTrack(track)
    },
    [onSelectTrack],
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
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">
          {isLoading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            >
              <SpinnerGap size={20} weight="bold" />
            </motion.div>
          ) : (
            <MagnifyingGlass size={20} weight="bold" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search for a song"
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

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={springs.default}
            className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center"
          >
            {error}
          </motion.div>
        )}

        {!error && hasSearched && results.length === 0 && !isLoading && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={springs.default}
            className="mt-3 p-6 text-neutral-500 text-center"
          >
            No results found
          </motion.div>
        )}

        {results.length > 0 && (
          <motion.ul
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.default}
            className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800"
            aria-label="Search results"
          >
            {results.map((track, index) => (
              <motion.li
                key={track.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springs.default, delay: index * 0.03 }}
              >
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
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
})
