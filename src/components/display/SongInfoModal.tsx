"use client"

import { springs } from "@/animations"
import { ReportIssueModal } from "@/components/feedback"
import { Bug, SpotifyLogo, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useState } from "react"

export interface SongInfoModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly artist: string
  readonly duration: number
  readonly bpm: number | null
  readonly musicalKey: string | null
  readonly spotifyId: string | null
  readonly bpmSource: string | null
  readonly albumArt: string | null
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
  albumArt,
}: SongInfoModalProps) {
  const [showReportModal, setShowReportModal] = useState(false)

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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={springs.default}
              className="relative mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl"
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>

              <div className="mb-4 flex gap-4 pr-8">
                {albumArt && (
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                    <img
                      src={albumArt}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">{title}</h2>
                  <p className="text-neutral-400">{artist}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Duration</span>
                  <span className="text-white">{formatDuration(duration)}</span>
                </div>

                {bpm !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">BPM</span>
                    <span className="text-white">
                      {bpm}
                      {bpmSource && <span className="ml-1 text-neutral-500">via {bpmSource}</span>}
                    </span>
                  </div>
                )}

                {musicalKey !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Key</span>
                    <span className="text-white">{musicalKey}</span>
                  </div>
                )}

                {spotifyId !== null && (
                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <a
                      href={`https://open.spotify.com/track/${spotifyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-white transition-colors hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <SpotifyLogo size={20} weight="fill" />
                      Open in Spotify
                    </a>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
          bpmSource,
        }}
      />
    </>
  )
}
