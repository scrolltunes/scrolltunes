"use client"

import { springs } from "@/animations"
import { useAccount, useIsAdmin } from "@/core"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  Check,
  FunnelSimple,
  List,
  MagnifyingGlass,
  Metronome,
  MusicNote,
  PencilSimple,
  ShieldWarning,
  Sparkle,
  SquaresFour,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

interface Song {
  id: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  bpmSourceUrl: string | null
  hasSyncedLyrics: boolean
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number
  lrclibId: number | null
}

interface SongsResponse {
  songs: Song[]
  total: number
  limit: number
  offset: number
}

type FilterType = "all" | "synced" | "enhanced" | "unenhanced"
type ViewType = "grid" | "list"

const LIMIT = 20
const VIEW_TYPE_KEY = "scrolltunes:admin:songs:view"

function loadViewType(): ViewType {
  if (typeof window === "undefined") return "grid"
  const stored = localStorage.getItem(VIEW_TYPE_KEY)
  return stored === "list" ? "list" : "grid"
}

function saveViewType(viewType: ViewType): void {
  if (typeof window === "undefined") return
  localStorage.setItem(VIEW_TYPE_KEY, viewType)
}

function formatDuration(ms: number | null): string {
  if (!ms) return ""
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-lg" style={{ background: "var(--color-header-bg)", borderBottom: "1px solid var(--color-border)" }}>
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/admin"
          className="flex items-center gap-2 transition-colors hover:brightness-125"
          style={{ color: "var(--color-text3)" }}
        >
          <ArrowLeft size={20} />
          <span>Admin</span>
        </Link>
      </div>
    </header>
  )
}

function AccessDenied() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <Header />
      <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: "var(--color-surface1)" }}>
            <ShieldWarning size={32} style={{ color: "var(--color-text-muted)" }} />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access denied</h2>
          <p className="mb-6" style={{ color: "var(--color-text3)" }}>You don't have permission to view this page</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
            style={{ background: "var(--color-accent)", color: "white" }}
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
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-40 rounded animate-pulse mb-2" style={{ background: "var(--color-surface2)" }} />
            <div className="h-5 w-32 rounded animate-pulse" style={{ background: "var(--color-surface2)" }} />
          </div>
        </div>
      </main>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-48 rounded-xl animate-pulse" style={{ background: "var(--color-surface1)" }} />
      ))}
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="w-16 h-16 mb-4 rounded-2xl flex items-center justify-center" style={{ background: "var(--color-surface1)" }}>
        <MusicNote size={32} style={{ color: "var(--color-text-muted)" }} />
      </div>
      <h3 className="text-lg font-medium mb-2" style={{ color: "var(--color-text2)" }}>
        {hasSearch ? "No songs found" : "No songs yet"}
      </h3>
      <p style={{ color: "var(--color-text-muted)" }}>
        {hasSearch ? "Try adjusting your search or filter" : "Songs will appear here once added"}
      </p>
    </motion.div>
  )
}

function StatusBadge({
  label,
  active,
}: {
  label: string
  active: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full"
      style={
        active
          ? { background: "var(--color-success-soft)", color: "var(--color-success)" }
          : { background: "var(--color-surface2)", color: "var(--color-text-muted)" }
      }
    >
      {active ? <Check size={12} weight="bold" /> : <X size={12} />}
      {label}
    </span>
  )
}

