"use client"

import { springs } from "@/animations"
import { AmbientBackground, Logo, SongListItem } from "@/components/ui"
import { type FavoriteItem, favoritesStore, useFavorites } from "@/core"
import { ArrowCounterClockwise, ArrowLeft, Heart } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { memo, useCallback, useEffect, useRef, useState } from "react"

interface RemovedItem {
  readonly song: FavoriteItem
  readonly albumArt: string | undefined
}

export default function FavoritesPage() {
  const favorites = useFavorites()
  const [removedItem, setRemovedItem] = useState<RemovedItem | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRemove = useCallback(
    (id: number, albumArt: string | undefined) => {
      const song = favorites.find(f => f.id === id)
      if (!song) return

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current)
      }

      setRemovedItem({ song, albumArt })
      favoritesStore.remove(id)

      undoTimeoutRef.current = setTimeout(() => {
        setRemovedItem(null)
      }, 5000)
    },
    [favorites],
  )

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
        album: removedItem.song.album ?? "",
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
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <AmbientBackground variant="subtle" />
      <Header />
      <main className="pt-20 pb-8 px-4 relative z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold">Favorites</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
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
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--color-surface1)" }}
              >
                <Heart size={32} style={{ color: "var(--color-text-muted)" }} />
              </div>
              <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
              <p className="mb-6" style={{ color: "var(--color-text3)" }}>
                Tap the heart icon on any song to add it to your favorites
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-colors hover:brightness-110"
                style={{ background: "var(--color-accent)", color: "white" }}
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
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
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
    </div>
  )
}

interface FavoriteSongItemProps {
  readonly song: FavoriteItem
  readonly index: number
  readonly onRemove: (id: number, albumArt: string | undefined) => void
}

const FavoriteSongItem = memo(function FavoriteSongItem({
  song,
  index,
  onRemove,
}: FavoriteSongItemProps) {
  const renderAction = useCallback(
    ({ albumArt }: { albumArt: string | undefined }) => (
      <motion.button
        type="button"
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(song.id, albumArt)
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        style={{ background: "var(--color-surface2)" }}
        aria-label="Remove from favorites"
        whileTap={{ scale: 0.9 }}
      >
        <Heart size={18} weight="fill" style={{ color: "var(--color-danger)" }} />
      </motion.button>
    ),
    [song.id, onRemove],
  )

  return (
    <li key={song.id}>
      <SongListItem
        id={song.id}
        title={song.title}
        artist={song.artist}
        album={song.album}
        albumArt={song.albumArt}
        renderAction={renderAction}
        animationIndex={index}
        animateExit
      />
    </li>
  )
})

function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 backdrop-blur-lg"
      style={{
        background: "rgba(7, 10, 18, 0.8)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:brightness-110"
          style={{ background: "var(--color-surface2)" }}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <span className="text-lg font-semibold flex items-center gap-2">
          <Logo size={24} style={{ color: "var(--color-accent)" }} />
          ScrollTunes
        </span>
      </div>
    </header>
  )
}
