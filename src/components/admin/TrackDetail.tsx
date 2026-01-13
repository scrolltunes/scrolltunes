"use client"

import { springs } from "@/animations"
import { Check, Clock, MusicNote, SpotifyLogo, Textbox, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import type { TrackWithEnrichment } from "./TracksList"

// ============================================================================
// Types
// ============================================================================

interface TrackDetailProps {
  track: TrackWithEnrichment
  renderActions?: (track: TrackWithEnrichment) => React.ReactNode
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

function formatTimeSignature(timeSig: number | null): string | null {
  if (timeSig === null) return null
  return `${timeSig}/4`
}

// ============================================================================
// Status Row Component
// ============================================================================

interface StatusRowProps {
  label: string
  value: React.ReactNode
  hasValue: boolean
}

function StatusRow({ label, value, hasValue }: StatusRowProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {hasValue ? (
        <Check size={14} weight="bold" style={{ color: "var(--color-success)" }} />
      ) : (
        <X size={14} weight="bold" style={{ color: "var(--color-text-muted)" }} />
      )}
      <span style={{ color: "var(--color-text-muted)" }}>{label}:</span>
      <span
        className="tabular-nums"
        style={{ color: hasValue ? "var(--color-text)" : "var(--color-text-muted)" }}
      >
        {hasValue ? value : "—"}
      </span>
    </div>
  )
}

// ============================================================================
// Section Header Component
// ============================================================================

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  status: "complete" | "partial" | "none"
}

function SectionHeader({ icon, title, subtitle, status }: SectionHeaderProps) {
  const statusColors = {
    complete: "var(--color-success)",
    partial: "var(--color-warning)",
    none: "var(--color-text-muted)",
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: "var(--color-surface2)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
          {title}
        </h4>
        {subtitle && (
          <p className="text-xs" style={{ color: statusColors[status] }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function TrackDetail({ track, renderActions }: TrackDetailProps) {
  // Compute Turso enrichment status
  const tursoSpotifyId = track.spotifyId
  const tursoTempo = track.tempo
  const tursoKey = formatMusicalKey(track.musicalKey, track.mode)
  const tursoTimeSig = formatTimeSignature(track.timeSignature)
  const tursoPopularity = track.popularity
  const tursoIsrc = track.isrc

  const tursoFieldCount = [
    tursoSpotifyId,
    tursoTempo,
    track.musicalKey !== null,
    tursoTimeSig,
    tursoPopularity,
    tursoIsrc,
  ].filter(Boolean).length
  const tursoStatus: "complete" | "partial" | "none" =
    tursoFieldCount >= 5 ? "complete" : tursoFieldCount > 0 ? "partial" : "none"

  // Compute Neon enrichment status
  const neonHasEntry = track.inCatalog
  const neonBpm = track.neonBpm
  const neonKey = track.neonMusicalKey
  const neonBpmSource = track.neonBpmSource
  const neonHasEnhancement = track.hasEnhancement
  const neonHasChords = track.hasChordEnhancement

  const neonFieldCount = neonHasEntry
    ? [neonBpm, neonKey, neonHasEnhancement, neonHasChords].filter(Boolean).length
    : 0
  const neonStatus: "complete" | "partial" | "none" = neonHasEntry
    ? neonFieldCount >= 2
      ? "complete"
      : neonFieldCount > 0
        ? "partial"
        : "none"
    : "none"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springs.default}
      className="p-4"
    >
      {/* Track Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="flex-shrink-0 w-20 h-20 rounded-lg flex items-center justify-center overflow-hidden"
          style={{ background: "var(--color-surface2)" }}
        >
          {track.albumImageUrl ? (
            <img src={track.albumImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <MusicNote size={32} weight="fill" style={{ color: "var(--color-text-muted)" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate" style={{ color: "var(--color-text)" }}>
            {track.title}
          </h3>
          <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
            {track.artist}
          </p>
          {track.album && (
            <p className="text-sm truncate mt-1" style={{ color: "var(--color-text-muted)" }}>
              {track.album}
            </p>
          )}
          <div
            className="flex items-center gap-4 mt-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(track.durationSec)}
            </span>
            <span className="flex items-center gap-1">
              <Textbox size={12} />
              Quality: {track.quality}
            </span>
            <span className="tabular-nums">LRCLIB #{track.lrclibId}</span>
          </div>
        </div>
      </div>

      {/* Enrichment Status Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Turso (Spotify) Section */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--color-surface2)",
            border: "1px solid var(--color-border)",
          }}
        >
          <SectionHeader
            icon={<SpotifyLogo size={18} style={{ color: "var(--color-accent)" }} />}
            title="Turso (Spotify Enrichment)"
            subtitle={
              tursoStatus === "complete"
                ? "All fields available"
                : tursoStatus === "partial"
                  ? "Partial enrichment"
                  : "Not enriched"
            }
            status={tursoStatus}
          />
          <div className="space-y-2">
            <StatusRow
              label="Spotify ID"
              value={tursoSpotifyId ? `${tursoSpotifyId.slice(0, 12)}...` : null}
              hasValue={tursoSpotifyId !== null}
            />
            <StatusRow
              label="Tempo"
              value={tursoTempo ? `${Math.round(tursoTempo)} BPM` : null}
              hasValue={tursoTempo !== null}
            />
            <StatusRow
              label="Key"
              value={tursoKey ? `${tursoKey} (${tursoTimeSig ?? "4/4"})` : null}
              hasValue={track.musicalKey !== null}
            />
            <StatusRow
              label="Popularity"
              value={tursoPopularity !== null ? tursoPopularity : null}
              hasValue={tursoPopularity !== null}
            />
            <StatusRow label="ISRC" value={tursoIsrc} hasValue={tursoIsrc !== null} />
          </div>
        </div>

        {/* Neon (Catalog) Section */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--color-surface2)",
            border: "1px solid var(--color-border)",
          }}
        >
          <SectionHeader
            icon={<MusicNote size={18} style={{ color: "var(--color-accent)" }} />}
            title="Neon (Catalog)"
            subtitle={
              !neonHasEntry
                ? "Not in catalog"
                : neonStatus === "complete"
                  ? "Full enrichment"
                  : neonStatus === "partial"
                    ? "Partial enrichment"
                    : "No enrichment"
            }
            status={neonStatus}
          />
          <div className="space-y-2">
            <StatusRow
              label="In Catalog"
              value={neonHasEntry ? "Yes" : "No"}
              hasValue={neonHasEntry}
            />
            <StatusRow
              label="BPM"
              value={neonBpm ? `${neonBpm} (${neonBpmSource ?? "Unknown"})` : null}
              hasValue={neonBpm !== null}
            />
            <StatusRow label="Musical Key" value={neonKey} hasValue={neonKey !== null} />
            <StatusRow
              label="Word-level timing"
              value={neonHasEnhancement ? "Yes" : "No"}
              hasValue={neonHasEnhancement}
            />
            <StatusRow
              label="Chord enhancement"
              value={neonHasChords ? "Yes" : "No"}
              hasValue={neonHasChords}
            />
            {track.totalPlayCount !== null && track.totalPlayCount > 0 && (
              <div
                className="flex items-center gap-2 text-sm mt-2 pt-2"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <span style={{ color: "var(--color-text-muted)" }}>Play count:</span>
                <span className="tabular-nums font-medium" style={{ color: "var(--color-text)" }}>
                  {track.totalPlayCount.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {renderActions && (
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <h4 className="text-sm font-medium mb-3" style={{ color: "var(--color-text3)" }}>
            Actions
          </h4>
          {renderActions(track)}
        </div>
      )}
    </motion.div>
  )
}
