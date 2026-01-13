"use client"

import { springs } from "@/animations"
import type { CatalogTrack } from "@/hooks/useAdminCatalog"
import { CaretDown, Check, MusicNote, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"

// ============================================================================
// Types
// ============================================================================

interface CatalogTrackRowProps {
  track: CatalogTrack
  index: number
  isExpanded: boolean
  onToggle: () => void
  renderExpandedContent?: (track: CatalogTrack) => React.ReactNode
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffWeek = Math.floor(diffDay / 7)
    const diffMonth = Math.floor(diffDay / 30)

    if (diffMin < 1) return "now"
    if (diffMin < 60) return `${diffMin}m`
    if (diffHour < 24) return `${diffHour}h`
    if (diffDay < 7) return `${diffDay}d`
    if (diffWeek < 4) return `${diffWeek}w`
    return `${diffMonth}mo`
  } catch {
    return "—"
  }
}

// ============================================================================
// Status Badge
// ============================================================================

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full"
      style={
        active
          ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
          : { background: "var(--color-surface2)", color: "var(--color-text-muted)" }
      }
    >
      <Check size={12} weight="bold" />
      {label}
    </span>
  )
}

// ============================================================================
// Loading Row
// ============================================================================

export function CatalogTrackLoadingRow() {
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
      <td className="px-4 py-3 hidden md:table-cell">
        <div
          className="h-4 w-8 rounded animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div
          className="h-4 w-16 rounded animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div
          className="h-4 w-12 rounded animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
      <td className="px-4 py-3">
        <div
          className="h-4 w-16 rounded animate-pulse"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <div
          className="h-4 w-8 rounded animate-pulse mx-auto"
          style={{ background: "var(--color-surface2)" }}
        />
      </td>
    </tr>
  )
}

// ============================================================================
// Empty State
// ============================================================================

export function CatalogEmptyState() {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-16 text-center">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--color-surface2)" }}
        >
          <MusicNote size={32} style={{ color: "var(--color-text-muted)" }} />
        </div>
        <h3 className="text-lg font-medium mb-1" style={{ color: "var(--color-text2)" }}>
          No tracks in catalog
        </h3>
        <p style={{ color: "var(--color-text-muted)" }}>
          Use search to find and add tracks to the catalog
        </p>
      </td>
    </tr>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function CatalogTrackRow({
  track,
  index,
  isExpanded,
  onToggle,
  renderExpandedContent,
}: CatalogTrackRowProps) {
  const hasBpm = track.bpm !== null
  const lastPlayed = formatRelativeTime(track.lastPlayedAt)

  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...springs.default, delay: index * 0.02 }}
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-[var(--color-surface1)]"
        style={{
          borderBottom: isExpanded ? "none" : "1px solid var(--color-border)",
          background: !hasBpm ? "var(--color-warning-soft)" : undefined,
        }}
      >
        {/* Album Art + Title/Artist */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex-shrink-0 w-12 h-12 rounded flex items-center justify-center overflow-hidden"
              style={{ background: "var(--color-surface2)" }}
            >
              {track.albumArtUrl ? (
                <img
                  src={track.albumArtUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {!hasBpm && (
                  <Warning
                    size={16}
                    weight="fill"
                    className="flex-shrink-0"
                    style={{ color: "var(--color-warning)" }}
                  />
                )}
                <span
                  className="font-medium line-clamp-1 block"
                  style={{ color: "var(--color-text)" }}
                >
                  {track.title}
                </span>
              </div>
              <p className="text-sm line-clamp-1" style={{ color: "var(--color-text3)" }}>
                {track.artist}
              </p>
            </div>
          </div>
        </td>

        {/* Plays */}
        <td
          className="px-4 py-3 hidden md:table-cell text-sm tabular-nums text-center"
          style={{ color: "var(--color-text3)" }}
        >
          {track.totalPlayCount.toLocaleString()}
        </td>

        {/* Users */}
        <td
          className="px-4 py-3 hidden md:table-cell text-sm tabular-nums text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          {track.uniqueUsers}
        </td>

        {/* Last Played */}
        <td
          className="px-4 py-3 hidden lg:table-cell text-xs text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          {lastPlayed}
        </td>

        {/* BPM */}
        <td
          className="px-4 py-3 hidden lg:table-cell text-sm tabular-nums text-center"
          style={{ color: hasBpm ? "var(--color-text3)" : "var(--color-warning)" }}
        >
          {track.bpm ?? "—"}
          {track.musicalKey && (
            <span className="ml-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
              · {track.musicalKey}
            </span>
          )}
        </td>

        {/* Enhancement Status */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {track.hasEnhancement && <StatusBadge label="Enhanced" active />}
            {track.hasChordEnhancement && <StatusBadge label="Chords" active />}
          </div>
        </td>

        {/* Expand Arrow */}
        <td className="px-4 py-3 text-center">
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={springs.snap}>
            <CaretDown size={18} style={{ color: "var(--color-text-muted)" }} />
          </motion.div>
        </td>
      </motion.tr>

      {/* Expanded Content */}
      {isExpanded && renderExpandedContent && (
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          <td colSpan={7} className="p-0">
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springs.default}
              style={{ background: "var(--color-surface1)" }}
            >
              {renderExpandedContent(track)}
            </motion.div>
          </td>
        </tr>
      )}
    </>
  )
}
