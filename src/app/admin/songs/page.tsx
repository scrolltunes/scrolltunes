"use client"

import { springs } from "@/animations"
import { useAccount, useIsAdmin } from "@/core"
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  Check,
  FunnelSimple,
  MagnifyingGlass,
  MusicNote,
  ShieldWarning,
  Sparkle,
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
  hasSyncedLyrics: boolean
  hasEnhancement: boolean
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

const LIMIT = 20

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-6xl mx-auto h-full px-4 flex items-center">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
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
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-40 bg-neutral-800 rounded animate-pulse mb-2" />
            <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  )
}

function LoadingTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-14 bg-neutral-900 rounded animate-pulse" />
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
      <div className="w-16 h-16 mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
        <MusicNote size={32} className="text-neutral-600" />
      </div>
      <h3 className="text-lg font-medium text-neutral-300 mb-2">
        {hasSearch ? "No songs found" : "No songs yet"}
      </h3>
      <p className="text-neutral-500">
        {hasSearch ? "Try adjusting your search or filter" : "Songs will appear here once added"}
      </p>
    </motion.div>
  )
}

function SongRow({
  song,
  index,
  onRemoveEnhancement,
}: {
  song: Song
  index: number
  onRemoveEnhancement: (songId: string, lrclibId: number) => void
}) {
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemove = async () => {
    if (!song.lrclibId || !confirm("Remove enhancement for this song?")) return
    setIsRemoving(true)
    try {
      const response = await fetch("/api/admin/lrc/enhance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id, lrclibId: song.lrclibId }),
      })
      if (response.ok) {
        onRemoveEnhancement(song.id, song.lrclibId)
      }
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.default, delay: index * 0.02 }}
      className="border-b border-neutral-800 hover:bg-neutral-900/50 transition-colors"
    >
      <td className="py-3 px-4 text-neutral-300">{song.artist}</td>
      <td className="py-3 px-4 text-white">{song.title}</td>
      <td className="py-3 px-4 text-center">
        {song.hasSyncedLyrics ? (
          <Check size={18} className="text-green-500 mx-auto" />
        ) : (
          <X size={18} className="text-neutral-600 mx-auto" />
        )}
      </td>
      <td className="py-3 px-4 text-center">
        {song.hasEnhancement ? (
          <Check size={18} className="text-green-500 mx-auto" />
        ) : (
          <X size={18} className="text-neutral-600 mx-auto" />
        )}
      </td>
      <td className="py-3 px-4 text-center text-neutral-400">{song.totalPlayCount}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {song.lrclibId ? (
            <Link
              href={`/admin/enhance/${song.lrclibId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <Sparkle size={14} />
              <span>Enhance</span>
            </Link>
          ) : (
            <span className="text-neutral-600 text-sm">No LRCLIB ID</span>
          )}
          {song.hasEnhancement && song.lrclibId && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50"
            >
              <Trash size={14} />
              <span>{isRemoving ? "..." : "Remove"}</span>
            </button>
          )}
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
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [offset, setOffset] = useState(0)

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
    <div className="min-h-screen bg-neutral-950 text-white">
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
            <p className="text-neutral-400">
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="text"
                placeholder="Search by artist or title..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="relative">
              <FunnelSimple
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
              />
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as FilterType)}
                className="appearance-none pl-10 pr-10 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="all">All</option>
                <option value="synced">Synced</option>
                <option value="enhanced">Enhanced</option>
                <option value="unenhanced">Unenhanced</option>
              </select>
            </div>
          </motion.div>

          {isLoading ? (
            <LoadingTable />
          ) : songs.length === 0 ? (
            <EmptyState hasSearch={search.length > 0 || filter !== "all"} />
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...springs.default, delay: 0.2 }}
                className="overflow-x-auto rounded-xl border border-neutral-800"
              >
                <table className="w-full">
                  <thead className="bg-neutral-900">
                    <tr className="text-left text-sm text-neutral-400">
                      <th className="py-3 px-4 font-medium">Artist</th>
                      <th className="py-3 px-4 font-medium">Title</th>
                      <th className="py-3 px-4 font-medium text-center">Synced</th>
                      <th className="py-3 px-4 font-medium text-center">Enhanced</th>
                      <th className="py-3 px-4 font-medium text-center">Plays</th>
                      <th className="py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {songs.map((song, index) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        index={index}
                        onRemoveEnhancement={songId => {
                          setSongs(prev =>
                            prev.map(s => (s.id === songId ? { ...s, hasEnhancement: false } : s)),
                          )
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </motion.div>

              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...springs.default, delay: 0.3 }}
                  className="flex items-center justify-between mt-6"
                >
                  <p className="text-sm text-neutral-400">
                    Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                      disabled={offset === 0}
                      className="p-2 rounded-lg bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <CaretLeft size={18} />
                    </button>
                    <span className="text-sm text-neutral-400 min-w-[80px] text-center">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOffset(offset + LIMIT)}
                      disabled={offset + LIMIT >= total}
                      className="p-2 rounded-lg bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
