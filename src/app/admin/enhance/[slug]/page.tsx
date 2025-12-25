"use client"

import { springs } from "@/animations"
import { AlignmentPreview } from "@/components/admin/AlignmentPreview"
import { GpUploader } from "@/components/admin/GpUploader"
import { useAccount, useIsAdmin } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import type { LyricSyllable, WordPatch, WordTiming } from "@/lib/gp"
import { ArrowLeft, Check, ClipboardText, ShieldWarning, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { use, useCallback, useEffect, useMemo, useState } from "react"

interface SongInfo {
  songId: string
  title: string
  artist: string
  hasEnhancement: boolean
}

interface GpExtractedData {
  meta: { title: string; artist: string; album?: string | undefined }
  wordTimings: WordTiming[]
  syllables: LyricSyllable[]
}

interface AlignmentResult {
  patches: WordPatch[]
  payload: EnhancementPayload
  coverage: number
}

type PageState = "loading" | "error" | "ready" | "submitting" | "success"

/**
 * Format milliseconds as mm:ss.xx
 */
function formatTimeMs(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`
}

/**
 * Generate Enhanced LRC format with word-level timing
 * Format: [mm:ss.xx] <mm:ss.xx> word1 <mm:ss.xx> word2 ...
 * Where word timestamps are relative to line start
 */
function generateEnhancedLrc(lrcContent: string, payload: EnhancementPayload): string {
  const lines = lrcContent.split("\n")
  const lineRegex = /^\[(\d{2}:\d{2}\.\d{2,3})\]\s*(.*)$/
  const enhancedLines: string[] = []

  // Build a map of line index -> word timings
  const lineTimings = new Map<number, Map<number, { start: number; dur: number }>>()
  for (const line of payload.lines) {
    const wordMap = new Map<number, { start: number; dur: number }>()
    for (const word of line.words) {
      wordMap.set(word.idx, { start: word.start, dur: word.dur })
    }
    lineTimings.set(line.idx, wordMap)
  }

  let lineIndex = 0
  for (const line of lines) {
    const match = line.match(lineRegex)
    if (!match) {
      enhancedLines.push(line)
      continue
    }

    const [, timestamp, text] = match
    const trimmedText = text?.trim() ?? ""

    if (!trimmedText) {
      enhancedLines.push(line)
      lineIndex++
      continue
    }

    const wordTimingsForLine = lineTimings.get(lineIndex)
    if (!wordTimingsForLine || wordTimingsForLine.size === 0) {
      enhancedLines.push(line)
      lineIndex++
      continue
    }

    // Split text into words and build enhanced format
    const words = trimmedText.split(/\s+/)
    const enhancedWords: string[] = []

    for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
      const word = words[wordIdx]
      const timing = wordTimingsForLine.get(wordIdx)

      if (timing && word) {
        // Format: <mm:ss.xx> word (time relative to line start)
        enhancedWords.push(`<${formatTimeMs(timing.start)}> ${word}`)
      } else if (word) {
        enhancedWords.push(word)
      }
    }

    enhancedLines.push(`[${timestamp}] ${enhancedWords.join(" ")}`)
    lineIndex++
  }

  return enhancedLines.join("\n")
}

function EnhancedLrcView({
  lrcContent,
  payload,
}: {
  lrcContent: string
  payload: EnhancementPayload
}) {
  const [copied, setCopied] = useState(false)
  const enhancedLrc = useMemo(() => generateEnhancedLrc(lrcContent, payload), [lrcContent, payload])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(enhancedLrc)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [enhancedLrc])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="rounded-xl bg-neutral-900 p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Enhanced LRC Preview</h2>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition-colors"
        >
          <ClipboardText size={14} />
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>
      <pre className="text-xs text-neutral-400 bg-neutral-950 rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono">
        {enhancedLrc}
      </pre>
      <p className="text-xs text-neutral-500 mt-2">
        Format: [line_time] &lt;word_offset&gt; word ... (offsets relative to line start)
      </p>
    </motion.div>
  )
}

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/admin/songs"
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back to Songs</span>
        </Link>
      </div>
    </header>
  )
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
            <ShieldWarning size={32} className="text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="text-neutral-400 mb-6">You don't have permission to view this page</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Go home
          </Link>
        </motion.div>
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-40 bg-neutral-800 rounded animate-pulse mb-2" />
            <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function EnhancePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const lrclibId = Number.parseInt(slug, 10)

  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()

  const [pageState, setPageState] = useState<PageState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [songInfo, setSongInfo] = useState<SongInfo | null>(null)
  const [lrcContent, setLrcContent] = useState<string | null>(null)
  const [gpData, setGpData] = useState<GpExtractedData | null>(null)
  const [alignmentResult, setAlignmentResult] = useState<AlignmentResult | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    if (Number.isNaN(lrclibId)) {
      setError("Invalid song ID")
      setPageState("error")
      return
    }

    async function loadSongData() {
      try {
        // Fetch LRC data first (this always works if the LRCLIB ID exists)
        const lrcResponse = await fetch(`/api/admin/lrc/${lrclibId}`)

        if (!lrcResponse.ok) {
          const errorData = (await lrcResponse.json()) as { error: string }
          throw new Error(errorData.error || "Failed to fetch LRCLIB lyrics")
        }

        const lrcData = (await lrcResponse.json()) as {
          id: number
          title: string
          artist: string
          album: string | null
          syncedLyrics: string | null
          alternativeId: number | null
        }

        if (!lrcData.syncedLyrics) {
          setError("No synced lyrics available for this song")
          setPageState("error")
          return
        }

        setLrcContent(lrcData.syncedLyrics)

        // Try to look up existing catalog entry
        const songResponse = await fetch(`/api/songs/upsert?lrclibId=${lrclibId}`)
        if (songResponse.ok) {
          const songData = (await songResponse.json()) as
            | { found: false }
            | {
                found: true
                songId: string
                title: string
                artist: string
                hasEnhancement: boolean
              }

          if (songData.found) {
            setSongInfo({
              songId: songData.songId,
              title: songData.title,
              artist: songData.artist,
              hasEnhancement: songData.hasEnhancement,
            })
          } else {
            // Song not in catalog yet - use LRC data
            setSongInfo({
              songId: "", // Will be created on save
              title: lrcData.title,
              artist: lrcData.artist,
              hasEnhancement: false,
            })
          }
        } else {
          // Lookup failed - use LRC data
          setSongInfo({
            songId: "", // Will be created on save
            title: lrcData.title,
            artist: lrcData.artist,
            hasEnhancement: false,
          })
        }

        setPageState("ready")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load song data")
        setPageState("error")
      }
    }

    loadSongData()
  }, [isAuthenticated, isAdmin, lrclibId])

  const handleGpExtracted = useCallback((data: GpExtractedData) => {
    setGpData(data)
    setAlignmentResult(null)
  }, [])

  const handleAlignmentComplete = useCallback((result: AlignmentResult) => {
    setAlignmentResult(result)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!songInfo || !lrcContent || !alignmentResult) return

    setPageState("submitting")
    setError(null)

    try {
      const response = await fetch("/api/admin/lrc/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId: songInfo.songId,
          lrclibId,
          baseLrc: lrcContent,
          payload: alignmentResult.payload,
          coverage: alignmentResult.coverage,
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error: string }
        throw new Error(data.error || "Failed to save enhancement")
      }

      setPageState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save enhancement")
      setPageState("ready")
    }
  }, [songInfo, lrcContent, alignmentResult, lrclibId])

  if (isAuthLoading || (pageState === "loading" && isAuthenticated && isAdmin)) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold mb-1">Enhance Lyrics</h1>
            <p className="text-neutral-400">Add word-level timing from Guitar Pro</p>
          </motion.div>

          {pageState === "error" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.default}
              className="rounded-xl bg-red-900/30 border border-red-700/50 p-6 mb-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <Warning size={24} weight="fill" className="text-red-400" />
                <h2 className="text-lg font-medium text-red-400">Error</h2>
              </div>
              <p className="text-red-200">{error}</p>
              <Link
                href="/admin/songs"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Songs
              </Link>
            </motion.div>
          )}

          {pageState === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springs.default}
              className="rounded-xl bg-emerald-900/30 border border-emerald-700/50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check size={24} weight="bold" className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-emerald-400">Enhancement Saved</h2>
                  <p className="text-emerald-200/70">
                    Word timings for "{songInfo?.title}" have been saved
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/admin/songs"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back to Songs
                </Link>
                <Link
                  href={`/s/${lrclibId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  View Song
                </Link>
              </div>
            </motion.div>
          )}

          {(pageState === "ready" || pageState === "submitting") && songInfo && (
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.1 }}
                className="rounded-xl bg-neutral-900 p-5"
              >
                <h2 className="text-lg font-medium mb-3">Song Info</h2>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Title</span>
                    <span className="text-white font-medium">{songInfo.title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Artist</span>
                    <span className="text-white">{songInfo.artist}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">LRCLIB ID</span>
                    <span className="text-neutral-500 font-mono text-sm">{lrclibId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Status</span>
                    {songInfo.hasEnhancement ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <Check size={16} weight="bold" />
                        Has enhancement
                      </span>
                    ) : (
                      <span className="text-amber-400">No enhancement</span>
                    )}
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.2 }}
              >
                <h2 className="text-lg font-medium mb-3">Upload Guitar Pro File</h2>
                <GpUploader onExtracted={handleGpExtracted} disabled={pageState === "submitting"} />
              </motion.div>

              {gpData && lrcContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.default}
                >
                  <AlignmentPreview
                    gpWords={gpData.wordTimings}
                    lrcContent={lrcContent}
                    onAlignmentComplete={handleAlignmentComplete}
                    disabled={pageState === "submitting"}
                  />
                </motion.div>
              )}

              {alignmentResult && lrcContent && (
                <>
                  <EnhancedLrcView lrcContent={lrcContent} payload={alignmentResult.payload} />
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springs.default}
                    className="flex flex-col gap-3"
                  >
                    {error && (
                      <div className="rounded-lg bg-red-900/30 border border-red-700/50 p-3">
                        <p className="text-sm text-red-200">{error}</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={pageState === "submitting"}
                      className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pageState === "submitting"
                        ? "Saving..."
                        : `Save Enhancement (${alignmentResult.coverage.toFixed(1)}% coverage)`}
                    </button>
                  </motion.div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
