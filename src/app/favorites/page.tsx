"use client"

import { springs } from "@/animations"
import { AlbumArtSkeleton, Logo } from "@/components/ui"
import { type FavoriteItem, favoritesStore, useFavorites } from "@/core"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath } from "@/lib/slug"
import { ArrowLeft, ArrowCounterClockwise, Heart, MusicNote } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { memo, useCallback, useEffect, useRef, useState } from "react"

interface RemovedItem {
  readonly song: FavoriteItem
  readonly albumArt: string | null | undefined
}

export default function FavoritesPage() {
  const favorites = useFavorites()
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRemove = useCallback((song: FavoriteItem, albumArt: string | null | undefined) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }

    setRemovedItem({ song, albumArt })
    favoritesStore.remove(song.id)

    undoTimeoutRef.current = setTimeout(() => {
      setRemovedItem(null)
    }, 5000)
  }, [])

  const handleUndo = useCallback(() => {
    if (!removedItem) return

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current)
    }

    favoritesStore.add(
      {
        id: removedItem.song.id,
        title: removedItem.song.title,
        artist: removedItem.song.artist,
        ...(removedItem.song.album ? { album: removedItem.song.album } : {}),
        ...(removedItem.albumArt ? { albumArt: removedItem.albumArt } : {}),
      },
      removedItem.song.addedAt,
    )
    setRemovedItem(null)
  }, [removedItem])

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Header />
      <main className="pt-20 pb-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Favorites</h1>
            <p className="text-sm text-neutral-500">
              {favorites.length} {favorites.length === 1 ? "song" : "songs"}
            </p>
          </div>

          {favorites.length === 0 && !removedItem ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.default}
              className="text-center py-12"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 flex items-center justify-center">
                <Heart size={32} className="text-neutral-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
              <p className="text-neutral-400 mb-6">
                Tap the heart icon on any song to add it to your favorites
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Find songs
              </Link>
            </motion.div>
          ) : (
            <ul className="space-y-2" aria-label="Favorite songs">
              <AnimatePresence mode="popLayout">
                {favorites.map((song, index) => (
                  <FavoriteSongItem
                    key={song.id}
                    song={song}
                    index={index}
                    onRemove={handleRemove}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
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
              <span className="text-sm text-neutral-300">Removed from favorites</span>
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

interface FavoriteSongItemProps {
  readonly song: FavoriteItem
  readonly index: number
  readonly onRemove: (song: FavoriteItem, albumArt: string | null | undefined) => void
}

const FavoriteSongItem = memo(function FavoriteSongItem({
  song,
  index,
  onRemove,
}: FavoriteSongItemProps) {
  const [albumArt, setAlbumArt] = useState<string | null | undefined>(song.albumArt ?? undefined)
  const [isLoading, setIsLoading] = useState(!song.albumArt)

  useEffect(() => {
    if (song.albumArt) {
      setAlbumArt(song.albumArt)
      setIsLoading(false)
      return
    }

    const cached = loadCachedLyrics(song.id)
    if (cached?.albumArt) {
      setAlbumArt(cached.albumArt)
      setIsLoading(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${song.id}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoading(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | null | undefined

        if (data.lyrics) {
          saveCachedLyrics(song.id, {
            lyrics: data.lyrics,
            bpm: data.bpm ?? null,
            key: data.key ?? null,
            albumArt: art ?? undefined,
            spotifyId: data.spotifyId ?? undefined,
            bpmSource: data.attribution?.bpm ?? undefined,
            lyricsSource: data.attribution?.lyrics ?? undefined,
          })
        }

        setAlbumArt(art ?? null)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setAlbumArt(null)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [song.id, song.albumArt])

  const songPath = makeCanonicalPath({
    id: song.id,
    title: song.title,
    artist: song.artist,
  })

  const handleToggle = useCallback(() => {
    onRemove(song, albumArt)
  }, [song, albumArt, onRemove])

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
      transition={{ ...springs.default, delay: index * 0.03 }}
    >
      <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900">
        <Link
          href={songPath}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
            {isLoading ? (
              <AlbumArtSkeleton />
            ) : albumArt ? (
              <img src={albumArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <MusicNote size={20} weight="fill" className="text-neutral-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{song.title}</p>
            <p className="text-sm text-neutral-400 truncate">{song.artist}</p>
          </div>
        </Link>
        <motion.button
          type="button"
          onClick={handleToggle}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800/50 hover:bg-neutral-700/50 transition-colors"
          aria-label="Remove from favorites"
          whileTap={{ scale: 0.9 }}
        >
          <Heart size={24} weight="fill" className="text-red-500" />
        </motion.button>
      </div>
    </motion.li>
  )
})

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="text-lg font-semibold flex items-center gap-2">
          <Logo size={24} className="text-indigo-500" />
          ScrollTunes
        </span>
      </div>
    </header>
  )
}
