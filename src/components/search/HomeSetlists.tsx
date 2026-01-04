"use client"

import { type SetlistSong, setlistsStore, useSetlists, useSetlistsLoading } from "@/core"
import { loadCachedLyrics } from "@/lib/lyrics-cache"
import { makeSetlistPath } from "@/lib/slug"
import { MusicNotesSimple, Queue } from "@phosphor-icons/react"
import Link from "next/link"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface HomeSetlistsProps {
  readonly className?: string
}

function getAlbumArtsForSetlist(songs: readonly SetlistSong[] | undefined): (string | undefined)[] {
  if (!songs || songs.length === 0) return []

  const arts: (string | undefined)[] = []
  for (const song of songs.slice(0, 4)) {
    if (song.songProvider === "lrclib") {
      const numericId = Number(song.songId)
      if (!Number.isNaN(numericId)) {
        const cached = loadCachedLyrics(numericId)
        arts.push(cached?.albumArt)
      } else {
        arts.push(undefined)
      }
    } else {
      arts.push(undefined)
    }
  }
  return arts
}

export const HomeSetlists = memo(function HomeSetlists({ className = "" }: HomeSetlistsProps) {
  const setlists = useSetlists()
  const isLoading = useSetlistsLoading()

  // Drag-to-scroll functionality
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const dragThreshold = 5
  const dragDistanceRef = useRef(0)

  // Fetch setlists on mount
  useEffect(() => {
    setlistsStore.fetchAll()
  }, [])

  // Fetch songs for setlists that don't have them loaded yet
  useEffect(() => {
    for (const setlist of setlists) {
      if (!setlist.songs && setlist.songCount > 0) {
        setlistsStore.fetchSongs(setlist.id)
      }
    }
  }, [setlists])

  // Compute album arts for each setlist
  const albumArtsMap = useMemo(() => {
    const map = new Map<string, (string | undefined)[]>()
    for (const setlist of setlists) {
      map.set(setlist.id, getAlbumArtsForSetlist(setlist.songs))
    }
    return map
  }, [setlists])

  // Only show first 6 setlists on homepage
  const displaySetlists = setlists.slice(0, 6)

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

  if (!isLoading && setlists.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 h-6">
        <div className="flex items-center gap-2" style={{ color: "var(--color-text3)" }}>
          <Queue size={16} weight="bold" />
          <span className="text-sm font-medium uppercase tracking-wider">Setlists</span>
        </div>
        {setlists.length > 0 && (
          <Link
            href="/setlists"
            className="text-sm transition-colors hover:brightness-125"
            style={{ color: "var(--color-text-muted)" }}
          >
            Manage
          </Link>
        )}
      </div>

      {isLoading && setlists.length === 0 ? (
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
          aria-label="Loading setlists"
        >
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-shrink-0 w-28">
              <div
                className="w-28 h-28 rounded-xl animate-pulse"
                style={{ background: "var(--color-surface3)" }}
              />
              <div
                className="mt-2 h-4 w-24 rounded animate-pulse"
                style={{ background: "var(--color-surface3)" }}
              />
              <div
                className="mt-1 h-3 w-16 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
            </div>
          ))}
        </div>
      ) : displaySetlists.length > 0 ? (
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 select-none scrollbar-hide"
          style={{ cursor: "grab" }}
          aria-label="Setlists"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClickCapture={handleClickCapture}
        >
          {displaySetlists.map(setlist => {
            const albumArts = albumArtsMap.get(setlist.id) ?? []
            const gridItems = [0, 1, 2, 3].map(i => albumArts[i])
            const hasAlbumArts = albumArts.some(art => art !== undefined)

            return (
              <Link
                key={setlist.id}
                href={makeSetlistPath({ id: setlist.id, name: setlist.name })}
                className="flex-shrink-0 w-28 group"
                aria-label={`${setlist.name}, ${setlist.songCount} ${setlist.songCount === 1 ? "song" : "songs"}`}
                draggable={false}
              >
                <div
                  className="w-28 h-28 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 relative"
                  style={{ background: "var(--color-surface1)" }}
                >
                  {setlist.color && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 z-10"
                      style={{ backgroundColor: setlist.color }}
                    />
                  )}
                  {hasAlbumArts ? (
                    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px">
                      {gridItems.map((art, i) => (
                        <div key={i} style={{ background: "var(--color-surface2)" }}>
                          {art ? (
                            <img
                              src={art}
                              alt=""
                              className="w-full h-full object-cover pointer-events-none"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full" style={{ background: "var(--color-surface2)" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <MusicNotesSimple
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
                  {setlist.name}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--color-text3)" }}
                >
                  {setlist.songCount} {setlist.songCount === 1 ? "song" : "songs"}
                </p>
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})
