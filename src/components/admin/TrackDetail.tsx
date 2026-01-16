"use client"

import { springs } from "@/animations"
import { ArrowSquareOut, Check, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useState } from "react"
import type { TrackWithEnrichment } from "./TracksList"

// ============================================================================
// Types
// ============================================================================

interface TrackDetailProps {
  track: TrackWithEnrichment
  onCopyFromTurso?: (track: TrackWithEnrichment) => Promise<void>
  onFindSpotify?: (track: TrackWithEnrichment) => void
  onFetchBpm?: (track: TrackWithEnrichment) => Promise<void>
  onViewLyrics?: (track: TrackWithEnrichment) => void
  onDelete?: (track: TrackWithEnrichment) => Promise<void>
  onRefresh?: () => void
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
// Metadata Row Component
// ============================================================================

function MetadataRow({
  label,
  value,
  actions,
}: {
  label: string
  value: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div
      className="flex items-start gap-3 py-2 last:border-b-0"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <span
        className="w-24 shrink-0 text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span className="flex-1 text-sm" style={{ color: "var(--color-text)" }}>
        {value ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
      </span>
      {actions && (
        <span className="shrink-0 flex items-center gap-2">{actions}</span>
      )}
    </div>
  )
}

// ============================================================================
// Inline Action Link
// ============================================================================

function InlineAction({
  label,
  onClick,
  loading,
  variant = "default",
}: {
  label: string
  onClick: () => void
  loading?: boolean
  variant?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="text-xs transition-colors hover:brightness-125 disabled:opacity-50"
      style={{
        color: variant === "danger" ? "var(--color-danger)" : "var(--color-accent)",
      }}
    >
      {loading ? "..." : label}
    </button>
  )
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
      {active ? <Check size={10} weight="bold" /> : <X size={10} />}
      {label}
    </span>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function TrackDetail({
  track,
  onCopyFromTurso,
  onFindSpotify,
  onFetchBpm,
  onViewLyrics,
  onDelete,
  onRefresh,
}: TrackDetailProps) {
  const [isCopying, setIsCopying] = useState(false)
  const [isFetchingBpm, setIsFetchingBpm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Computed values
  const tursoTempo = track.tempo
  const tursoKey = formatMusicalKey(track.musicalKey, track.mode)
  const neonBpm = track.neonBpm
  const neonKey = track.neonMusicalKey
  const effectiveBpm = neonBpm ?? tursoTempo
  const effectiveKey = neonKey ?? tursoKey
  const hasTursoEnrichment = track.spotifyId !== null && track.tempo !== null

  // Handlers
  const handleCopyFromTurso = useCallback(async () => {
    if (!onCopyFromTurso || isCopying) return
    setIsCopying(true)
    try {
      await onCopyFromTurso(track)
      onRefresh?.()
    } finally {
      setIsCopying(false)
    }
  }, [onCopyFromTurso, track, onRefresh, isCopying])

  const handleFetchBpm = useCallback(async () => {
    if (!onFetchBpm || isFetchingBpm) return
    setIsFetchingBpm(true)
    try {
      await onFetchBpm(track)
      onRefresh?.()
    } finally {
      setIsFetchingBpm(false)
    }
  }, [onFetchBpm, track, onRefresh, isFetchingBpm])

  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting) return
    if (!window.confirm(`Delete "${track.title}" by ${track.artist} from catalog?`)) return
    setIsDeleting(true)
    try {
      await onDelete(track)
    } finally {
      setIsDeleting(false)
    }
  }, [onDelete, track, isDeleting])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springs.default}
      className="p-4"
    >
      <div
        className="rounded-xl p-4"
        style={{
          background: "var(--color-surface2)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h4 className="text-sm font-medium mb-3" style={{ color: "var(--color-text)" }}>
          Song Metadata
        </h4>

        <div className="space-y-0">
          <MetadataRow label="Duration" value={formatDuration(track.durationSec)} />

          <MetadataRow label="Quality" value={track.quality} />

          <MetadataRow
            label="LRCLIB ID"
            value={
              <a
                href={`https://lrclib.net/api/get/${track.lrclibId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:brightness-125 font-mono"
                style={{ color: "var(--color-accent)" }}
              >
                {track.lrclibId}
                <ArrowSquareOut size={12} />
              </a>
            }
            actions={
              onViewLyrics && (
                <InlineAction label="View" onClick={() => onViewLyrics(track)} />
              )
            }
          />

          <MetadataRow
            label="Spotify ID"
            value={track.spotifyId ? <span className="font-mono">{track.spotifyId}</span> : null}
            actions={
              onFindSpotify && (
                <InlineAction label="Find" onClick={() => onFindSpotify(track)} />
              )
            }
          />

          <MetadataRow
            label="BPM"
            value={
              effectiveBpm ? (
                <span>
                  {Math.round(effectiveBpm)}
                  {track.neonBpmSource && (
                    <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>
                      via {track.neonBpmSource}
                    </span>
                  )}
                  {!neonBpm && tursoTempo && (
                    <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>
                      (Turso)
                    </span>
                  )}
                </span>
              ) : null
            }
            actions={
              <>
                {!effectiveBpm && onFetchBpm && (
                  <InlineAction
                    label="Fetch"
                    onClick={handleFetchBpm}
                    loading={isFetchingBpm}
                  />
                )}
                {hasTursoEnrichment && !track.inCatalog && onCopyFromTurso && (
                  <InlineAction
                    label="Copy from Turso"
                    onClick={handleCopyFromTurso}
                    loading={isCopying}
                  />
                )}
              </>
            }
          />

          <MetadataRow
            label="Key"
            value={effectiveKey}
          />

          <MetadataRow
            label="Popularity"
            value={track.popularity}
          />

          <MetadataRow
            label="ISRC"
            value={track.isrc}
          />

          <MetadataRow
            label="Enhancements"
            value={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge label="Words" active={track.hasEnhancement ?? false} />
                <StatusBadge label="Chords" active={track.hasChordEnhancement ?? false} />
              </div>
            }
          />

          <MetadataRow
            label="Catalog"
            value={
              track.inCatalog ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={14} weight="bold" style={{ color: "var(--color-success)" }} />
                  <span style={{ color: "var(--color-success)" }}>In catalog</span>
                  {track.totalPlayCount !== null && track.totalPlayCount > 0 && (
                    <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
                      ({track.totalPlayCount.toLocaleString()} plays)
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ color: "var(--color-text-muted)" }}>Not in catalog</span>
              )
            }
            actions={
              track.inCatalog && onDelete && (
                <InlineAction
                  label="Remove"
                  onClick={handleDelete}
                  loading={isDeleting}
                  variant="danger"
                />
              )
            }
          />
        </div>
      </div>
    </motion.div>
  )
}
