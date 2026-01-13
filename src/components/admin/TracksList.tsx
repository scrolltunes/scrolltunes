"use client"

import { springs } from "@/animations"
import { CaretDown, CaretLeft, CaretRight, Check, MusicNote, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useState } from "react"

// ============================================================================
// Types
// ============================================================================

export interface TrackWithEnrichment {
  // Turso fields
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  quality: number

  // Turso Spotify enrichment
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  mode: number | null
  timeSignature: number | null
  isrc: string | null
  albumImageUrl: string | null

  // Neon enrichment (if in catalog)
  inCatalog: boolean
  neonSongId: string | null
  neonBpm: number | null
  neonMusicalKey: string | null
  neonBpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number | null
}

interface TracksListProps {
  tracks: TrackWithEnrichment[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  isLoading: boolean
  onPageChange: (newOffset: number) => void
  onTrackSelect: (track: TrackWithEnrichment) => void
  renderExpandedContent?: (track: TrackWithEnrichment) => React.ReactNode
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

function formatMusicalKey(key: number | null, mode: number | null): string | null {
  if (key === null) return null

  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const pitch = pitchClasses[key % 12]
  const modeStr = mode === 0 ? "m" : ""
  return pitch ? `${pitch}${modeStr}` : null
}

// ============================================================================
// Status Badges
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
      {active ? <Check size={12} weight="bold" /> : <X size={12} />}
      {label}
    </span>
  )
}

function PopularityBar({ popularity }: { popularity: number | null }) {
  if (popularity === null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full flex-1 max-w-[60px]"
        style={{ background: "var(--color-surface2)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${popularity}%`,
            background: popularity > 70 ? "var(--color-success)" : "var(--color-accent)",
          }}
        />
      </div>
      <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {popularity}
      </span>
    </div>
  )
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <tr key={i}>
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
              className="h-4 w-20 rounded animate-pulse"
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
      ))}
    </>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-16 text-center">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--color-surface2)" }}
        >
          <MusicNote size={32} style={{ color: "var(--color-text-muted)" }} />
        </div>
        <h3 className="text-lg font-medium mb-1" style={{ color: "var(--color-text2)" }}>
          No tracks found
        </h3>
        <p style={{ color: "var(--color-text-muted)" }}>Try adjusting your search or filter</p>
      </td>
    </tr>
  )
}

// ============================================================================
// Track Row Component
// ============================================================================

interface TrackRowProps {
  track: TrackWithEnrichment
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
  onSelect: () => void
  renderExpandedContent: ((track: TrackWithEnrichment) => React.ReactNode) | undefined
}

function TrackRow({
  track,
  index,
  isExpanded,
  onToggleExpand,
  renderExpandedContent,
}: TrackRowProps) {
  const bpm = track.neonBpm ?? (track.tempo ? Math.round(track.tempo) : null)
  const musicalKey = track.neonMusicalKey ?? formatMusicalKey(track.musicalKey, track.mode)

  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...springs.default, delay: index * 0.02 }}
        onClick={onToggleExpand}
        className="cursor-pointer transition-colors hover:bg-[var(--color-surface1)]"
        style={{ borderBottom: isExpanded ? "none" : "1px solid var(--color-border)" }}
      >
        {/* Song Info */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex-shrink-0 w-12 h-12 rounded flex items-center justify-center overflow-hidden"
              style={{ background: "var(--color-surface2)" }}
            >
              {track.albumImageUrl ? (
                <img src={track.albumImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="font-medium line-clamp-1 block"
                style={{ color: "var(--color-text)" }}
              >
                {track.title}
              </span>
              <p className="text-sm line-clamp-1" style={{ color: "var(--color-text3)" }}>
                {track.artist}
              </p>
            </div>
          </div>
        </td>

        {/* Duration */}
        <td
          className="px-4 py-3 hidden md:table-cell text-sm"
          style={{ color: "var(--color-text3)" }}
        >
          {formatDuration(track.durationSec)}
        </td>

        {/* BPM */}
        <td
          className="px-4 py-3 hidden lg:table-cell text-sm"
          style={{ color: "var(--color-text3)" }}
        >
          {bpm ? (
            <span className="tabular-nums">
              {bpm}
              {musicalKey && <span className="ml-1 text-xs">· {musicalKey}</span>}
            </span>
          ) : (
            <span style={{ color: "var(--color-text-muted)" }}>—</span>
          )}
        </td>

        {/* Popularity */}
        <td className="px-4 py-3 hidden lg:table-cell">
          <PopularityBar popularity={track.popularity} />
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            <StatusBadge label="Spotify" active={track.spotifyId !== null} />
            <StatusBadge label="Catalog" active={track.inCatalog} />
          </div>
        </td>

        {/* Expand */}
        <td className="px-4 py-3 text-center">
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={springs.snap}>
            <CaretDown size={18} style={{ color: "var(--color-text-muted)" }} />
          </motion.div>
        </td>
      </motion.tr>

      {/* Expanded Content */}
      {isExpanded && renderExpandedContent && (
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          <td colSpan={6} className="p-0">
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

// ============================================================================
// Main Component
// ============================================================================

export function TracksList({
  tracks,
  total,
  offset,
  limit,
  hasMore,
  isLoading,
  onPageChange,
  onTrackSelect,
  renderExpandedContent,
}: TracksListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  const handleToggleExpand = (track: TrackWithEnrichment) => {
    if (expandedId === track.lrclibId) {
      setExpandedId(null)
    } else {
      setExpandedId(track.lrclibId)
      onTrackSelect(track)
    }
  }

  return (
    <div>
      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--color-surface1)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left"
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  color: "var(--color-text3)",
                }}
              >
                <th className="px-4 py-3 font-medium">Track</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Duration</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">BPM</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Popularity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-12" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRows />
              ) : tracks.length === 0 ? (
                <EmptyState />
              ) : (
                tracks.map((track, index) => (
                  <TrackRow
                    key={track.lrclibId}
                    track={track}
                    index={index}
                    isExpanded={expandedId === track.lrclibId}
                    onToggleExpand={() => handleToggleExpand(track)}
                    onSelect={() => onTrackSelect(track)}
                    renderExpandedContent={renderExpandedContent}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...springs.default, delay: 0.2 }}
          className="flex items-center justify-between mt-4"
        >
          <p className="text-sm" style={{ color: "var(--color-text3)" }}>
            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:brightness-125"
              style={{ background: "var(--color-surface2)", color: "var(--color-text3)" }}
            >
              <CaretLeft size={18} />
            </button>
            <span
              className="text-sm min-w-[80px] text-center tabular-nums"
              style={{ color: "var(--color-text3)" }}
            >
              Page {currentPage} of {totalPages.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(offset + limit)}
              disabled={!hasMore}
              className="p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:brightness-125"
              style={{ background: "var(--color-surface2)", color: "var(--color-text3)" }}
            >
              <CaretRight size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
