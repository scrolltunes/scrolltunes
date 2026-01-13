"use client"

import { springs } from "@/animations"
import { CheckCircle, Clock, MusicNoteSimple, Spinner, X, XCircle } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

interface SongDetailAttempt {
  id: number
  stage: string
  provider: string
  success: boolean
  bpm: number | null
  errorReason: string | null
  errorDetail: string | null
  latencyMs: number | null
  createdAt: string
}

export interface BpmSongDetailProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly lrclibId: number | null
  readonly title: string
  readonly artist: string
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatStage(stage: string): string {
  return stage
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function formatErrorReason(reason: string | null): string {
  if (!reason) return "Unknown"
  return reason
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function BpmSongDetail({ isOpen, onClose, lrclibId, title, artist }: BpmSongDetailProps) {
  const [attempts, setAttempts] = useState<SongDetailAttempt[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAttempts = useCallback(async (id: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/bpm-stats?section=songDetail&lrclibId=${id}`)
      if (!response.ok) {
        throw new Error("Failed to fetch song attempts")
      }
      const result = (await response.json()) as SongDetailAttempt[]
      setAttempts(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && lrclibId !== null) {
      fetchAttempts(lrclibId)
    } else if (!isOpen) {
      setAttempts([])
      setError(null)
    }
  }, [isOpen, lrclibId, fetchAttempts])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const successCount = attempts.filter(a => a.success).length
  const failureCount = attempts.filter(a => !a.success).length

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "var(--color-surface1)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 p-4 flex items-start gap-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--color-surface2)" }}
              >
                <MusicNoteSimple size={20} style={{ color: "var(--color-accent)" }} />
              </div>
              <div className="flex-1 min-w-0 pr-8">
                <h2 className="font-semibold truncate" style={{ color: "var(--color-text)" }}>
                  {title}
                </h2>
                <p className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>
                  {artist}
                </p>
                {lrclibId !== null && (
                  <p className="text-xs mt-1 tabular-nums" style={{ color: "var(--color-text3)" }}>
                    LRCLIB #{lrclibId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:brightness-110"
                style={{ color: "var(--color-text3)" }}
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            {/* Summary */}
            {attempts.length > 0 && (
              <div
                className="flex-shrink-0 p-3 flex items-center gap-4 text-sm"
                style={{ background: "var(--color-surface2)" }}
              >
                <span className="flex items-center gap-1.5" style={{ color: "var(--color-text)" }}>
                  <Clock size={16} />
                  {attempts.length} attempt{attempts.length !== 1 ? "s" : ""}
                </span>
                {successCount > 0 && (
                  <span
                    className="flex items-center gap-1.5"
                    style={{ color: "var(--color-success)" }}
                  >
                    <CheckCircle size={16} weight="fill" />
                    {successCount} success
                  </span>
                )}
                {failureCount > 0 && (
                  <span
                    className="flex items-center gap-1.5"
                    style={{ color: "var(--color-error)" }}
                  >
                    <XCircle size={16} weight="fill" />
                    {failureCount} failed
                  </span>
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3">
                  <Spinner
                    size={32}
                    className="animate-spin"
                    style={{ color: "var(--color-accent)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Loading attempts...
                  </p>
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p style={{ color: "var(--color-error)" }}>{error}</p>
                </div>
              ) : attempts.length === 0 ? (
                <div className="p-8 text-center">
                  <p style={{ color: "var(--color-text-muted)" }}>
                    No BPM fetch attempts recorded for this song
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {attempts.map((attempt, index) => (
                    <motion.div
                      key={attempt.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springs.default, delay: index * 0.03 }}
                      className="p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {attempt.success ? (
                            <CheckCircle
                              size={18}
                              weight="fill"
                              style={{ color: "var(--color-success)" }}
                            />
                          ) : (
                            <XCircle
                              size={18}
                              weight="fill"
                              style={{ color: "var(--color-error)" }}
                            />
                          )}
                          <span
                            className="font-medium text-sm"
                            style={{ color: "var(--color-text)" }}
                          >
                            {attempt.provider}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              background: "var(--color-surface2)",
                              color: "var(--color-text2)",
                            }}
                          >
                            {formatStage(attempt.stage)}
                          </span>
                        </div>
                        <span
                          className="text-xs tabular-nums whitespace-nowrap"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {formatTimestamp(attempt.createdAt)}
                        </span>
                      </div>

                      <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {attempt.success && attempt.bpm !== null && (
                          <span style={{ color: "var(--color-text)" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>BPM:</span>{" "}
                            <span className="font-medium tabular-nums">{attempt.bpm}</span>
                          </span>
                        )}
                        {attempt.latencyMs !== null && (
                          <span style={{ color: "var(--color-text-muted)" }}>
                            {attempt.latencyMs}ms
                          </span>
                        )}
                        {!attempt.success && attempt.errorReason && (
                          <span
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              background: "var(--color-error-bg)",
                              color: "var(--color-error)",
                            }}
                          >
                            {formatErrorReason(attempt.errorReason)}
                          </span>
                        )}
                      </div>

                      {!attempt.success && attempt.errorDetail && (
                        <p
                          className="ml-6 mt-2 text-xs break-words"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {attempt.errorDetail}
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
