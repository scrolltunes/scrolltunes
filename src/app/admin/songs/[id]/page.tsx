"use client"

import { springs } from "@/animations"
import { useAccount, useIsAdmin } from "@/core"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath } from "@/lib/slug"
import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  FloppyDisk,
  Metronome,
  MusicNote,
  PencilSimple,
  ShieldWarning,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useCallback, useEffect, useState } from "react"

interface LrclibIdInfo {
  id: number
  isPrimary: boolean
}

interface Song {
  id: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  spotifyId: string | null
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  bpmSourceUrl: string | null
  hasSyncedLyrics: boolean
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number
  createdAt: string
  updatedAt: string
  lrclibIds: LrclibIdInfo[]
}

type PageState = "loading" | "error" | "ready"

function formatDuration(ms: number | null): string {
  if (!ms) return "—"
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
          <span>Songs</span>
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
          <div className="bg-neutral-900 rounded-xl p-6">
            <div className="flex gap-6">
              <div className="w-32 h-32 bg-neutral-800 rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-64 bg-neutral-800 rounded animate-pulse" />
                <div className="h-5 w-48 bg-neutral-800 rounded animate-pulse" />
                <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
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
            <X size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Failed to load song</h2>
          <p className="text-neutral-400 mb-6">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Try again
          </button>
        </motion.div>
      </main>
    </div>
  )
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-full ${
        active ? "bg-green-500/20 text-green-400" : "bg-neutral-800 text-neutral-500"
      }`}
    >
      {active ? <Check size={14} weight="bold" /> : <X size={14} />}
      {label}
    </span>
  )
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-neutral-800 last:border-b-0">
      <span className="text-neutral-500 w-28 shrink-0">{label}</span>
      <span className="text-white">{value ?? "—"}</span>
    </div>
  )
}

function BpmEditorModal({
  isOpen,
  onClose,
  songId,
  initialBpm,
  initialKey,
  initialSource,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  songId: string
  initialBpm: number | null
  initialKey: string | null
  initialSource: string | null
  onSave: (bpm: number, key: string | null, source: string | null) => void
}) {
  const [bpm, setBpm] = useState(initialBpm?.toString() ?? "")
  const [musicalKey, setMusicalKey] = useState(initialKey ?? "")
  const [source, setSource] = useState(initialSource ?? "Manual")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setBpm(initialBpm?.toString() ?? "")
      setMusicalKey(initialKey ?? "")
      setSource(initialSource ?? "Manual")
      setError(null)
    }
  }, [isOpen, initialBpm, initialKey, initialSource])

  const handleSave = async () => {
    const bpmNum = Number.parseInt(bpm, 10)
    if (Number.isNaN(bpmNum) || bpmNum <= 0 || bpmNum > 300) {
      setError("BPM must be between 1 and 300")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/songs/${songId}/bpm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bpm: bpmNum,
          musicalKey: musicalKey || null,
          source: source || "Manual",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? "Failed to save")
      }

      onSave(bpmNum, musicalKey || null, source || "Manual")
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={springs.default}
        className="relative z-10 w-full max-w-md mx-4 bg-neutral-900 rounded-xl border border-neutral-800 shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Metronome size={20} />
            Edit BPM
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <label className="block">
              <span className="text-sm text-neutral-400 mb-1.5 block">BPM</span>
              <input
                type="number"
                value={bpm}
                onChange={e => setBpm(e.target.value)}
                min={1}
                max={300}
                className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm text-neutral-400 mb-1.5 block">Musical Key</span>
              <input
                type="text"
                value={musicalKey}
                onChange={e => setMusicalKey(e.target.value)}
                placeholder="e.g. C major, Am, F# minor"
                maxLength={20}
                className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-sm text-neutral-400 mb-1.5 block">Source</span>
              <input
                type="text"
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="Manual"
                maxLength={50}
                className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <FloppyDisk size={16} />
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function SongDetailContent({ song: initialSong }: { song: Song }) {
  const router = useRouter()
  const [song, setSong] = useState(initialSong)
  const [albumArt, setAlbumArt] = useState<string | undefined>(undefined)
  const [isLoadingArt, setIsLoadingArt] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isBpmModalOpen, setIsBpmModalOpen] = useState(false)

  const primaryLrclibId = song.lrclibIds.find(l => l.isPrimary)?.id ?? song.lrclibIds[0]?.id

  useEffect(() => {
    if (!primaryLrclibId) {
      setIsLoadingArt(false)
      return
    }

    setIsLoadingArt(true)

    const cached = loadCachedLyrics(primaryLrclibId)
    if (cached?.albumArt) {
      setAlbumArt(cached.albumArt)
      setIsLoadingArt(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${primaryLrclibId}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoadingArt(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | undefined
        if (data.lyrics) {
          saveCachedLyrics(primaryLrclibId, {
            lyrics: data.lyrics,
            bpm: data.bpm ?? null,
            key: data.key ?? null,
            albumArt: art,
            spotifyId: data.spotifyId ?? undefined,
            bpmSource: data.attribution?.bpm ?? undefined,
            lyricsSource: data.attribution?.lyrics ?? undefined,
          })
        }

        setAlbumArt(art)
        setIsLoadingArt(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoadingArt(false)
      })

    return () => {
      cancelled = true
    }
  }, [primaryLrclibId])

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${song.title}" by ${song.artist}? This cannot be undone.`))
      return

    setIsDeleting(true)
    try {
      const response = await fetch("/api/admin/songs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id }),
      })
      if (response.ok) {
        router.push("/admin/songs")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBpmSave = (bpm: number, key: string | null, source: string | null) => {
    setSong(prev => ({
      ...prev,
      bpm,
      musicalKey: key,
      bpmSource: source,
    }))
  }

  const songPath = primaryLrclibId
    ? makeCanonicalPath({ id: primaryLrclibId, title: song.title, artist: song.artist })
    : null

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="bg-neutral-900 rounded-xl p-6"
          >
            <div className="flex gap-6">
              <div className="w-32 h-32 bg-neutral-800 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                {isLoadingArt ? (
                  <div className="w-full h-full animate-pulse bg-neutral-700" />
                ) : albumArt ? (
                  <Image
                    src={albumArt}
                    alt={`${song.title} album art`}
                    width={128}
                    height={128}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <MusicNote size={48} className="text-neutral-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold truncate">{song.title}</h1>
                <p className="text-lg text-neutral-400 truncate">{song.artist}</p>
                {song.album && (
                  <p className="text-sm text-neutral-500 truncate mt-1">{song.album}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <StatusBadge label="Synced Lyrics" active={song.hasSyncedLyrics} />
                  <StatusBadge label="Word Timing" active={song.hasEnhancement} />
                  <StatusBadge label="Chords" active={song.hasChordEnhancement} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-neutral-800">
              {songPath && (
                <Link
                  href={songPath}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  <MusicNote size={16} />
                  <span>View Song</span>
                </Link>
              )}
              {primaryLrclibId && (
                <Link
                  href={`/admin/enhance/${primaryLrclibId}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    song.hasEnhancement
                      ? "bg-green-600 text-white hover:bg-green-500"
                      : "bg-amber-600 text-white hover:bg-amber-500"
                  }`}
                >
                  {song.hasEnhancement ? (
                    <>
                      <PencilSimple size={16} />
                      <span>Edit Enhancement</span>
                    </>
                  ) : (
                    <>
                      <Sparkle size={16} />
                      <span>Enhance</span>
                    </>
                  )}
                </Link>
              )}
              <button
                type="button"
                onClick={() => setIsBpmModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <Metronome size={16} />
                <span>Edit BPM</span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50 ml-auto"
              >
                <Trash size={16} />
                <span>{isDeleting ? "Deleting..." : "Delete"}</span>
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.default, delay: 0.1 }}
            className="bg-neutral-900 rounded-xl p-6"
          >
            <h2 className="text-lg font-medium mb-4">Metadata</h2>
            <div className="space-y-0">
              <MetadataRow label="Album" value={song.album} />
              <MetadataRow label="Duration" value={formatDuration(song.durationMs)} />
              <MetadataRow
                label="Spotify ID"
                value={
                  song.spotifyId ? (
                    <a
                      href={`https://open.spotify.com/track/${song.spotifyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                    >
                      {song.spotifyId}
                      <ArrowSquareOut size={14} />
                    </a>
                  ) : null
                }
              />
              <MetadataRow
                label="BPM"
                value={
                  song.bpm ? (
                    <span>
                      {song.bpm}
                      {song.musicalKey && (
                        <span className="text-neutral-400 ml-2">({song.musicalKey})</span>
                      )}
                      {song.bpmSource && (
                        <span className="text-neutral-500 text-sm ml-2">
                          via{" "}
                          {song.bpmSourceUrl ? (
                            <a
                              href={song.bpmSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300"
                            >
                              {song.bpmSource}
                            </a>
                          ) : (
                            song.bpmSource
                          )}
                        </span>
                      )}
                    </span>
                  ) : null
                }
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.default, delay: 0.15 }}
            className="bg-neutral-900 rounded-xl p-6"
          >
            <h2 className="text-lg font-medium mb-4">Stats</h2>
            <div className="space-y-0">
              <MetadataRow label="Total Plays" value={song.totalPlayCount.toLocaleString()} />
              <MetadataRow label="Created" value={formatDate(song.createdAt)} />
              <MetadataRow label="Updated" value={formatDate(song.updatedAt)} />
            </div>
          </motion.div>

          {song.lrclibIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.default, delay: 0.2 }}
              className="bg-neutral-900 rounded-xl p-6"
            >
              <h2 className="text-lg font-medium mb-4">LRCLIB IDs</h2>
              <div className="space-y-2">
                {song.lrclibIds.map(lrclib => (
                  <div key={lrclib.id} className="flex items-center gap-3">
                    <a
                      href={`https://lrclib.net/api/get/${lrclib.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-mono text-sm"
                    >
                      {lrclib.id}
                      <ArrowSquareOut size={14} />
                    </a>
                    {lrclib.isPrimary && (
                      <span className="px-2 py-0.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <BpmEditorModal
        isOpen={isBpmModalOpen}
        onClose={() => setIsBpmModalOpen(false)}
        songId={song.id}
        initialBpm={song.bpm}
        initialKey={song.musicalKey}
        initialSource={song.bpmSource}
        onSave={handleBpmSave}
      />
    </div>
  )
}

export default function AdminSongDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()
  const [pageState, setPageState] = useState<PageState>("loading")
  const [song, setSong] = useState<Song | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const fetchSong = useCallback(async () => {
    setPageState("loading")
    try {
      const response = await fetch(`/api/admin/songs/${id}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? "Failed to fetch song")
      }
      const data = (await response.json()) as Song
      setSong(data)
      setPageState("ready")
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error")
      setPageState("error")
    }
  }, [id])

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    fetchSong()
  }, [isAuthenticated, isAdmin, fetchSong])

  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  if (pageState === "loading") {
    return <LoadingScreen />
  }

  if (pageState === "error") {
    return <ErrorScreen message={errorMessage} onRetry={fetchSong} />
  }

  if (!song) {
    return <ErrorScreen message="Song not found" onRetry={fetchSong} />
  }

  return <SongDetailContent song={song} />
}
