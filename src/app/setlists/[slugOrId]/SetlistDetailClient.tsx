"use client"

import { springs } from "@/animations"
import { EditSetlistModal } from "@/components/setlists"
import { BackButton, Logo, SongListItem } from "@/components/ui"
import { setlistsStore } from "@/core"
import { uuidToBase64Url } from "@/lib/slug"
import {
  ArrowCounterClockwise,
  Check,
  Copy,
  MusicNotesSimple,
  PencilSimple,
  Queue,
  Share,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useRef, useState } from "react"

interface SetlistSong {
  readonly id: string
  readonly songId: string
  readonly songProvider: string
  readonly songTitle: string
  readonly songArtist: string
  readonly songAlbum?: string
  readonly sortOrder: number
}

interface Setlist {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly color: string | null
}

interface SetlistDetailClientProps {
  readonly setlist: Setlist
  readonly songs: readonly SetlistSong[]
}

interface RemovedItem {
  readonly song: SetlistSong
  readonly index: number
  readonly albumArt: string | undefined
}

export function SetlistDetailClient({ setlist, songs: initialSongs }: SetlistDetailClientProps) {
  const router = useRouter()
  const shortCode = uuidToBase64Url(setlist.id)
  const shortUrl =
    typeof window !== "undefined" ? `${window.location.origin}/sl/${shortCode}` : `/sl/${shortCode}`

  const [songs, setSongs] = useState<readonly SetlistSong[]>(initialSongs)
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null)
  const [currentSetlist, setCurrentSetlist] = useState(setlist)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditClick = useCallback(() => {
    setShowEditModal(true)
  }, [])

  const handleEditSave = useCallback(() => {
    const updated = setlistsStore.getSetlist(setlist.id)
    if (updated) {
      setCurrentSetlist({
        id: updated.id,
        name: updated.name,
        description: updated.description ?? null,
        color: updated.color ?? null,
      })
    }
  }, [setlist.id])

  const handleDeleteRequest = useCallback(() => {
    setShowEditModal(false)
    setShowDeleteConfirm(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    const success = await setlistsStore.delete(setlist.id)
    if (success) {
      router.push("/setlists")
    }
  }, [setlist.id, router])

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  const handleRemove = useCallback(
    (songId: string, index: number, albumArt: string | undefined) => {
      const song = songs[index]
      if (!song) return

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }

      setRemovedItem({ song, index, albumArt })
      setSongs(prev => prev.filter((_, i) => i !== index))

      const compositeId = `${song.songProvider}:${song.songId}`
      setlistsStore.removeSong(setlist.id, compositeId)

      undoTimeoutRef.current = setTimeout(() => {
        setRemovedItem(null)
      }, 5000)
    },
    [songs, setlist.id],
  )

  const handleUndo = useCallback(() => {
    if (!removedItem) return

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }

    const { song, index } = removedItem

    // Optimistically restore the song in the UI immediately
    const restoredSongs = [...songs]
    restoredSongs.splice(index, 0, song)
    setSongs(restoredSongs)
    setRemovedItem(null)

    // Sync to server in background: add song then reorder to correct position
    const syncToServer = async () => {
      const addedSong = await setlistsStore.addSong(setlist.id, {
        songId: song.songId,
        songProvider: song.songProvider,
        title: song.songTitle,
        artist: song.songArtist,
        ...(song.songAlbum !== undefined && { album: song.songAlbum }),
      })

      if (addedSong) {
        // Reorder to put the song back in its original position
        // Build the record IDs array with the new song's ID at the correct position
        const recordIds = restoredSongs.map((s, i) => (i === index ? addedSong.id : s.id))
        await setlistsStore.reorderSongs(setlist.id, recordIds)

        // Update local state with the new ID so subsequent operations use it
        setSongs(prev => prev.map((s, i) => (i === index ? { ...s, id: addedSong.id } : s)))
      }
    }

    syncToServer()
  }, [removedItem, setlist.id, songs])

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header setlistName={currentSetlist.name} shortUrl={shortUrl} onEdit={handleEditClick} />

      <main className="pt-20 pb-8 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
          >
            <div className="flex items-start gap-4 mb-6">
              <div
                className="flex-shrink-0 w-16 h-16 rounded-sm flex items-center justify-center"
                style={{ backgroundColor: currentSetlist.color ?? "#262626" }}
              >
                <Queue size={32} weight="fill" className="text-white/80" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold font-mono truncate">{currentSetlist.name}</h1>
                {currentSetlist.description && (
                  <p className="mt-1" style={{ color: "var(--color-text3)" }}>
                    {currentSetlist.description}
                  </p>
                )}
                <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
                  {songs.length} {songs.length === 1 ? "song" : "songs"}
                </p>
              </div>
            </div>

            {songs.length === 0 && !removedItem ? (
              <div className="text-center py-12">
                <div
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{ background: "var(--color-surface1)" }}
                >
                  <MusicNotesSimple size={32} style={{ color: "var(--color-text-muted)" }} />
                </div>
                <p style={{ color: "var(--color-text3)" }}>This setlist is empty</p>
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Songs in setlist">
                <AnimatePresence mode="popLayout">
                  {songs.map((song, index) => (
                    <SetlistSongItem
                      key={`${song.songProvider}:${song.songId}`}
                      song={song}
                      index={index}
                      onRemove={handleRemove}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {removedItem && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={springs.default}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-sm shadow-lg"
              style={{
                background: "var(--color-surface1)",
                border: "1px solid var(--color-border)",
              }}
            >
              <span className="text-sm" style={{ color: "var(--color-text3)" }}>
                Removed
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--color-accent)", color: "white" }}
              >
                <ArrowCounterClockwise size={16} />
                Undo
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <EditSetlistModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        setlist={{
          id: currentSetlist.id,
          name: currentSetlist.name,
          ...(currentSetlist.description ? { description: currentSetlist.description } : {}),
          ...(currentSetlist.color ? { color: currentSetlist.color } : {}),
        }}
        onSave={handleEditSave}
        onDelete={handleDeleteRequest}
      />

      <AnimatePresence>
        {showDeleteConfirm && (
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
              <h2
                className="text-xl font-semibold font-mono mb-2"
                style={{ color: "var(--color-text)" }}
              >
                Delete setlist?
              </h2>
              <p className="mb-6" style={{ color: "var(--color-text3)" }}>
                This will permanently delete "{currentSetlist.name}" and remove all songs from it.
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

interface SetlistSongItemProps {
  readonly song: SetlistSong
  readonly index: number
  readonly onRemove: (songId: string, index: number, albumArt: string | undefined) => void
}

const SetlistSongItem = memo(function SetlistSongItem({
  song,
  index,
  onRemove,
}: SetlistSongItemProps) {
  const handleRemove = useCallback(
    (albumArt: string | undefined) => {
      onRemove(song.songId, index, albumArt)
    },
    [song.songId, index, onRemove],
  )

  if (song.songProvider !== "lrclib") {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
        transition={{ ...springs.default, delay: index * 0.03 }}
      >
        <div
          className="flex items-center gap-3 p-4 rounded-sm opacity-50"
          style={{ background: "var(--color-surface1)" }}
        >
          <p className="font-medium truncate">{song.songTitle}</p>
          <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
            {song.songArtist}
          </p>
        </div>
      </motion.li>
    )
  }

  const songId = Number(song.songId)
  if (Number.isNaN(songId)) {
    return null
  }

  const renderAction = ({ albumArt }: { albumArt: string | undefined }) => (
    <button
      type="button"
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
        handleRemove(albumArt)
      }}
      className="w-8 h-8 flex items-center justify-center rounded-sm transition-colors hover:brightness-110"
      style={{ background: "var(--color-surface2)", color: "var(--color-text-muted)" }}
      aria-label="Remove from setlist"
    >
      <X size={16} />
    </button>
  )

  return (
    <li>
      <SongListItem
        id={songId}
        title={song.songTitle}
        artist={song.songArtist}
        showFavorite
        renderAction={renderAction}
        animationIndex={index}
        animateExit
      />
    </li>
  )
})

interface HeaderProps {
  readonly setlistName: string
  readonly shortUrl: string
  readonly onEdit: () => void
}

function Header({ setlistName, shortUrl, onEdit }: HeaderProps) {
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(() => {
    setShowShareMenu(prev => !prev)
  }, [])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shortUrl)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setShowShareMenu(false)
    }, 1500)
  }, [shortUrl])

  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
      style={{
        background: "var(--color-header-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <BackButton fallbackHref="/setlists" ariaLabel="Back to setlists" />

        <span
          className="flex-1 text-lg font-semibold flex items-center gap-2 truncate"
          style={{ color: "var(--color-text)" }}
        >
          <Logo size={24} className="flex-shrink-0" />
          <span className="truncate">{setlistName}</span>
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="w-10 h-10 rounded-sm flex items-center justify-center transition-colors hover:brightness-110"
          style={{ background: "var(--color-surface2)" }}
          aria-label="Edit setlist"
        >
          <PencilSimple size={20} />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={handleShare}
            className="w-10 h-10 rounded-sm flex items-center justify-center transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)" }}
            aria-label="Share setlist"
          >
            <Share size={20} />
          </button>

          {showShareMenu && (
            <div
              className="absolute right-0 top-12 w-72 p-3 rounded-sm shadow-xl"
              style={{
                background: "var(--color-surface1)",
                border: "1px solid var(--color-border)",
              }}
            >
              <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
                Share link
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm truncate flex-1 font-mono px-2 py-1.5 rounded"
                  style={{ background: "var(--color-surface2)", color: "var(--color-text2)" }}
                >
                  {shortUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors hover:brightness-110"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
