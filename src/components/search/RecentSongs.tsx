"use client"

import { recentSongsStore, useRecentSongsState } from "@/core"
import { makeCanonicalPath } from "@/lib/slug"
import { ClockCounterClockwise, MusicNote, Trash } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { memo, useCallback, useRef, useState } from "react"

export interface RecentSongsProps {
  readonly className?: string
  readonly layout?: "horizontal" | "vertical"
}

export const RecentSongs = memo(function RecentSongs({
  className = "",
  layout = "horizontal",
}: RecentSongsProps) {
  const { recents, isLoading, isInitialized, expectedCount } = useRecentSongsState()

  const skeletonCount = expectedCount !== null && expectedCount > 0 ? Math.min(expectedCount, 6) : 4

  const handleClear = useCallback(() => {
    recentSongsStore.clear()
  }, [])

  const showSkeleton = recents.length === 0 && isLoading

  // Limit items based on layout
  const displayRecents = layout === "horizontal" ? recents.slice(0, 20) : recents.slice(0, 5)

  // Drag-to-scroll functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const dragThreshold = 5
  const dragDistanceRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = scrollContainerRef.current
    if (!container) return

    setIsDragging(true)
    setStartX(e.clientX)
    setScrollLeft(container.scrollLeft)
    dragDistanceRef.current = 0
    container.style.cursor = "grabbing"
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const container = scrollContainerRef.current
      if (!container) return

      e.preventDefault()
      const walk = e.clientX - startX
      dragDistanceRef.current = Math.abs(walk)
      container.scrollLeft = scrollLeft - walk
    },
    [isDragging, startX, scrollLeft],
  )

  const handleMouseUp = useCallback(() => {
    const container = scrollContainerRef.current
    if (container) {
      container.style.cursor = "grab"
    }
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      const container = scrollContainerRef.current
      if (container) {
        container.style.cursor = "grab"
      }
      setIsDragging(false)
    }
  }, [isDragging])

  // Prevent click if we dragged
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragDistanceRef.current > dragThreshold) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 h-6">
        <div className="flex items-center gap-2" style={{ color: "var(--color-text3)" }}>
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
          <span className="text-sm font-medium uppercase tracking-wider">Recently played</span>
        </div>
        {recents.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className="transition-colors p-1 hover:brightness-125"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Clear history"
          >
            <Trash size={16} />
          </button>
        ) : showSkeleton ? (
          <div
            className="w-6 h-6 rounded animate-pulse"
            style={{ background: "var(--color-surface2)" }}
          />
        ) : null}
      </div>

      {showSkeleton ? (
        layout === "horizontal" ? (
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4"
            aria-label="Loading recently played songs"
          >
            {Array.from({ length: skeletonCount }, (_, i) => (
              <div key={i} className="flex-shrink-0 w-24">
                <div
                  className="w-24 h-24 rounded-xl animate-pulse"
                  style={{ background: "var(--color-surface1)" }}
                />
                <div
                  className="mt-2 h-4 w-20 rounded animate-pulse"
                  style={{ background: "var(--color-surface1)" }}
                />
                <div
                  className="mt-1 h-3 w-16 rounded animate-pulse"
                  style={{ background: "var(--color-surface1)" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2" aria-label="Loading recently played songs">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-xl animate-pulse"
                style={{ background: "var(--color-surface1)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg"
                  style={{ background: "var(--color-surface2)" }}
                />
                <div className="flex-1 space-y-2">
                  <div
                    className="h-4 w-32 rounded"
                    style={{ background: "var(--color-surface2)" }}
                  />
                  <div
                    className="h-3 w-24 rounded"
                    style={{ background: "var(--color-surface2)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : displayRecents.length > 0 ? (
        layout === "horizontal" ? (
          <div
            ref={scrollContainerRef}
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 select-none scrollbar-hide"
            style={{ cursor: "grab" }}
            aria-label="Recently played songs"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClickCapture={handleClickCapture}
          >
            {displayRecents.map(song => {
              const songPath = makeCanonicalPath({ id: song.id, title: song.title, artist: song.artist })
              return (
                <Link
                  key={song.id}
                  href={songPath}
                  className="flex-shrink-0 w-24 group"
                  aria-label={`${song.title} by ${song.artist}`}
                  draggable={false}
                >
                  <div
                    className="w-24 h-24 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105"
                    style={{ background: "var(--color-surface1)" }}
                  >
                    {song.albumArt ? (
                      <img
                        src={song.albumArt}
                        alt=""
                        className="w-full h-full object-cover pointer-events-none"
                        draggable={false}
                      />
                    ) : (
                      <MusicNote
                        size={32}
                        weight="fill"
                        style={{ color: "var(--color-text-muted)" }}
                      />
                    )}
                  </div>
                  <p
                    className="mt-2 text-sm font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    {song.title}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--color-text3)" }}
                  >
                    {song.artist}
                  </p>
                </Link>
              )
            })}
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Recently played songs">
            {displayRecents.map(song => {
              const songPath = makeCanonicalPath({ id: song.id, title: song.title, artist: song.artist })
              return (
                <li key={song.id}>
                  <Link
                    href={songPath}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:brightness-105"
                    style={{
                      background: "var(--color-surface1)",
                      border: "1px solid var(--color-border)",
                    }}
                    aria-label={`${song.title} by ${song.artist}`}
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center"
                      style={{ background: "var(--color-surface2)" }}
                    >
                      {song.albumArt ? (
                        <img src={song.albumArt} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                        {song.title}
                      </p>
                      <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
                        {song.artist}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      ) : isInitialized ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No recently played songs
        </p>
      ) : null}
    </div>
  )
})
