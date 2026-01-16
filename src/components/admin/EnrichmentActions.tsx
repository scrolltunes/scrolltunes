"use client"

import {
  ArrowSquareOut,
  Check,
  Copy,
  Lightning,
  PencilSimple,
  Spinner,
  SpotifyLogo,
  Trash,
  X,
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
  onDelete?: (track: TrackWithEnrichment) => Promise<void>
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

interface ProviderStatus {
  name: string
  status: "pending" | "loading" | "success" | "error"
  bpm?: number
  error?: string
  latencyMs?: number
}

interface ProviderEvent {
  type: "provider_start" | "provider_result" | "complete" | "error"
  provider?: string
  success?: boolean
  bpm?: number
  error?: string
  latencyMs?: number
  source?: string
}

type BpmFetchState = "idle" | "fetching" | "complete" | "error"

const PROVIDER_NAMES = ["GetSongBPM", "Deezer"]

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
// Provider Status Row
// ============================================================================

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  const [copied, setCopied] = useState(false)

  const copyableText =
    provider.status === "success" && provider.bpm
      ? `${provider.bpm} BPM`
      : provider.status === "error" && provider.error
        ? provider.error
        : null

  const handleCopy = async () => {
    if (!copyableText) return
    try {
      await navigator.clipboard.writeText(copyableText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API failed, ignore
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
      style={{ background: "var(--color-surface2)" }}
    >
      <div className="w-4 h-4 flex items-center justify-center shrink-0">
        {provider.status === "pending" && (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--color-text-muted)" }}
          />
        )}
        {provider.status === "loading" && (
          <Spinner size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        )}
        {provider.status === "success" && (
          <Check size={14} weight="bold" style={{ color: "var(--color-success)" }} />
        )}
        {provider.status === "error" && (
          <X size={14} weight="bold" style={{ color: "var(--color-danger)" }} />
        )}
      </div>

      <span className="font-medium">{provider.name}</span>

      {provider.status === "success" && provider.bpm && (
        <span
          className="text-xs select-all cursor-pointer"
          style={{ color: "var(--color-success)" }}
          onClick={handleCopy}
          title="Click to copy"
        >
          {provider.bpm} BPM
        </span>
      )}
      {provider.status === "error" && provider.error && (
        <span
          className="text-xs select-all cursor-pointer truncate max-w-[200px]"
          style={{ color: "var(--color-danger)" }}
          onClick={handleCopy}
          title={`${provider.error}\n\nClick to copy`}
        >
          {provider.error}
        </span>
      )}

      {copyableText && (
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded transition-colors hover:bg-white/10"
          style={{ color: copied ? "var(--color-success)" : "var(--color-text3)" }}
          title={copied ? "Copied!" : "Copy to clipboard"}
        >
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
        </button>
      )}

      {provider.latencyMs !== undefined && (
        <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--color-text-muted)" }}>
          {provider.latencyMs}ms
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Copy BPM Button
// ============================================================================

function CopyBpmButton({ bpm }: { bpm: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(bpm))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API failed, ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:brightness-110"
      style={{
        background: copied ? "var(--color-success)" : "var(--color-accent)",
        color: "white",
      }}
    >
      {copied ? (
        <>
          <Check size={12} weight="bold" />
          Copied
        </>
      ) : (
        <>
          <Copy size={12} />
          Copy
        </>
      )}
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
  onManualBpm,
  onViewLyrics,
  onDelete,
  onRefresh,
}: EnrichmentActionsProps) {
  const [copyState, setCopyState] = useState<ActionState>("idle")
  const [deleteState, setDeleteState] = useState<ActionState>("idle")

  // BPM fetch state with provider tracking
  const [bpmFetchState, setBpmFetchState] = useState<BpmFetchState>("idle")
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [bpmResult, setBpmResult] = useState<{ bpm: number; source: string } | null>(null)
  const [bpmError, setBpmError] = useState<string | null>(null)

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
      setTimeout(() => setCopyState("idle"), 2000)
    } catch {
      setCopyState("error")
      setTimeout(() => setCopyState("idle"), 3000)
    }
  }, [copyState, onCopyFromTurso, track, onRefresh])

  // Handle Fetch BPM with streaming
  const handleFetchBpm = useCallback(async () => {
    if (bpmFetchState === "fetching") return

    setBpmFetchState("fetching")
    setProviders(PROVIDER_NAMES.map(name => ({ name, status: "pending" })))
    setBpmResult(null)
    setBpmError(null)

    try {
      const response = await fetch(`/api/admin/tracks/${track.lrclibId}/fetch-bpm/stream`)

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Failed to fetch BPM")
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const event = JSON.parse(line.slice(6)) as ProviderEvent

          if (event.type === "provider_start" && event.provider) {
            setProviders(prev =>
              prev.map(p => (p.name === event.provider ? { ...p, status: "loading" } : p)),
            )
          }

          if (event.type === "provider_result" && event.provider) {
            setProviders(prev =>
              prev.map(p =>
                p.name === event.provider
                  ? {
                      ...p,
                      status: event.success ? "success" : "error",
                      ...(event.bpm !== undefined && { bpm: event.bpm }),
                      ...(event.error !== undefined && { error: event.error }),
                      ...(event.latencyMs !== undefined && { latencyMs: event.latencyMs }),
                    }
                  : p,
              ),
            )
          }

          if (event.type === "complete") {
            setBpmFetchState("complete")
            if (event.success && event.bpm && event.source) {
              setBpmResult({ bpm: event.bpm, source: event.source })
              onRefresh?.()
            }
          }

          if (event.type === "error") {
            setBpmFetchState("error")
            setBpmError(event.error ?? "Unknown error")
          }
        }
      }
    } catch (err) {
      setBpmFetchState("error")
      setBpmError(err instanceof Error ? err.message : "Unknown error")
    }
  }, [bpmFetchState, track.lrclibId, onRefresh])

  // Reset BPM fetch state
  const handleResetBpmFetch = useCallback(() => {
    setBpmFetchState("idle")
    setProviders([])
    setBpmResult(null)
    setBpmError(null)
  }, [])

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

  // Handle Delete
  const handleDelete = useCallback(async () => {
    if (deleteState === "loading" || !onDelete) return
    if (!window.confirm(`Delete "${track.title}" by ${track.artist} from catalog?`)) return

    setDeleteState("loading")
    try {
      await onDelete(track)
      setDeleteState("success")
      onRefresh?.()
    } catch {
      setDeleteState("error")
      setTimeout(() => setDeleteState("idle"), 3000)
    }
  }, [deleteState, onDelete, track, onRefresh])

  const isBpmFetching = bpmFetchState === "fetching"
  const showBpmProgress = bpmFetchState !== "idle"

  return (
    <div className="space-y-3">
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
          disabled={hasBpm || isBpmFetching}
          state={isBpmFetching ? "loading" : "idle"}
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

        {/* Delete */}
        {onDelete && (
          <>
            <div className="w-px h-8 self-center" style={{ background: "var(--color-border)" }} />
            <ActionButton
              label="Delete"
              icon={<Trash size={16} weight="bold" />}
              onClick={handleDelete}
              state={deleteState}
              tooltip="Remove from catalog"
            />
          </>
        )}
      </div>

      {/* BPM Fetch Progress Panel */}
      {showBpmProgress && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "var(--color-text3)" }}>
              Provider Cascade
            </span>
            {bpmFetchState !== "fetching" && (
              <button
                type="button"
                onClick={handleResetBpmFetch}
                className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125"
                style={{ background: "var(--color-surface2)", color: "var(--color-text-muted)" }}
              >
                Dismiss
              </button>
            )}
          </div>

          <div className="space-y-1">
            {providers.map(provider => (
              <ProviderRow key={provider.name} provider={provider} />
            ))}
          </div>

          {bpmFetchState === "complete" && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
              style={{
                background: bpmResult ? "var(--color-success-soft)" : "var(--color-surface2)",
              }}
            >
              {bpmResult ? (
                <>
                  <Check size={14} weight="bold" style={{ color: "var(--color-success)" }} />
                  <span className="flex-1" style={{ color: "var(--color-success)" }}>
                    Found: {bpmResult.bpm} BPM ({bpmResult.source})
                  </span>
                  <CopyBpmButton bpm={bpmResult.bpm} />
                </>
              ) : (
                <>
                  <X size={14} weight="bold" style={{ color: "var(--color-text-muted)" }} />
                  <span style={{ color: "var(--color-text-muted)" }}>No BPM found</span>
                </>
              )}
            </div>
          )}

          {bpmFetchState === "error" && bpmError && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
              style={{ background: "var(--color-danger-soft)" }}
            >
              <X size={14} weight="bold" style={{ color: "var(--color-danger)" }} />
              <span style={{ color: "var(--color-danger)" }}>{bpmError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
