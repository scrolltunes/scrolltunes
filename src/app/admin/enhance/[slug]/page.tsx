"use client"

import { springs } from "@/animations"
import { AlignmentPreview } from "@/components/admin/AlignmentPreview"
import { GpUploader } from "@/components/admin/GpUploader"
import { useAccount, useIsAdmin } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import { generateEnhancedLrc } from "@/lib/gp"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath } from "@/lib/slug"
import type { LyricSyllable, WordPatch, WordTiming } from "@/lib/gp"
import { ArrowLeft, Check, ClipboardText, ShieldWarning, Trash, Warning } from "@phosphor-icons/react"
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

function EnhancedLrcView({
  lrcContent,
  payload,
}: {
  lrcContent: string
  payload: EnhancementPayload
}) {
  const [copied, setCopied] = useState(false)
  const [showEnhanced, setShowEnhanced] = useState(true)
  const enhancedLrc = useMemo(() => generateEnhancedLrc(lrcContent, payload), [lrcContent, payload])

  const displayContent = showEnhanced ? enhancedLrc : lrcContent

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(displayContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayContent])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="rounded-xl bg-neutral-900 p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">LRC Preview</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setShowEnhanced(false)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                !showEnhanced
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:text-neutral-300"
              }`}
            >
              Plain
            </button>
            <button
              type="button"
              onClick={() => setShowEnhanced(true)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                showEnhanced
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:text-neutral-300"
              }`}
            >
              Enhanced
            </button>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition-colors"
          >
            <ClipboardText size={14} />
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>
      <pre className="text-xs text-neutral-400 bg-neutral-950 rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono">
        {displayContent}
      </pre>
      {showEnhanced && (
        <p className="text-xs text-neutral-500 mt-2">
          Format: [line_time] &lt;absolute_time&gt;word ... (word times are absolute, not offsets)
        </p>
      )}
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
  const [existingEnhancement, setExistingEnhancement] = useState<{
    payload: EnhancementPayload
    coverage: number
  } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemoveEnhancement = useCallback(async () => {
    if (!songInfo?.songId || !confirm("Remove enhancement for this song?")) return

    setIsRemoving(true)
    try {
      const response = await fetch("/api/admin/lrc/enhance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: songInfo.songId, lrclibId }),
      })
      if (response.ok) {
        setExistingEnhancement(null)
        setSongInfo(prev => (prev ? { ...prev, hasEnhancement: false } : null))
      }
    } finally {
      setIsRemoving(false)
    }
  }, [songInfo?.songId, lrclibId])

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

            // If song has enhancement, load it
            if (songData.hasEnhancement) {
              const enhanceResponse = await fetch(
                `/api/admin/lrc/enhance?lrclibId=${lrclibId}`,
              )
              if (enhanceResponse.ok) {
                const enhanceData = (await enhanceResponse.json()) as
                  | { found: false }
                  | {
                      found: true
                      enhancement: {
                        payload: EnhancementPayload
                        coverage: number
                      }
                    }
                if (enhanceData.found) {
                  setExistingEnhancement({
                    payload: enhanceData.enhancement.payload,
                    coverage: enhanceData.enhancement.coverage,
                  })
                }
              }
            }
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

      // Update localStorage cache with enhancement so song page shows it immediately
      const cached = loadCachedLyrics(lrclibId)
      if (cached) {
        saveCachedLyrics(lrclibId, {
          ...cached,
          hasEnhancement: true,
          enhancement: alignmentResult.payload,
        })
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
                  href={makeCanonicalPath({
                    id: lrclibId,
                    title: songInfo?.title ?? "",
                    artist: songInfo?.artist ?? "",
                  })}
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
                    <a
                      href={`https://lrclib.net/api/get/${lrclibId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 font-mono text-sm transition-colors"
                    >
                      {lrclibId}
                    </a>
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

              {existingEnhancement && lrcContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.default, delay: 0.15 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-medium">Current Enhancement</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-neutral-400">
                        Coverage: {Math.round(existingEnhancement.coverage * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveEnhancement}
                        disabled={isRemoving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50"
                      >
                        <Trash size={14} />
                        <span>{isRemoving ? "Removing..." : "Remove"}</span>
                      </button>
                    </div>
                  </div>
                  <EnhancedLrcView lrcContent={lrcContent} payload={existingEnhancement.payload} />
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.2 }}
              >
                <h2 className="text-lg font-medium mb-3">
                  {existingEnhancement ? "Replace Enhancement" : "Upload Guitar Pro File"}
                </h2>
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
