"use client"

import { springs } from "@/animations"
import { CreateSetlistModal, EditSetlistModal, SetlistCard } from "@/components/setlists"
import { AmbientBackground, Logo } from "@/components/ui"
import {
  type Setlist,
  type SetlistSong,
  setlistsStore,
  useIsAuthenticated,
  useSetlists,
  useSetlistsLoading,
} from "@/core"
import { loadCachedLyrics } from "@/lib/lyrics-cache"
import { makeSetlistPath } from "@/lib/slug"
import { ArrowLeft, Plus, Queue, SignIn } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

function getAlbumArtsForSetlist(songs: readonly SetlistSong[] | undefined): (string | undefined)[] {
  if (!songs || songs.length === 0) return []

  const arts: (string | undefined)[] = []
  for (const song of songs.slice(0, 4)) {
    if (song.songProvider === "lrclib") {
      const numericId = Number(song.songId)
      if (!Number.isNaN(numericId)) {
        const cached = loadCachedLyrics(numericId)
        arts.push(cached?.albumArt)
      } else {
        arts.push(undefined)
      }
    } else {
      arts.push(undefined)
    }
  }
  return arts
}

export default function SetlistsPage() {
  const isAuthenticated = useIsAuthenticated()
  const setlists = useSetlists()
  const isLoading = useSetlistsLoading()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSetlist, setEditingSetlist] = useState<Setlist | null>(null)
  const [deletingSetlist, setDeletingSetlist] = useState<Setlist | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated) {
      setlistsStore.fetchAll()
    }
  }, [isAuthenticated])

  // Fetch songs for setlists that don't have them loaded yet
  useEffect(() => {
    for (const setlist of setlists) {
      if (!setlist.songs && setlist.songCount > 0) {
        setlistsStore.fetchSongs(setlist.id)
      }
    }
  }, [setlists])

  // Compute album arts for each setlist
  const albumArtsMap = useMemo(() => {
    const map = new Map<string, (string | undefined)[]>()
    for (const setlist of setlists) {
      map.set(setlist.id, getAlbumArtsForSetlist(setlist.songs))
    }
    return map
  }, [setlists])

  const handleSetlistClick = useCallback(
    (setlist: Setlist) => {
      router.push(makeSetlistPath({ id: setlist.id, name: setlist.name }))
    },
    [router],
  )

  const handleEditClick = useCallback((setlist: Setlist) => {
    setEditingSetlist(setlist)
  }, [])

  const handleEditClose = useCallback(() => {
    setEditingSetlist(null)
  }, [])

  const handleDeleteRequest = useCallback(() => {
    if (editingSetlist) {
      setDeletingSetlist(editingSetlist)
      setEditingSetlist(null)
    }
  }, [editingSetlist])

  const handleDeleteConfirm = useCallback(async () => {
    if (deletingSetlist) {
      await setlistsStore.delete(deletingSetlist.id)
      setDeletingSetlist(null)
    }
  }, [deletingSetlist])

  const handleDeleteCancel = useCallback(() => {
    setDeletingSetlist(null)
  }, [])

  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <AmbientBackground variant="subtle" />
        <Header />
        <main className="pt-20 pb-8 px-4 flex items-center justify-center min-h-screen relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
            className="text-center max-w-sm"
          >
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--color-surface1)" }}
            >
              <Queue size={32} style={{ color: "var(--color-text-muted)" }} />
            </div>
            <h2 className="text-xl font-semibold mb-2">Sign in to create setlists</h2>
            <p className="mb-6" style={{ color: "var(--color-text3)" }}>
              Organize your songs into custom setlists for practice or performances
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              <SignIn size={20} />
              Sign in
            </Link>
          </motion.div>
        </main>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <Header />
      <main className="pt-20 pb-8 px-4 relative z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold font-mono">Setlists</h1>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:brightness-110"
              style={{ background: "var(--color-accent)", color: "white" }}
            >
              <Plus size={20} weight="bold" />
              Create setlist
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="p-4 rounded-sm animate-pulse"
                  style={{ background: "var(--color-surface1)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-md"
                      style={{ background: "var(--color-surface2)" }}
                    />
                    <div className="flex-1">
                      <div
                        className="h-4 w-32 rounded mb-2"
                        style={{ background: "var(--color-surface2)" }}
                      />
                      <div
                        className="h-3 w-20 rounded"
                        style={{ background: "var(--color-surface2)" }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : setlists.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.default}
              className="text-center py-12"
            >
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--color-surface1)" }}
              >
                <Queue size={32} style={{ color: "var(--color-text-muted)" }} />
              </div>
              <h2 className="text-xl font-semibold mb-2">Create your first setlist</h2>
              <p className="mb-6" style={{ color: "var(--color-text3)" }}>
                Organize your favorite songs for practice or performances
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                <Plus size={20} weight="bold" />
                Create setlist
              </button>
            </motion.div>
          ) : (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
              aria-label="Your setlists"
            >
              {setlists.map(setlist => {
                const albumArts = albumArtsMap.get(setlist.id)
                return (
                  <li key={setlist.id}>
                    <SetlistCard
                      id={setlist.id}
                      name={setlist.name}
                      songCount={setlist.songCount}
                      {...(setlist.color ? { color: setlist.color } : {})}
                      {...(albumArts && albumArts.length > 0 ? { albumArts } : {})}
                      onClick={() => handleSetlistClick(setlist)}
                      onEdit={() => handleEditClick(setlist)}
                    />
                  </li>
                )
              })}
            </motion.ul>
          )}
        </div>
      </main>

      <CreateSetlistModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {editingSetlist && (
        <EditSetlistModal
          isOpen={true}
          onClose={handleEditClose}
          setlist={{
            id: editingSetlist.id,
            name: editingSetlist.name,
            ...(editingSetlist.description ? { description: editingSetlist.description } : {}),
            ...(editingSetlist.color ? { color: editingSetlist.color } : {}),
          }}
          onDelete={handleDeleteRequest}
        />
      )}

      <AnimatePresence>
        {deletingSetlist && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={handleDeleteCancel}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={springs.default}
              className="mx-4 w-full max-w-sm rounded-sm p-6 shadow-xl"
              style={{ background: "var(--color-surface1)" }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--color-text)" }}>
                Delete setlist?
              </h2>
              <p className="mb-6" style={{ color: "var(--color-text3)" }}>
                This will permanently delete "{deletingSetlist.name}" and remove all songs from it.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteCancel}
                  className="flex-1 px-4 py-2.5 rounded-lg transition-colors hover:brightness-110"
                  style={{ background: "var(--color-surface2)", color: "var(--color-text)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="flex-1 px-4 py-2.5 rounded-lg transition-colors hover:brightness-110"
                  style={{ background: "var(--color-danger)", color: "white" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="w-10 h-10 rounded-sm flex items-center justify-center transition-colors hover:brightness-110"
          style={{ background: "var(--color-surface2)" }}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="text-lg font-semibold flex items-center gap-2">
          <Logo size={24} />
          ScrollTunes
        </span>
      </div>
    </header>
  )
}
