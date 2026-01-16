"use client"

import { Check, Copy, Lightning, Spinner, X } from "@phosphor-icons/react"
import { useCallback, useRef, useState } from "react"

// ============================================================================
// Types
// ============================================================================

interface ProviderEvent {
  type: "provider_start" | "provider_result" | "complete" | "error"
  provider?: string
  success?: boolean
  bpm?: number
  error?: string
  latencyMs?: number
  source?: string
}

interface ProviderStatus {
  name: string
  status: "pending" | "loading" | "success" | "error"
  bpm?: number
  error?: string
  latencyMs?: number
}

type FetchState = "idle" | "fetching" | "complete" | "error"

interface BpmFetchPanelProps {
  lrclibId: number
  hasBpm: boolean
  onBpmFetched?: (bpm: number, source: string) => void
}

// Known providers in order
const PROVIDER_NAMES = ["GetSongBPM", "Deezer"]

// ============================================================================
// Component
// ============================================================================

export function BpmFetchPanel({ lrclibId, hasBpm, onBpmFetched }: BpmFetchPanelProps) {
  const [fetchState, setFetchState] = useState<FetchState>("idle")
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [result, setResult] = useState<{ bpm: number; source: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopyBpm = useCallback(() => {
    if (!result) return
    navigator.clipboard.writeText(String(result.bpm))
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [result])

  const handleFetch = useCallback(async () => {
    setFetchState("fetching")
    setProviders(PROVIDER_NAMES.map(name => ({ name, status: "pending" })))
    setResult(null)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/admin/tracks/${lrclibId}/fetch-bpm/stream`)

      if (!response.ok) {
        const data = await response.json()
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
            setFetchState("complete")
            if (event.success && event.bpm && event.source) {
              setResult({ bpm: event.bpm, source: event.source })
              onBpmFetched?.(event.bpm, event.source)
            }
          }

          if (event.type === "error") {
            setFetchState("error")
            setErrorMessage(event.error ?? "Unknown error")
          }
        }
      }
    } catch (err) {
      setFetchState("error")
      setErrorMessage(err instanceof Error ? err.message : "Unknown error")
    }
  }, [lrclibId, onBpmFetched])

  const handleReset = useCallback(() => {
    setFetchState("idle")
    setProviders([])
    setResult(null)
    setErrorMessage(null)
    setCopied(false)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
  }, [])

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <Lightning size={20} weight="fill" style={{ color: "var(--color-warning)" }} />
          Fetch BPM from Providers
        </h2>
        {fetchState !== "idle" && (
          <button
            type="button"
            onClick={handleReset}
            className="text-sm px-3 py-1 rounded-lg transition-colors hover:brightness-125"
            style={{ background: "var(--color-surface2)", color: "var(--color-text3)" }}
          >
            Reset
          </button>
        )}
      </div>

      {hasBpm && fetchState === "idle" && (
        <div
          className="p-3 rounded-lg mb-4"
          style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
        >
          This track already has a BPM value. Fetching will overwrite it.
        </div>
      )}

      {fetchState === "idle" ? (
        <button
          type="button"
          onClick={handleFetch}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors hover:brightness-110"
          style={{ background: "var(--color-accent)", color: "white" }}
        >
          <Lightning size={18} weight="fill" />
          Start Fetch
        </button>
      ) : (
        <div className="space-y-3">
          {providers.map(provider => (
            <ProviderRow key={provider.name} provider={provider} />
          ))}

          {fetchState === "complete" && (
            <div
              className="mt-4 p-4 rounded-lg"
              style={{
                background: result ? "var(--color-success-soft)" : "var(--color-surface2)",
                border: `1px solid ${result ? "var(--color-success)" : "var(--color-border)"}`,
              }}
            >
              {result ? (
                <div className="flex items-center gap-3">
                  <Check
                    size={24}
                    weight="bold"
                    className="shrink-0"
                    style={{ color: "var(--color-success)" }}
                  />
                  <div className="flex-1">
                    <p className="font-medium" style={{ color: "var(--color-success)" }}>
                      BPM Found: {result.bpm}
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-text3)" }}>
                      Source: {result.source}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyBpm}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors hover:brightness-110"
                    style={{
                      background: copied ? "var(--color-success)" : "var(--color-accent)",
                      color: "white",
                    }}
                    aria-label="Copy BPM value"
                  >
                    {copied ? (
                      <>
                        <Check size={16} weight="bold" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={16} weight="bold" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <X
                    size={24}
                    weight="bold"
                    className="shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                  <p style={{ color: "var(--color-text-muted)" }}>No BPM found from any provider</p>
                </div>
              )}
            </div>
          )}

          {fetchState === "error" && errorMessage && (
            <div
              className="mt-4 p-4 rounded-lg"
              style={{
                background: "var(--color-danger-soft)",
                border: "1px solid var(--color-danger)",
              }}
            >
              <p style={{ color: "var(--color-danger)" }}>{errorMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Provider Row
// ============================================================================

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{ background: "var(--color-surface2)" }}
    >
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {provider.status === "pending" && (
          <div className="w-2 h-2 rounded-full" style={{ background: "var(--color-text-muted)" }} />
        )}
        {provider.status === "loading" && (
          <Spinner size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        )}
        {provider.status === "success" && (
          <Check size={20} weight="bold" style={{ color: "var(--color-success)" }} />
        )}
        {provider.status === "error" && (
          <X size={20} weight="bold" style={{ color: "var(--color-danger)" }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span className="font-medium">{provider.name}</span>
        {provider.status === "success" && provider.bpm && (
          <span className="ml-2 text-sm" style={{ color: "var(--color-success)" }}>
            {provider.bpm} BPM
          </span>
        )}
        {provider.status === "error" && provider.error && (
          <span className="ml-2 text-sm" style={{ color: "var(--color-danger)" }}>
            {provider.error}
          </span>
        )}
      </div>

      {provider.latencyMs !== undefined && (
        <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {provider.latencyMs}ms
        </span>
      )}
    </div>
  )
}