function SongCard({
  song,
  index,
  onDeleteSong,
}: {
  song: Song
  index: number
  onDeleteSong: (songId: string) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [albumArt, setAlbumArt] = useState<string | undefined>(undefined)
  const [isLoadingArt, setIsLoadingArt] = useState(!!song.lrclibId)

  useEffect(() => {
    if (!song.lrclibId) {
      setIsLoadingArt(false)
      return
    }

    const cached = loadCachedLyrics(song.lrclibId)
    if (cached?.albumArt) {
      setAlbumArt(cached.albumArt)
      setIsLoadingArt(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${song.lrclibId}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoadingArt(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | undefined
        if (data.lyrics) {
          saveCachedLyrics(song.lrclibId as number, {
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
  }, [song.lrclibId])

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
        onDeleteSong(song.id)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const duration = formatDuration(song.durationMs)
  const hasBpmInfo = song.bpm !== null || song.musicalKey !== null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.default, delay: index * 0.03 }}
      className="rounded-xl flex flex-col transition-colors"
      style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)" }}
    >
      <Link href={`/admin/songs/${song.id}`} className="p-4 flex gap-3">
        <div className="flex-shrink-0 w-[60px] h-[60px] rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "var(--color-surface2)" }}>
          {isLoadingArt ? (
            <div className="w-full h-full animate-pulse" style={{ background: "var(--color-surface2)" }} />
          ) : albumArt ? (
            <img src={albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <MusicNote size={24} weight="fill" style={{ color: "var(--color-text-muted)" }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="font-medium transition-colors line-clamp-1" style={{ color: "var(--color-text)" }}>
            {song.title}
          </span>
          <p className="text-sm line-clamp-1" style={{ color: "var(--color-text3)" }}>{song.artist}</p>
          {song.album && (
            <p className="text-xs line-clamp-1 mt-0.5" style={{ color: "var(--color-text-muted)" }}>{song.album}</p>
          )}
        </div>
      </Link>

      <div className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {duration && (
            <span className="flex items-center gap-1">
              <Timer size={12} />
              {duration}
            </span>
          )}
          {hasBpmInfo && (
            <span
              className="flex items-center gap-1 cursor-help"
              title={
                song.bpmSource
                  ? `Source: ${song.bpmSource}${song.bpmSourceUrl ? ` (${song.bpmSourceUrl})` : ""}`
                  : undefined
              }
            >
              <Metronome size={12} />
              {song.bpm !== null && `${song.bpm} BPM`}
              {song.bpm !== null && song.musicalKey && " · "}
              {song.musicalKey}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StatusBadge label="Synced" active={song.hasSyncedLyrics} />
          <StatusBadge label="Words" active={song.hasEnhancement} />
          <StatusBadge label="Chords" active={song.hasChordEnhancement} />
        </div>

        <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          {song.lrclibId ? (
            song.hasEnhancement ? (
              <Link
                href={`/admin/enhance/${song.lrclibId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors hover:brightness-110"
                style={{ background: "var(--color-success)", color: "white" }}
              >
                <PencilSimple size={14} />
                <span>Edit</span>
              </Link>
            ) : (
              <Link
                href={`/admin/enhance/${song.lrclibId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors hover:brightness-110"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                <Sparkle size={14} />
                <span>Enhance</span>
              </Link>
            )
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50 ml-auto"
            style={{ background: "var(--color-surface2)", color: "var(--color-text3)" }}
            title="Delete song permanently"
          >
            <Trash size={14} />
            <span>{isDeleting ? "..." : "Delete"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function SongRow({
  song,
  index,
  onDeleteSong,
}: {
  song: Song
  index: number
  onDeleteSong: (songId: string) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [albumArt, setAlbumArt] = useState<string | undefined>(undefined)
  const [isLoadingArt, setIsLoadingArt] = useState(!!song.lrclibId)

  useEffect(() => {
    if (!song.lrclibId) {
      setIsLoadingArt(false)
      return
    }

    const cached = loadCachedLyrics(song.lrclibId)
    if (cached?.albumArt) {
      setAlbumArt(cached.albumArt)
      setIsLoadingArt(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${song.lrclibId}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoadingArt(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | undefined
        if (data.lyrics) {
          saveCachedLyrics(song.lrclibId as number, {
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
  }, [song.lrclibId])

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
        onDeleteSong(song.id)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const duration = formatDuration(song.durationMs)

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...springs.default, delay: index * 0.02 }}
      className="last:border-b-0 transition-colors"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <td className="px-4 py-3">
        <Link href={`/admin/songs/${song.id}`} className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center overflow-hidden" style={{ background: "var(--color-surface2)" }}>
            {isLoadingArt ? (
              <div className="w-full h-full animate-pulse" style={{ background: "var(--color-surface2)" }} />
            ) : albumArt ? (
              <img src={albumArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <MusicNote size={16} weight="fill" style={{ color: "var(--color-text-muted)" }} />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium transition-colors line-clamp-1" style={{ color: "var(--color-text)" }}>
              {song.title}
            </span>
            <p className="text-sm line-clamp-1" style={{ color: "var(--color-text3)" }}>{song.artist}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--color-text3)" }}>{song.album || "—"}</td>
      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: "var(--color-text3)" }}>{duration || "—"}</td>
      <td className="px-4 py-3 hidden lg:table-cell" style={{ color: "var(--color-text3)" }}>
        {song.bpm ? `${song.bpm}` : "—"}
        {song.musicalKey && ` · ${song.musicalKey}`}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          {song.hasSyncedLyrics && (
            <span className="w-2 h-2 rounded-full bg-green-500" title="Synced" />
          )}
          {song.hasEnhancement && (
            <span className="w-2 h-2 rounded-full bg-indigo-500" title="Enhanced" />
          )}
          {song.hasChordEnhancement && (
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Chords" />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <span style={{ color: "var(--color-text3)" }}>{song.totalPlayCount.toLocaleString()}</span>
          {song.lrclibId && (
            <Link
              href={`/admin/enhance/${song.lrclibId}`}
              className="p-1.5 transition-colors hover:brightness-125"
              style={{ color: "var(--color-text-muted)" }}
              title={song.hasEnhancement ? "Edit enhancement" : "Enhance"}
            >
              {song.hasEnhancement ? <PencilSimple size={16} /> : <Sparkle size={16} />}
            </Link>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 transition-colors disabled:opacity-50"
            style={{ color: "var(--color-text-muted)" }}
            title="Delete"
          >
            <Trash size={16} />
          </button>
        </div>
      </td>
    </motion.tr>
  )
}

export default function AdminSongsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAccount()
  const isAdmin = useIsAdmin()
  const [songs, setSongs] = useState<Song[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [viewType, setViewType] = useState<ViewType>(loadViewType)
  const [offset, setOffset] = useState(0)

  const handleViewTypeChange = (newViewType: ViewType) => {
    setViewType(newViewType)
    saveViewType(newViewType)
  }

  const handleDeleteAll = async () => {
    const filterDesc =
      filter === "all" && !search
        ? "ALL songs"
        : `${total} song${total !== 1 ? "s" : ""} matching current filter`
    if (!confirm(`Permanently delete ${filterDesc}? This cannot be undone.`)) return

    setIsDeletingAll(true)
    try {
      const response = await fetch("/api/admin/songs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteAll: true,
          search: search || undefined,
          filter,
        }),
      })
      if (response.ok) {
        setSongs([])
        setTotal(0)
        setOffset(0)
      }
    } finally {
      setIsDeletingAll(false)
    }
  }

  const fetchSongs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (filter !== "all") params.set("filter", filter)
      params.set("limit", LIMIT.toString())
      params.set("offset", offset.toString())

      const response = await fetch(`/api/admin/songs?${params.toString()}`)
      if (response.ok) {
        const data = (await response.json()) as SongsResponse
        setSongs(data.songs)
        setTotal(data.total)
      }
    } catch {
      // Failed to fetch songs
    } finally {
      setIsLoading(false)
    }
  }, [search, filter, offset])

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    fetchSongs()
  }, [isAuthenticated, isAdmin, fetchSongs])

  useEffect(() => {
    setOffset(0)
  }, [search, filter])

  if (isAuthLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || !isAdmin) {
    return <AccessDenied />
  }

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold mb-1">Songs Catalog</h1>
            <p style={{ color: "var(--color-text3)" }}>
              {total} song{total !== 1 ? "s" : ""} in database
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.default, delay: 0.1 }}
            className="flex flex-col sm:flex-row gap-3 mb-6"
          >
            <div className="relative flex-1">
              <MagnifyingGlass
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--color-text-muted)" }}
              />
              <input
                type="text"
                placeholder="Search by artist or title..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none transition-colors"
                style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
            </div>
            <div className="relative">
              <FunnelSimple
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--color-text-muted)" }}
              />
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as FilterType)}
                className="appearance-none pl-10 pr-10 py-2.5 rounded-lg focus:outline-none transition-colors cursor-pointer"
                style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">All</option>
                <option value="synced">Synced</option>
                <option value="enhanced">Enhanced</option>
                <option value="unenhanced">Unenhanced</option>
              </select>
            </div>
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)" }}>
              <button
                type="button"
                onClick={() => handleViewTypeChange("grid")}
                className="p-2 rounded transition-colors"
                style={viewType === "grid" ? { background: "var(--color-surface2)", color: "var(--color-text)" } : { color: "var(--color-text-muted)" }}
                title="Grid view"
              >
                <SquaresFour size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleViewTypeChange("list")}
                className="p-2 rounded transition-colors"
                style={viewType === "list" ? { background: "var(--color-surface2)", color: "var(--color-text)" } : { color: "var(--color-text-muted)" }}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
              >
                <Trash size={18} />
                <span>{isDeletingAll ? "Deleting..." : "Delete all"}</span>
              </button>
            )}
          </motion.div>

          {isLoading ? (
            <LoadingGrid />
          ) : songs.length === 0 ? (
            <EmptyState hasSearch={search.length > 0 || filter !== "all"} />
          ) : (
            <>
              {viewType === "grid" ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...springs.default, delay: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {songs.map((song, index) => (
                    <SongCard
                      key={`${song.id}-${index}`}
                      song={song}
                      index={index}
                      onDeleteSong={songId => {
                        setSongs(prev => prev.filter(s => s.id !== songId))
                        setTotal(prev => prev - 1)
                      }}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...springs.default, delay: 0.2 }}
                  className="rounded-xl overflow-hidden"
                  style={{ background: "var(--color-surface1)", border: "1px solid var(--color-border)" }}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text3)" }}>
                        <th className="px-4 py-3 font-medium">Song</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Album</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">Duration</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">BPM</th>
                        <th className="px-4 py-3 font-medium text-center">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Plays</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songs.map((song, index) => (
                        <SongRow
                          key={`${song.id}-${index}`}
                          song={song}
                          index={index}
                          onDeleteSong={songId => {
                            setSongs(prev => prev.filter(s => s.id !== songId))
                            setTotal(prev => prev - 1)
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...springs.default, delay: 0.3 }}
                  className="flex items-center justify-between mt-6"
                >
                  <p className="text-sm" style={{ color: "var(--color-text3)" }}>
                    Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                      disabled={offset === 0}
                      className="p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:brightness-125"
                      style={{ background: "var(--color-surface1)", color: "var(--color-text3)" }}
                    >
                      <CaretLeft size={18} />
                    </button>
                    <span className="text-sm min-w-[80px] text-center" style={{ color: "var(--color-text3)" }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOffset(offset + LIMIT)}
                      disabled={offset + LIMIT >= total}
                      className="p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:brightness-125"
                      style={{ background: "var(--color-surface1)", color: "var(--color-text3)" }}
                    >
                      <CaretRight size={18} />
                    </button>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
