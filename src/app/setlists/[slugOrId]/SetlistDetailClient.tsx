"use client"

import { springs } from "@/animations"
import { BackButton, Logo, SongListItem } from "@/components/ui"
import { setlistsStore } from "@/core"
import { uuidToBase64Url } from "@/lib/slug"
import {
  ArrowCounterClockwise,
  Check,
  Copy,
  MusicNotesSimple,
  Queue,
  Share,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

interface SetlistSong {
  readonly id: string
  readonly songId: string
  readonly songProvider: string
  readonly songTitle: string
  readonly songArtist: string
  readonly sortOrder: number
}

interface Setlist {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly color: string | null
  readonly icon: string | null
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
  const shortCode = uuidToBase64Url(setlist.id)
  const shortUrl =
    typeof window !== "undefined" ? `${window.location.origin}/sl/${shortCode}` : `/sl/${shortCode}`

  const [songs, setSongs] = useState<readonly SetlistSong[]>(initialSongs)
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header setlistName={setlist.name} shortUrl={shortUrl} />

      <main className="pt-20 pb-8 px-4">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.default}
          >
            <div className="flex items-start gap-4 mb-6">
              <div
                className="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: setlist.color ?? "#262626" }}
              >
                <Queue size={32} weight="fill" className="text-white/80" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold truncate">{setlist.name}</h1>
                {setlist.description && (
                  <p className="text-neutral-400 mt-1">{setlist.description}</p>
                )}
                <p className="text-sm text-neutral-500 mt-2">
                  {songs.length} {songs.length === 1 ? "song" : "songs"}
                </p>
              </div>
            </div>

            {songs.length === 0 && !removedItem ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
                  <MusicNotesSimple size={32} className="text-neutral-500" />
                </div>
                <p className="text-neutral-400">This setlist is empty</p>
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
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-800 rounded-xl shadow-lg border border-neutral-700">
              <span className="text-sm text-neutral-300">Removed</span>
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
              >
                <ArrowCounterClockwise size={16} />
                Undo
              </button>
            </div>
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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900 opacity-50">
          <p className="font-medium truncate">{song.songTitle}</p>
          <p className="text-sm text-neutral-400 truncate">{song.songArtist}</p>
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
      className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800/50 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
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

function Header({ setlistName, shortUrl }: { setlistName: string; shortUrl: string }) {
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
    <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <BackButton fallbackHref="/setlists" ariaLabel="Back to setlists" />

        <span className="flex-1 text-lg font-semibold flex items-center gap-2 truncate">
          <Logo size={24} className="text-indigo-500 flex-shrink-0" />
          <span className="truncate">{setlistName}</span>
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={handleShare}
            className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
            aria-label="Share setlist"
          >
            <Share size={20} />
          </button>

          {showShareMenu && (
            <div className="absolute right-0 top-12 w-72 p-3 rounded-xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <p className="text-xs text-neutral-500 mb-2">Share link</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 truncate flex-1 font-mono bg-neutral-800 px-2 py-1.5 rounded">
                  {shortUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm transition-colors"
                >
                  {copied ? <Check size={16} className="text-white" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
