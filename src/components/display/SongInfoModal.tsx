"use client"

import { springs } from "@/animations"
import { ReportIssueModal } from "@/components/feedback"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { Bug, Sparkle, SpotifyLogo, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useMemo, useState } from "react"

export interface AttributionSource {
  readonly name: string
  readonly url: string
}

export interface SongInfoModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly artist: string
  readonly duration: number
  readonly bpm: number | null
  readonly musicalKey: string | null
  readonly spotifyId: string | null
  readonly bpmSource: AttributionSource | null
  readonly lyricsSource: AttributionSource | null
  readonly albumArt: string | null
  readonly hasEnhancedTiming?: boolean
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function SongInfoModal({
  isOpen,
  onClose,
  title,
  artist,
  duration,
  bpm,
  musicalKey,
  spotifyId,
  bpmSource,
  lyricsSource,
  albumArt,
  hasEnhancedTiming = false,
}: SongInfoModalProps) {
  const [showReportModal, setShowReportModal] = useState(false)

  const displayTitle = useMemo(() => normalizeTrackName(title), [title])
  const displayArtist = useMemo(() => normalizeArtistName(artist), [artist])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
            style={{ background: "rgba(0, 0, 0, 0.6)" }}
            onClick={handleBackdropClick}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={springs.default}
              className="relative mx-4 w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "var(--color-surface1)",
                border: "1px solid var(--color-border)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                style={{ color: "var(--color-text3)" }}
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>

              <div className="mb-4 flex gap-4 pr-8">
                {albumArt && (
                  <div
                    className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg"
                    style={{ background: "var(--color-surface2)" }}
                  >
                    <img src={albumArt} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    {displayTitle}
                  </h2>
                  <p style={{ color: "var(--color-text3)" }}>{displayArtist}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--color-text3)" }}>Duration</span>
                  <span style={{ color: "var(--color-text)" }}>{formatDuration(duration)}</span>
                </div>

                {bpm !== null && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: "var(--color-text3)" }}>BPM</span>
                    <span style={{ color: "var(--color-text)" }}>{bpm}</span>
                  </div>
                )}

                {musicalKey !== null && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: "var(--color-text3)" }}>Key</span>
                    <span style={{ color: "var(--color-text)" }}>{musicalKey}</span>
                  </div>
                )}

                {hasEnhancedTiming && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: "var(--color-text3)" }}>Word timing</span>
                    <span
                      className="flex items-center gap-1.5"
                      style={{ color: "var(--color-chord)" }}
                    >
                      <Sparkle size={16} weight="fill" />
                      Enhanced
                    </span>
                  </div>
                )}

                {spotifyId !== null && (
                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <a
                      href={`https://open.spotify.com/track/${spotifyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                      style={{
                        background: "var(--color-spotify-soft)",
                        color: "var(--color-spotify)",
                      }}
                    >
                      <SpotifyLogo size={20} weight="fill" />
                      Open in Spotify
                    </a>
                  </div>
                )}

                {(lyricsSource || bpmSource) && (
                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {lyricsSource && (
                        <>
                          Lyrics from{" "}
                          <a
                            href={lyricsSource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline transition-colors"
                            style={{ color: "var(--color-text3)" }}
                          >
                            {lyricsSource.name}
                          </a>
                        </>
                      )}
                      {lyricsSource && bpmSource && " • "}
                      {bpmSource && (
                        <>
                          BPM from{" "}
                          <a
                            href={bpmSource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline transition-colors"
                            style={{ color: "var(--color-text3)" }}
                          >
                            {bpmSource.name}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                )}

                <div
                  className="mt-4 pt-4"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                    style={{
                      background: "var(--color-surface2)",
                      color: "var(--color-text3)",
                    }}
                  >
                    <Bug size={18} />
                    Report an issue
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportIssueModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        songContext={{
          title,
          artist,
          duration,
          bpm,
          key: musicalKey,
          spotifyId,
          bpmSource: bpmSource?.name ?? null,
        }}
      />
    </>
  )
}
