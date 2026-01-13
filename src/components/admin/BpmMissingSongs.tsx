"use client"

import { springs } from "@/animations"
import { CaretLeft, CaretRight, MusicNoteSimple, Warning, XCircle } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

interface MissingSong {
  lrclibId: number | null
  songId: string | null
  title: string
  artist: string
  failedAttempts: number
}

type MissingType = "never" | "failed" | "problematic"

interface Tab {
  id: MissingType
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: "never", label: "Never had BPM", icon: <MusicNoteSimple size={16} /> },
  { id: "failed", label: "All failed", icon: <XCircle size={16} /> },
  { id: "problematic", label: "Most problematic", icon: <Warning size={16} /> },
]

interface BpmMissingSongsProps {
  onSongClick?: (
    lrclibId: number | null,
    songId: string | null,
    title: string,
    artist: string,
  ) => void
}

const PAGE_SIZE = 20

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface1)" }}>
      <div className="p-4">
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-8 w-28 rounded-lg animate-pulse"
              style={{ background: "var(--color-surface2)" }}
            />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex gap-4 items-center">
              <div
                className="h-4 flex-1 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-24 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BpmMissingSongs({ onSongClick }: BpmMissingSongsProps) {
  const [activeTab, setActiveTab] = useState<MissingType>("never")
  const [data, setData] = useState<MissingSong[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const fetchMissingSongs = useCallback(async (type: MissingType, currentOffset: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/bpm-stats?section=missing&missingType=${type}&offset=${currentOffset}&limit=${PAGE_SIZE + 1}`,
      )
      if (!response.ok) {
        throw new Error("Failed to fetch missing songs")
      }
      const result = (await response.json()) as MissingSong[]
      // Check if there are more results
      if (result.length > PAGE_SIZE) {
        setHasMore(true)
        setData(result.slice(0, PAGE_SIZE))
      } else {
        setHasMore(false)
        setData(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMissingSongs(activeTab, offset)
  }, [fetchMissingSongs, activeTab, offset])

  const handleTabChange = (tab: MissingType) => {
    setActiveTab(tab)
    setOffset(0)
    setData([])
  }

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset(Math.max(0, offset - PAGE_SIZE))
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      setOffset(offset + PAGE_SIZE)
    }
  }

  const handleSongClick = (song: MissingSong) => {
    if (onSongClick) {
      onSongClick(song.lrclibId, song.songId, song.title, song.artist)
    }
  }

  if (isLoading && data.length === 0 && offset === 0) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        Failed to load missing songs: {error}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-surface1)" }}
    >
      {/* Tabs */}
      <div
        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                background: activeTab === tab.id ? "var(--color-accent)" : "var(--color-surface2)",
                color: activeTab === tab.id ? "var(--color-accent-text)" : "var(--color-text2)",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={offset === 0}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: offset === 0 ? "transparent" : "var(--color-surface2)",
              color: "var(--color-text)",
            }}
            aria-label="Previous page"
          >
            <CaretLeft size={18} />
          </button>
          <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            {data.length > 0 ? `${offset + 1}-${offset + data.length}` : "0"}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!hasMore}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: !hasMore ? "transparent" : "var(--color-surface2)",
              color: "var(--color-text)",
            }}
            aria-label="Next page"
          >
            <CaretRight size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      {data.length === 0 && !isLoading ? (
        <div className="p-8 text-center">
          <div
            className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: "var(--color-success-bg)" }}
          >
            <span style={{ color: "var(--color-success)", fontSize: "1.5rem" }}>{"\u2713"}</span>
          </div>
          <p style={{ color: "var(--color-text)" }}>
            {activeTab === "never" && "All songs in catalog have BPM"}
            {activeTab === "failed" && "No songs with all failed attempts"}
            {activeTab === "problematic" && "No problematic songs found"}
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {data.map((song, index) => (
            <motion.button
              key={`${song.lrclibId ?? song.songId ?? index}`}
              type="button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springs.default, delay: index * 0.03 }}
              onClick={() => handleSongClick(song)}
              className="w-full p-4 text-left hover:bg-[var(--color-surface2)] transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium" style={{ color: "var(--color-text)" }}>
                  {song.title}
                </p>
                <p className="truncate text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {song.artist}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {song.lrclibId !== null && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium tabular-nums"
                    style={{
                      background: "var(--color-surface2)",
                      color: "var(--color-text2)",
                    }}
                  >
                    #{song.lrclibId}
                  </span>
                )}
                {song.failedAttempts > 0 && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium tabular-nums"
                    style={{
                      background: "var(--color-error-bg)",
                      color: "var(--color-error)",
                    }}
                  >
                    {song.failedAttempts} failed
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="p-4 text-center" style={{ borderTop: "1px solid var(--color-border)" }}>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading...
          </span>
        </div>
      )}
    </motion.div>
  )
}
