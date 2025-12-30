"use client"

import { springs } from "@/animations"
import { INPUT_LIMITS } from "@/constants/limits"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { loadPublicConfig } from "@/services/public-config"
import { Bug, CheckCircle, PaperPlaneTilt, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

export interface SongContext {
  readonly title: string
  readonly artist: string
  readonly duration: number
  readonly bpm: number | null
  readonly key: string | null
  readonly spotifyId: string | null
  readonly bpmSource: string | null
  readonly lrclibId?: number | null
  readonly chordsError?: string | null
  readonly chordsErrorUrl?: string | null
  readonly lyricsError?: string | null
  readonly hasEnhancedTiming?: boolean
}

export interface ReportIssueModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly songContext?: SongContext
}

type SubmitState = "idle" | "submitting" | "success" | "error"

const WEB3FORMS_ACCESS_KEY = loadPublicConfig().web3FormsAccessKey

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

const CLOSE_DELAY_SECONDS = 2

export function ReportIssueModal({ isOpen, onClose, songContext }: ReportIssueModalProps) {
  const [description, setDescription] = useState("")
  const [email, setEmail] = useState("")
  const [submitState, setSubmitState] = useState<SubmitState>("idle")
  const [closeCountdown, setCloseCountdown] = useState(CLOSE_DELAY_SECONDS)

  const hasMissingBpm = songContext && !songContext.bpm
  const hasChordsError = songContext?.chordsError
  const hasLyricsError = songContext?.lyricsError
  const hasKnownIssue = hasMissingBpm || hasChordsError || hasLyricsError
  const isDescriptionRequired = !hasKnownIssue

  const displayTitle = useMemo(
    () => (songContext ? normalizeTrackName(songContext.title) : ""),
    [songContext],
  )
  const displayArtist = useMemo(
    () => (songContext ? normalizeArtistName(songContext.artist) : ""),
    [songContext],
  )

  useEffect(() => {
    if (submitState !== "success") {
      setCloseCountdown(CLOSE_DELAY_SECONDS)
      return
    }

    if (closeCountdown <= 0) {
      onClose()
      setSubmitState("idle")
      return
    }

    const timer = setTimeout(() => {
      setCloseCountdown(c => c - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [submitState, closeCountdown, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isDescriptionRequired && !description.trim()) return

      setSubmitState("submitting")

      const pageUrl = typeof window !== "undefined" ? window.location.href : ""

      const defaultDescription = hasMissingBpm
        ? "Missing BPM data"
        : hasChordsError
          ? `Chords error: ${songContext?.chordsError}`
          : hasLyricsError
            ? `Lyrics error: ${songContext?.lyricsError}`
            : ""
      const formData: Record<string, string> = {
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: songContext
          ? `[ScrollTunes] Issue: ${songContext.title} - ${songContext.artist}`
          : "[ScrollTunes] Issue Report",
        from_name: "ScrollTunes Bug Reporter",
        url: pageUrl,
        description: description.trim() || defaultDescription,
      }

      if (email.trim()) {
        formData.email = email.trim()
      }

      if (songContext) {
        formData.song_title_original = songContext.title
        formData.song_title_normalized = displayTitle
        formData.song_artist_original = songContext.artist
        formData.song_artist_normalized = displayArtist
        formData.song_duration = formatDuration(songContext.duration)
        formData.spotify_id = songContext.spotifyId ?? "N/A"
        formData.bpm = songContext.bpm?.toString() ?? "Missing"
        formData.key = songContext.key ?? "Missing"
        formData.bpm_source = songContext.bpmSource ?? "N/A"
        formData.lrclib_id = songContext.lrclibId?.toString() ?? "N/A"
        formData.chords_error = songContext.chordsError ?? "N/A"
        if (songContext.chordsErrorUrl) {
          formData.chords_error_url = songContext.chordsErrorUrl
        }
        formData.enhanced_timing = songContext.hasEnhancedTiming ? "Yes" : "No"
      }

      try {
        const response = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        })

        if (response.ok) {
          setSubmitState("success")
          setDescription("")
          setEmail("")
        } else {
          setSubmitState("error")
        }
      } catch {
        setSubmitState("error")
      }
    },
    [
      description,
      email,
      songContext,
      isDescriptionRequired,
      hasMissingBpm,
      hasChordsError,
      hasLyricsError,
      hasKnownIssue,
      displayTitle,
      displayArtist,
    ],
  )

  const handleClose = useCallback(() => {
    if (submitState !== "submitting") {
      onClose()
      setSubmitState("idle")
      setDescription("")
      setEmail("")
    }
  }, [submitState, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className="relative w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 shadow-xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={springs.default}
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Bug size={20} className="text-amber-500" />
                <h2 className="text-lg font-semibold text-white">Report an Issue</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                aria-label="Close"
                disabled={submitState === "submitting"}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {songContext && (
                <div className="rounded-lg bg-neutral-800/50 p-3 text-sm">
                  <div className="text-neutral-400 mb-1">Reporting issue for:</div>
                  <div className="text-white font-medium">{displayTitle}</div>
                  <div className="text-neutral-500">{displayArtist}</div>
                  {!songContext.bpm && (
                    <div className="mt-2 text-amber-500 text-xs">⚠ BPM data is missing</div>
                  )}
                  {songContext.chordsError && (
                    <div className="mt-2 text-amber-500 text-xs">
                      ⚠ Chords error: {songContext.chordsError}
                    </div>
                  )}
                  {songContext.lyricsError && (
                    <div className="mt-2 text-amber-500 text-xs">
                      ⚠ Lyrics error: {songContext.lyricsError}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="description" className="block text-sm text-neutral-400 mb-1">
                  {isDescriptionRequired ? "Describe the issue *" : "Additional details (optional)"}
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={hasKnownIssue ? "Any additional context..." : "What went wrong?"}
                  rows={4}
                  required={isDescriptionRequired}
                  disabled={submitState === "submitting"}
                  maxLength={INPUT_LIMITS.REPORT_DESCRIPTION}
                  className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm text-neutral-400 mb-1">
                  Email (optional, for follow-up)
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={submitState === "submitting"}
                  maxLength={INPUT_LIMITS.EMAIL}
                  className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-white placeholder-neutral-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              {submitState === "error" && (
                <div className="text-red-400 text-sm">Failed to submit. Please try again.</div>
              )}

              {submitState === "success" && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, ease: "linear" }}
                  >
                    <CheckCircle size={18} weight="bold" />
                  </motion.div>
                  <span>Thank you! Your report has been submitted.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitState === "submitting" || (isDescriptionRequired && !description.trim())
                }
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:cursor-not-allowed px-4 py-2.5 text-white font-medium transition-colors"
              >
                {submitState === "submitting" ? (
                  "Submitting..."
                ) : (
                  <>
                    <PaperPlaneTilt size={18} />
                    Submit Report
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
