"use client"

import { springs } from "@/animations"
import type { SearchResult } from "@/hooks/useAdminTrackSearch"
import { Check, CircleNotch, MusicNote, Plus } from "@phosphor-icons/react"
import { motion } from "motion/react"

// ============================================================================
// Types
// ============================================================================

interface SearchResultRowProps {
  result: SearchResult
  index: number
  onAddToCatalog: (lrclibId: number) => Promise<void>
  isAdding?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(sec: number): string {
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}:${s.toString().padStart(2, "0")}`
}

// ============================================================================
// Loading Row
// ============================================================================

export function SearchResultLoadingRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded animate-pulse"
            style={{ background: "var(--color-surface2)" }}
          />
          <div className="flex-1">
            <div
              className="h-4 w-32 rounded animate-pulse mb-1"
              style={{ background: "var(--color-surface2)" }}
            />
            <div
              className="h-3 w-24 rounded animate-pulse"
              style={{ background: "var(--color-surface2)" }}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <div
          className="h-4 w-12 rounded animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
      <td className="px-4 py-3">
        <div
          className="h-8 w-28 rounded animate-pulse ml-auto"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
    </tr>
  )
}

// ============================================================================
// Empty State
// ============================================================================

export function SearchEmptyState({ query }: { query: string }) {
  return (
    <tr>
      <td colSpan={3} className="px-4 py-16 text-center">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--color-surface2)" }}
        >
          <MusicNote size={32} style={{ color: "var(--color-text-muted)" }} />
        </div>
        <h3 className="text-lg font-medium mb-1" style={{ color: "var(--color-text2)" }}>
          No results found
        </h3>
        <p style={{ color: "var(--color-text-muted)" }}>No tracks match &ldquo;{query}&rdquo;</p>
      </td>
    </tr>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function SearchResultRow({ result, index, onAddToCatalog, isAdding }: SearchResultRowProps) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...springs.default, delay: index * 0.02 }}
      className="transition-colors hover:bg-[var(--color-surface1)]"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      {/* Album Art + Title/Artist/Album */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex-shrink-0 w-12 h-12 rounded flex items-center justify-center overflow-hidden"
            style={{ background: "var(--color-surface2)" }}
          >
            {result.albumImageUrl ? (
              <img
                src={result.albumImageUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-medium line-clamp-1 block" style={{ color: "var(--color-text)" }}>
              {result.title}
            </span>
            <p className="text-sm line-clamp-1" style={{ color: "var(--color-text3)" }}>
              {result.artist}
              {result.album && (
                <span style={{ color: "var(--color-text-muted)" }}> · {result.album}</span>
              )}
            </p>
          </div>
        </div>
      </td>

      {/* Duration */}
      <td
        className="px-4 py-3 hidden md:table-cell text-sm tabular-nums text-center"
        style={{ color: "var(--color-text-muted)" }}
      >
        {formatDuration(result.durationSec)}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-right">
        {result.inCatalog ? (
          <span
            className="inline-flex items-center gap-1.5 text-sm"
            style={{ color: "var(--color-success)" }}
          >
            <Check size={16} weight="bold" />
            In catalog
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onAddToCatalog(result.lrclibId)}
            disabled={isAdding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-primary-foreground)",
            }}
          >
            {isAdding ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <Plus size={16} weight="bold" />
            )}
            Add to catalog
          </button>
        )}
      </td>
    </motion.tr>
  )
}
