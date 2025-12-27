"use client"

import { springs } from "@/animations"
import { ChordTimingEditor } from "@/components/admin/ChordTimingEditor"
import { type GpExtractedData, GpUploader } from "@/components/admin/GpUploader"
import { WordTimingEditor } from "@/components/admin/WordTimingEditor"
import { useAccount, useIsAdmin } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import {
  type ChordEnhancementPayloadV1,
  type EnhancedChordLine,
  extractExplicitChords,
  generateEnhancedLrc,
} from "@/lib/gp"
import type { WordPatch } from "@/lib/gp"
import { removeCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath } from "@/lib/slug"
import {
  ArrowLeft,
  Check,
  ClipboardText,
  MusicNote,
  ShieldWarning,
  Warning,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { use, useCallback, useEffect, useMemo, useState } from "react"

interface SongInfo {
  songId: string
  title: string
  artist: string
  hasEnhancement: boolean
  hasChordEnhancement: boolean
}

interface AlignmentResult {
  patches: WordPatch[]
  payload: EnhancementPayload
  coverage: number
  syncOffsetMs: number
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
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center">
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
        <div className="max-w-7xl mx-auto">
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

  // GP extracted data (unified)
  const [gpData, setGpData] = useState<GpExtractedData | null>(null)
  const [pendingGpData, setPendingGpData] = useState<GpExtractedData | null>(null)

  // Alignment results
  const [alignmentResult, setAlignmentResult] = useState<AlignmentResult | null>(null)
  const [chordAlignmentResult, setChordAlignmentResult] = useState<{
    lines: EnhancedChordLine[]
    payload: ChordEnhancementPayloadV1
    coverage: number
  } | null>(null)

  // Existing enhancements
  const [existingEnhancement, setExistingEnhancement] = useState<{
    payload: EnhancementPayload
    coverage: number
  } | null>(null)
  const [existingChordEnhancement, setExistingChordEnhancement] = useState<{
    payload: ChordEnhancementPayloadV1
    coverage: number
  } | null>(null)

  const [isRemoving, setIsRemoving] = useState(false)
  const [isRemovingChords, setIsRemovingChords] = useState(false)

  // Edited existing enhancement payloads
  const [editedWordTimingPayload, setEditedWordTimingPayload] = useState<EnhancementPayload | null>(
    null,
  )
  const [isWordTimingDirty, setIsWordTimingDirty] = useState(false)
  const [editedChordPayload, setEditedChordPayload] = useState<ChordEnhancementPayloadV1 | null>(
    null,
  )
  const [isChordDirty, setIsChordDirty] = useState(false)
  const [isSavingExisting, setIsSavingExisting] = useState(false)

  // Derived: does the GP file have chords?
  const hasChords = gpData?.chords !== null && (gpData?.chords?.length ?? 0) > 0

  const handleRemoveEnhancement = useCallback(async () => {
    if (!songInfo?.songId || !confirm("Remove word timing enhancement for this song?")) return

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
        removeCachedLyrics(lrclibId)
      }
    } finally {
      setIsRemoving(false)
    }
  }, [songInfo?.songId, lrclibId])

  const handleRemoveChordEnhancement = useCallback(async () => {
    if (!songInfo?.songId || !confirm("Remove chord enhancement for this song?")) return

    setIsRemovingChords(true)
    try {
      const response = await fetch("/api/admin/chords/enhance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: songInfo.songId, lrclibId }),
      })
      if (response.ok) {
        setExistingChordEnhancement(null)
        setSongInfo(prev => (prev ? { ...prev, hasChordEnhancement: false } : null))
        removeCachedLyrics(lrclibId)
      }
    } finally {
      setIsRemovingChords(false)
    }
  }, [songInfo?.songId, lrclibId])

  const handleExistingWordTimingChange = useCallback(
    (
      payload: EnhancementPayload,
      meta: { isDirty: boolean; coverage: number; syncOffsetMs: number },
    ) => {
      setEditedWordTimingPayload(payload)
      setIsWordTimingDirty(meta.isDirty)
    },
    [],
  )

  const handleChordPayloadChange = useCallback(
    (payload: ChordEnhancementPayloadV1, meta: { isDirty: boolean; coverage: number }) => {
      setEditedChordPayload(payload)
      setIsChordDirty(meta.isDirty)
    },
    [],
  )

  const handleSaveExistingEnhancements = useCallback(async () => {
    if (!songInfo?.songId || !lrcContent) return

    setIsSavingExisting(true)
    setError(null)

    try {
      if (isWordTimingDirty && editedWordTimingPayload) {
        const response = await fetch("/api/admin/lrc/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            songId: songInfo.songId,
            lrclibId,
            baseLrc: lrcContent,
            payload: editedWordTimingPayload,
            coverage: existingEnhancement?.coverage ?? 0,
          }),
        })

        if (!response.ok) {
          const data = (await response.json()) as { error: string }
          throw new Error(data.error || "Failed to save word timing enhancement")
        }

        setExistingEnhancement({
          payload: editedWordTimingPayload,
          coverage: existingEnhancement?.coverage ?? 0,
        })
        setIsWordTimingDirty(false)
      }

      if (isChordDirty && editedChordPayload) {
        const response = await fetch("/api/admin/chords/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            songId: songInfo.songId,
            lrclibId,
            baseLrc: lrcContent,
            payload: editedChordPayload,
            coverage: existingChordEnhancement?.coverage ?? 0,
          }),
        })

        if (!response.ok) {
          const data = (await response.json()) as { error: string }
          throw new Error(data.error || "Failed to save chord enhancement")
        }

        setExistingChordEnhancement({
          payload: editedChordPayload,
          coverage: existingChordEnhancement?.coverage ?? 0,
        })
        setIsChordDirty(false)
      }

      removeCachedLyrics(lrclibId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save enhancement")
    } finally {
      setIsSavingExisting(false)
    }
  }, [
    songInfo?.songId,
    lrcContent,
    lrclibId,
    isWordTimingDirty,
    editedWordTimingPayload,
    isChordDirty,
    editedChordPayload,
    existingEnhancement?.coverage,
    existingChordEnhancement?.coverage,
  ])

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    if (Number.isNaN(lrclibId)) {
      setError("Invalid song ID")
      setPageState("error")
      return
    }

    async function loadSongData() {
      try {
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
                hasChordEnhancement: boolean
              }

          if (songData.found) {
            setSongInfo({
              songId: songData.songId,
              title: songData.title,
              artist: songData.artist,
              hasEnhancement: songData.hasEnhancement,
              hasChordEnhancement: songData.hasChordEnhancement,
            })

            if (songData.hasEnhancement) {
              const enhanceResponse = await fetch(`/api/admin/lrc/enhance?lrclibId=${lrclibId}`)
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

            if (songData.hasChordEnhancement) {
              const chordEnhanceResponse = await fetch(
                `/api/admin/chords/enhance?lrclibId=${lrclibId}`,
              )
              if (chordEnhanceResponse.ok) {
                const chordEnhanceData = (await chordEnhanceResponse.json()) as
                  | { found: false }
                  | {
                      found: true
                      enhancement: {
                        payload: ChordEnhancementPayloadV1
                        coverage: number
                      }
                    }
                if (chordEnhanceData.found) {
                  setExistingChordEnhancement({
                    payload: chordEnhanceData.enhancement.payload,
                    coverage: chordEnhanceData.enhancement.coverage,
                  })
                }
              }
            }
          } else {
            setSongInfo({
              songId: "",
              title: lrcData.title,
              artist: lrcData.artist,
              hasEnhancement: false,
              hasChordEnhancement: false,
            })
          }
        } else {
          setSongInfo({
            songId: "",
            title: lrcData.title,
            artist: lrcData.artist,
            hasEnhancement: false,
            hasChordEnhancement: false,
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

  const normalizeForComparison = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim()

  const handleGpExtracted = useCallback(
    (data: GpExtractedData) => {
      if (!songInfo) {
        setGpData(data)
        setAlignmentResult(null)
        setChordAlignmentResult(null)
        return
      }

      const gpTitle = normalizeForComparison(data.meta.title)
      const gpArtist = normalizeForComparison(data.meta.artist)
      const pageTitle = normalizeForComparison(songInfo.title)
      const pageArtist = normalizeForComparison(songInfo.artist)

      const titleMatches = gpTitle.includes(pageTitle) || pageTitle.includes(gpTitle)
      const artistMatches = gpArtist.includes(pageArtist) || pageArtist.includes(gpArtist)

      if (!titleMatches || !artistMatches) {
        setPendingGpData(data)
        return
      }

      setGpData(data)
      setAlignmentResult(null)
      setChordAlignmentResult(null)
    },
    [songInfo],
  )

  const handleConfirmGpMismatch = useCallback(() => {
    if (pendingGpData) {
      setGpData(pendingGpData)
      setAlignmentResult(null)
      setChordAlignmentResult(null)
      setPendingGpData(null)
    }
  }, [pendingGpData])

  const handleCancelGpMismatch = useCallback(() => {
    setPendingGpData(null)
  }, [])

  const handleChordTrackChange = useCallback(
    (index: number) => {
      if (!gpData) return

      const newChords = extractExplicitChords(gpData.score, index, gpData.tempo)

      setGpData(prev =>
        prev
          ? {
              ...prev,
              selectedTrackIndex: index,
              chords: newChords.length > 0 ? newChords : prev.chords,
            }
          : null,
      )
    },
    [gpData],
  )

  const handleWordTimingChange = useCallback(
    (
      payload: EnhancementPayload,
      meta: {
        isDirty: boolean
        coverage: number
        syncOffsetMs: number
        patches: readonly WordPatch[]
      },
    ) => {
      setAlignmentResult({
        patches: [...meta.patches],
        payload,
        coverage: meta.coverage,
        syncOffsetMs: meta.syncOffsetMs,
      })
    },
    [],
  )

  const gpMeta = useMemo(
    () =>
      gpData
        ? {
            bpm: gpData.bpm,
            keySignature: gpData.keySignature,
            tuning: gpData.tuning,
          }
        : undefined,
    [gpData?.bpm, gpData?.keySignature, gpData?.tuning],
  )

  const handleChordAlignmentComplete = useCallback(
    (payload: ChordEnhancementPayloadV1, meta: { isDirty: boolean; coverage: number }) => {
      setChordAlignmentResult({
        lines: [...payload.lines],
        payload,
        coverage: meta.coverage,
      })
    },
    [],
  )

  const handleRemoveImportWordTiming = useCallback(() => {
    setAlignmentResult(null)
    setGpData(prev =>
      prev
        ? {
            ...prev,
            wordTimings: [],
          }
        : null,
    )
  }, [])

  const handleRemoveImportChords = useCallback(() => {
    setChordAlignmentResult(null)
    setGpData(prev =>
      prev
        ? {
            ...prev,
            chords: [],
          }
        : null,
    )
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!songInfo || !lrcContent || !alignmentResult) return

    setPageState("submitting")
    setError(null)

    try {
      // Save word timing enhancement
      const lrcResponse = await fetch("/api/admin/lrc/enhance", {
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

      if (!lrcResponse.ok) {
        const data = (await lrcResponse.json()) as { error: string }
        throw new Error(data.error || "Failed to save word timing enhancement")
      }

      // Save chord enhancement if available
      if (hasChords && chordAlignmentResult) {
        const chordResponse = await fetch("/api/admin/chords/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            songId: songInfo.songId,
            lrclibId,
            baseLrc: lrcContent,
            payload: chordAlignmentResult.payload,
            coverage: chordAlignmentResult.coverage,
          }),
        })

        if (!chordResponse.ok) {
          const data = (await chordResponse.json()) as { error: string }
          throw new Error(data.error || "Failed to save chord enhancement")
        }
      }

      removeCachedLyrics(lrclibId)
      setPageState("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save enhancement")
      setPageState("ready")
    }
  }, [songInfo, lrcContent, alignmentResult, hasChords, chordAlignmentResult, lrclibId])

  if (isAuthLoading || pageState === "loading") {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold mb-1">Enhance Lyrics</h1>
            <p className="text-neutral-400">Add word-level timing and chords from Guitar Pro</p>
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
                    {hasChords
                      ? `Word timings + chords for "${songInfo?.title}" have been saved`
                      : `Word timings for "${songInfo?.title}" have been saved`}
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

          {/* GP File Metadata Mismatch Confirmation */}
          {pendingGpData && songInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.default}
              className="rounded-xl bg-amber-900/30 border border-amber-700/50 p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <Warning size={24} weight="fill" className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-lg font-medium text-amber-400">Metadata Mismatch</h2>
                  <p className="text-amber-200/70 mt-1">
                    The GP file metadata doesn't match this song. Are you sure you want to continue?
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div className="bg-neutral-900/50 rounded-lg p-3">
                  <p className="text-neutral-400 text-xs mb-1">Page</p>
                  <p className="text-white font-medium">{songInfo.title}</p>
                  <p className="text-neutral-300">{songInfo.artist}</p>
                </div>
                <div className="bg-neutral-900/50 rounded-lg p-3">
                  <p className="text-neutral-400 text-xs mb-1">GP File</p>
                  <p className="text-white font-medium">{pendingGpData.meta.title}</p>
                  <p className="text-neutral-300">{pendingGpData.meta.artist}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelGpMismatch}
                  className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGpMismatch}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 transition-colors"
                >
                  Use Anyway
                </button>
              </div>
            </motion.div>
          )}

          {(pageState === "ready" || pageState === "submitting") && songInfo && (
            <div className="space-y-6">
              {/* Song Info */}
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
                    <span className="text-neutral-400">Word Timing</span>
                    {songInfo.hasEnhancement ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <Check size={16} weight="bold" />
                        Has enhancement
                      </span>
                    ) : (
                      <span className="text-amber-400">No enhancement</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Chords</span>
                    {songInfo.hasChordEnhancement ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <Check size={16} weight="bold" />
                        Has chords
                      </span>
                    ) : (
                      <span className="text-amber-400">No chords</span>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Existing Enhancements (hide when new GP file uploaded) */}
              {existingEnhancement && lrcContent && !gpData && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.default, delay: 0.15 }}
                >
                  <WordTimingEditor
                    lrcContent={lrcContent}
                    initialPayload={existingEnhancement.payload}
                    onPayloadChange={handleExistingWordTimingChange}
                    disabled={isSavingExisting}
                    isDirty={isWordTimingDirty}
                    onRemove={handleRemoveEnhancement}
                    isRemoving={isRemoving}
                  />
                </motion.div>
              )}

              {existingChordEnhancement && lrcContent && !gpData && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.default, delay: 0.2 }}
                >
                  <ChordTimingEditor
                    lrcContent={lrcContent}
                    initialPayload={existingChordEnhancement.payload}
                    onPayloadChange={handleChordPayloadChange}
                    disabled={isSavingExisting}
                    isDirty={isChordDirty}
                    onRemove={handleRemoveChordEnhancement}
                    isRemoving={isRemovingChords}
                  />
                </motion.div>
              )}

              {/* Save button for edited existing enhancements */}
              {(isWordTimingDirty || isChordDirty) && !gpData && (
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
                    onClick={handleSaveExistingEnhancements}
                    disabled={isSavingExisting}
                    className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingExisting
                      ? "Saving..."
                      : isWordTimingDirty && isChordDirty
                        ? "Save Word Timing + Chords"
                        : isWordTimingDirty
                          ? "Save Word Timing"
                          : "Save Chords"}
                  </button>
                </motion.div>
              )}

              {/* GP Uploader */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.default, delay: 0.25 }}
              >
                <h2 className="text-lg font-medium mb-3">
                  {existingEnhancement || existingChordEnhancement
                    ? "Replace Enhancement"
                    : "Upload Guitar Pro File"}
                </h2>
                <GpUploader onExtracted={handleGpExtracted} disabled={pageState === "submitting"} />
              </motion.div>

              {/* GP Metadata */}
              {gpData && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.default}
                  className="rounded-xl bg-neutral-900 p-5"
                >
                  <h2 className="text-lg font-medium mb-3">GP File Metadata</h2>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-400 block">BPM</span>
                      <span className="text-white font-medium">{gpData.bpm}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Key</span>
                      <span className="text-white font-medium">
                        {gpData.keySignature ?? "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block">Tuning</span>
                      <span className="text-white font-medium">{gpData.tuning ?? "Unknown"}</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Word Timing Editor (import mode) */}
              {gpData && lrcContent && gpData.wordTimings.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.default}
                >
                  <WordTimingEditor
                    lrcContent={lrcContent}
                    gpWords={gpData.wordTimings}
                    gpMeta={gpMeta}
                    onPayloadChange={handleWordTimingChange}
                    disabled={pageState === "submitting"}
                    onRemove={handleRemoveImportWordTiming}
                  />
                </motion.div>
              )}

              {/* LRC Preview (after alignment) */}
              {alignmentResult && lrcContent && (
                <EnhancedLrcView lrcContent={lrcContent} payload={alignmentResult.payload} />
              )}

              {/* Chord Alignment Preview (only if GP has chords) */}
              {gpData &&
                lrcContent &&
                gpData.chords &&
                gpData.chords.length > 0 &&
                gpData.tracks &&
                gpData.selectedTrackIndex !== null &&
                alignmentResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springs.default}
                  >
                    <ChordTimingEditor
                      lrcContent={lrcContent}
                      gpChords={gpData.chords}
                      tracks={gpData.tracks}
                      selectedTrackIndex={gpData.selectedTrackIndex}
                      onTrackChange={handleChordTrackChange}
                      onPayloadChange={handleChordAlignmentComplete}
                      disabled={pageState === "submitting"}
                      wordPatches={alignmentResult.patches}
                      syncOffsetMs={alignmentResult.syncOffsetMs}
                      onRemove={handleRemoveImportChords}
                    />
                  </motion.div>
                )}

              {/* No chords message */}
              {gpData && !hasChords && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.default}
                  className="rounded-xl bg-neutral-900 p-5"
                >
                  <div className="flex items-center gap-3">
                    <MusicNote size={24} className="text-neutral-500" />
                    <div>
                      <p className="text-neutral-300">No chord markers in this GP file</p>
                      <p className="text-sm text-neutral-500">Only word timing will be saved</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Submit Button */}
              {alignmentResult && lrcContent && (
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
                      : hasChords && chordAlignmentResult
                        ? "Save Word Timing + Chords"
                        : "Save Word Timing"}
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
