"use client"

import {
  ArrowSquareOut,
  Copy,
  Lightning,
  PencilSimple,
  Spinner,
  SpotifyLogo,
} from "@phosphor-icons/react"
import { useCallback, useState } from "react"
import type { TrackWithEnrichment } from "./TracksList"

// ============================================================================
// Types
// ============================================================================

interface EnrichmentActionsProps {
  track: TrackWithEnrichment
  onCopyFromTurso: (track: TrackWithEnrichment) => Promise<void>
  onFindSpotify: (track: TrackWithEnrichment) => void
  onFetchBpm: (track: TrackWithEnrichment) => Promise<void>
  onManualBpm: (track: TrackWithEnrichment) => void
  onViewLyrics: (track: TrackWithEnrichment) => void
  onRefresh?: () => void
}

type ActionState = "idle" | "loading" | "success" | "error"

interface ActionButtonProps {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  state?: ActionState
  variant?: "primary" | "secondary" | "spotify"
  tooltip?: string
}

// ============================================================================
// Action Button Component
// ============================================================================

function ActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  state = "idle",
  variant = "secondary",
  tooltip,
}: ActionButtonProps) {
  const isLoading = state === "loading"
  const isSuccess = state === "success"
  const isError = state === "error"

  const baseStyles = {
    primary: {
      background: "var(--color-accent)",
      color: "var(--color-bg)",
    },
    secondary: {
      background: "var(--color-surface2)",
      color: "var(--color-text3)",
    },
    spotify: {
      background: "#1DB954",
      color: "#000",
    },
  }

  const stateStyles = isSuccess
    ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
    : isError
      ? { background: "var(--color-error-soft)", color: "var(--color-error)" }
      : baseStyles[variant]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      title={tooltip}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      style={stateStyles}
    >
      {isLoading ? <Spinner size={16} className="animate-spin" /> : icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function EnrichmentActions({
  track,
  onCopyFromTurso,
  onFindSpotify,
  onFetchBpm,
  onManualBpm,
  onViewLyrics,
  onRefresh,
}: EnrichmentActionsProps) {
  const [copyState, setCopyState] = useState<ActionState>("idle")
  const [fetchBpmState, setFetchBpmState] = useState<ActionState>("idle")

  // Determine button availability
  const hasTursoEnrichment = track.spotifyId !== null && track.tempo !== null
  const hasBpm = track.neonBpm !== null || track.tempo !== null
  const canCopyFromTurso = hasTursoEnrichment && !track.inCatalog

  // Handle Copy from Turso
  const handleCopyFromTurso = useCallback(async () => {
    if (copyState === "loading") return

    setCopyState("loading")
    try {
      await onCopyFromTurso(track)
      setCopyState("success")
      onRefresh?.()
      // Reset after delay
      setTimeout(() => setCopyState("idle"), 2000)
    } catch {
      setCopyState("error")
      setTimeout(() => setCopyState("idle"), 3000)
    }
  }, [copyState, onCopyFromTurso, track, onRefresh])

  // Handle Fetch BPM
  const handleFetchBpm = useCallback(async () => {
    if (fetchBpmState === "loading") return

    setFetchBpmState("loading")
    try {
      await onFetchBpm(track)
      setFetchBpmState("success")
      onRefresh?.()
      setTimeout(() => setFetchBpmState("idle"), 2000)
    } catch {
      setFetchBpmState("error")
      setTimeout(() => setFetchBpmState("idle"), 3000)
    }
  }, [fetchBpmState, onFetchBpm, track, onRefresh])

  // Handle Find Spotify
  const handleFindSpotify = useCallback(() => {
    onFindSpotify(track)
  }, [onFindSpotify, track])

  // Handle Manual BPM
  const handleManualBpm = useCallback(() => {
    onManualBpm(track)
  }, [onManualBpm, track])

  // Handle View Lyrics
  const handleViewLyrics = useCallback(() => {
    onViewLyrics(track)
  }, [onViewLyrics, track])

  return (
    <div className="flex flex-wrap gap-2">
      {/* Copy from Turso */}
      <ActionButton
        label="Copy from Turso"
        icon={<Copy size={16} weight="bold" />}
        onClick={handleCopyFromTurso}
        disabled={!canCopyFromTurso}
        state={copyState}
        variant="primary"
        tooltip={
          !hasTursoEnrichment
            ? "No Turso enrichment available"
            : track.inCatalog
              ? "Already in catalog"
              : "Copy Spotify enrichment from Turso to Neon catalog"
        }
      />

      {/* Find Spotify ID */}
      <ActionButton
        label="Find Spotify"
        icon={<SpotifyLogo size={16} weight="fill" />}
        onClick={handleFindSpotify}
        variant="spotify"
        tooltip="Search and link a Spotify track"
      />

      {/* Fetch BPM */}
      <ActionButton
        label="Fetch BPM"
        icon={<Lightning size={16} weight="fill" />}
        onClick={handleFetchBpm}
        disabled={hasBpm}
        state={fetchBpmState}
        tooltip={hasBpm ? "Track already has BPM" : "Fetch BPM from provider cascade"}
      />

      {/* Manual BPM */}
      <ActionButton
        label="Manual BPM"
        icon={<PencilSimple size={16} weight="bold" />}
        onClick={handleManualBpm}
        tooltip="Enter BPM manually"
      />

      {/* Divider */}
      <div className="w-px h-8 self-center" style={{ background: "var(--color-border)" }} />

      {/* View Lyrics */}
      <ActionButton
        label="View Lyrics"
        icon={<ArrowSquareOut size={16} />}
        onClick={handleViewLyrics}
        tooltip="Open song in player"
      />
    </div>
  )
}
