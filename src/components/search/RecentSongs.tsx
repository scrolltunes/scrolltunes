"use client"

import { SongListItem } from "@/components/ui"
import { recentSongsStore, useRecentSongsState } from "@/core"
import { MAX_RECENT_SONGS } from "@/lib/recent-songs-types"
import { ClockCounterClockwise, Trash } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface RecentSongsProps {
  readonly className?: string
}

export const RecentSongs = memo(function RecentSongs({ className = "" }: RecentSongsProps) {
  const { recents, loadingAlbumArtIds, isLoading, isInitialized, expectedCount } =
    useRecentSongsState()

  const skeletonCount =
    expectedCount !== null && expectedCount > 0 ? Math.min(expectedCount, MAX_RECENT_SONGS) : 0

  const handleClear = useCallback(() => {
    recentSongsStore.clear()
  }, [])

  const handleRemove = useCallback((songId: number, _albumArt: string | undefined) => {
    recentSongsStore.remove(songId)
  }, [])

  const showSkeleton = recents.length === 0 && isLoading

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 h-6">
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
        {recents.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
            aria-label="Clear history"
          >
            <Trash size={16} />
          </button>
        ) : showSkeleton ? (
          <div className="w-6 h-6 rounded bg-neutral-800 animate-pulse" />
        ) : null}
      </div>

      {showSkeleton ? (
        <ul className="space-y-2" aria-label="Loading recently played songs">
          {Array.from({ length: skeletonCount || 1 }, (_, i) => (
            <li key={i}>
              <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 animate-pulse">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="h-6 w-32 bg-neutral-800 rounded" />
                    <div className="h-4 w-24 bg-neutral-800 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-neutral-800" />
                  <div className="w-8 h-8 rounded-full bg-neutral-800" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : recents.length > 0 ? (
        <ul className="space-y-2" aria-label="Recently played songs">
          {recents.map(song => (
            <li key={song.id}>
              <SongListItem
                id={song.id}
                title={song.title}
                artist={song.artist}
                album={song.album}
                albumArt={song.albumArt}
                isLoadingAlbumArt={loadingAlbumArtIds.has(song.id)}
                showFavorite
                showRemove
                onRemove={handleRemove}
              />
            </li>
          ))}
        </ul>
      ) : isInitialized ? (
        <p className="text-sm text-neutral-500">No recently played songs</p>
      ) : null}
    </div>
  )
})
