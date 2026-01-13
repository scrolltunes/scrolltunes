"use client"

import { springs } from "@/animations"
import { CaretLeft, CaretRight, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

interface FailureEntry {
  id: number
  lrclibId: number
  title: string
  artist: string
  provider: string
  errorReason: string | null
  createdAt: string
}

interface BpmFailuresListProps {
  onSongClick?: (lrclibId: number, title: string, artist: string) => void
}

const PAGE_SIZE = 20

function LoadingSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface1)" }}>
      <div className="p-4">
        <div
          className="h-5 w-40 rounded mb-4 animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
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
              <div
                className="h-4 w-20 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
              <div
                className="h-4 w-32 rounded animate-pulse"
                style={{ background: "var(--color-surface2)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatErrorReason(reason: string | null): string {
  if (!reason) return "Unknown"
  return reason
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function BpmFailuresList({ onSongClick }: BpmFailuresListProps) {
  const [data, setData] = useState<FailureEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const fetchFailures = useCallback(async (currentOffset: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/bpm-stats?section=failures&offset=${currentOffset}&limit=${PAGE_SIZE + 1}`,
      )
      if (!response.ok) {
        throw new Error("Failed to fetch failures")
      }
      const result = (await response.json()) as FailureEntry[]
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
    fetchFailures(offset)
  }, [fetchFailures, offset])

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

  const handleSongClick = (entry: FailureEntry) => {
    if (onSongClick) {
      onSongClick(entry.lrclibId, entry.title, entry.artist)
    }
  }

  if (isLoading && data.length === 0) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div
        className="p-5 rounded-xl text-center"
        style={{ background: "var(--color-surface1)", color: "var(--color-text-muted)" }}
      >
        Failed to load failures: {error}
      </div>
    )
  }

  if (data.length === 0 && offset === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.default}
        className="p-8 rounded-xl text-center"
        style={{ background: "var(--color-surface1)" }}
      >
        <div
          className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: "var(--color-success-bg)" }}
        >
          <span style={{ color: "var(--color-success)", fontSize: "1.5rem" }}>✓</span>
        </div>
        <p style={{ color: "var(--color-text)" }}>No failures recorded</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          All BPM fetch attempts have been successful
        </p>
      </motion.div>
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
      <div
        className="p-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <h3 className="font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
          <Warning size={18} style={{ color: "var(--color-error)" }} />
          Recent Failures
        </h3>
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
            {offset + 1}-{offset + data.length}
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

      <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {data.map((entry, index) => (
          <motion.button
            key={entry.id}
            type="button"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springs.default, delay: index * 0.03 }}
            onClick={() => handleSongClick(entry)}
            className="w-full p-4 text-left hover:bg-[var(--color-surface2)] transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium" style={{ color: "var(--color-text)" }}>
                {entry.title}
              </p>
              <p className="truncate text-sm" style={{ color: "var(--color-text-muted)" }}>
                {entry.artist}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-sm">
              <span
                className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                style={{
                  background: "var(--color-surface2)",
                  color: "var(--color-text2)",
                }}
              >
                {entry.provider}
              </span>
              <span
                className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                style={{
                  background: "var(--color-error-bg)",
                  color: "var(--color-error)",
                }}
              >
                {formatErrorReason(entry.errorReason)}
              </span>
              <span
                className="whitespace-nowrap tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {formatTimestamp(entry.createdAt)}
              </span>
            </div>
          </motion.button>
        ))}
      </div>

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
