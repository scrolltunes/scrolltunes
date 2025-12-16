"use client"

import { AlbumArtSkeleton } from "@/components/ui"
import {
  recentSongsStore,
  useAlbumArtLoadingIds,
  useExpectedRecentsCount,
  useIsRecentsInitialized,
  useIsRecentsLoading,
  useRecentSongs,
} from "@/core"
import { MAX_RECENT_SONGS } from "@/lib/recent-songs-types"
import { makeCanonicalPath } from "@/lib/slug"
import { ClockCounterClockwise, MusicNote, Trash } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import { memo, useCallback } from "react"

export interface RecentSongsProps {
  readonly className?: string
}

export const RecentSongs = memo(function RecentSongs({ className = "" }: RecentSongsProps) {
  const recents = useRecentSongs()
  const loadingAlbumArtIds = useAlbumArtLoadingIds()
  const isLoading = useIsRecentsLoading()
  const isInitialized = useIsRecentsInitialized()
  const expectedCount = useExpectedRecentsCount()
  const router = useRouter()

  const skeletonCount = expectedCount !== null && expectedCount > 0 ? Math.min(expectedCount, MAX_RECENT_SONGS) : 0

  const handleClick = useCallback(
    (song: { id: number; title: string; artist: string }) => {
      const path = makeCanonicalPath({ id: song.id, title: song.title, artist: song.artist })
      router.push(path)
    },
    [router],
  )

  const handleClear = useCallback(() => {
    recentSongsStore.clear()
  }, [])

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-neutral-400">
          {isLoading ? (
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            >
              <ClockCounterClockwise size={16} weight="bold" />
            </motion.div>
          ) : (
            <ClockCounterClockwise size={16} weight="bold" />
          )}
          <span className="text-sm font-medium">Recently played</span>
        </div>
        {recents.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
            aria-label="Clear history"
          >
            <Trash size={16} />
          </button>
        )}
      </div>

      {recents.length > 0 ? (
        <ul className="space-y-2" aria-label="Recently played songs">
          {recents.map(song => {
            const isLoadingAlbumArt = loadingAlbumArtIds.has(song.id)
            return (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => handleClick(song)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors text-left"
                  aria-label={`${song.title} by ${song.artist}`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
                    {isLoadingAlbumArt ? (
                      <AlbumArtSkeleton />
                    ) : song.albumArt ? (
                      <img src={song.albumArt} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <MusicNote size={20} weight="fill" className="text-neutral-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{song.title}</p>
                    <p className="text-sm text-neutral-500 truncate">{song.artist}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : !isInitialized ? (
        // Still initializing - show nothing until we know the count
        null
      ) : isLoading && skeletonCount > 0 ? (
        <ul className="space-y-2" aria-label="Loading recently played songs">
          {Array.from({ length: skeletonCount }, (_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900 animate-pulse"
            >
              <div className="w-10 h-10 rounded-lg bg-neutral-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-neutral-800 rounded" />
                <div className="h-3 w-24 bg-neutral-800 rounded" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">No recently played songs</p>
      )}
    </div>
  )
})
