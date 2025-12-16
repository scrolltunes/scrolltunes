"use client"

import { AlbumArtSkeleton, FavoriteButton } from "@/components/ui"
import { recentSongsStore, useRecentSongsState } from "@/core"
import { MAX_RECENT_SONGS } from "@/lib/recent-songs-types"
import { makeCanonicalPath } from "@/lib/slug"

import { ClockCounterClockwise, MusicNote, Trash, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useState } from "react"

export interface RecentSongsProps {
  readonly className?: string
}

export const RecentSongs = memo(function RecentSongs({ className = "" }: RecentSongsProps) {
  const { recents, loadingAlbumArtIds, isLoading, isInitialized, expectedCount } = useRecentSongsState()
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

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

  const handleRemove = useCallback((e: React.MouseEvent, songId: number) => {
    e.stopPropagation()
    recentSongsStore.remove(songId)
  }, [])

  // Show skeleton during hydration or loading when we have no items yet
  const isHydrating = recents.length === 0 && !isInitialized && !isLoading
  const showSkeleton = recents.length === 0 && (isHydrating || isLoading || !isMounted)
  const skeletonItems = skeletonCount > 0 ? skeletonCount : 1

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
          {Array.from({ length: skeletonItems }, (_, i) => (
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
          {recents.map(song => {
            const isLoadingAlbumArt = loadingAlbumArtIds.has(song.id)
            return (
              <li key={song.id}>
                <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors">
                  <button
                    type="button"
                    onClick={() => handleClick(song)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
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

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <FavoriteButton
                      songId={song.id}
                      title={song.title}
                      artist={song.artist}
                      {...(song.albumArt !== undefined && { albumArt: song.albumArt })}
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={e => handleRemove(e, song.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800/50 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                      aria-label="Remove from history"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : isInitialized ? (
        <p className="text-sm text-neutral-500">No recently played songs</p>
      ) : null}
    </div>
  )
})
