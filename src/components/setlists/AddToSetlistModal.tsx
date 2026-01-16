"use client"

import { springs } from "@/animations"
import {
  type Setlist,
  setlistsStore,
  useIsAuthenticated,
  useSetlists,
  useSetlistsLoading,
} from "@/core"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { Check, MusicNote, Plus, SpinnerGap, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CreateSetlistModal } from "./CreateSetlistModal"

export interface AddToSetlistModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly song: {
    readonly songId: number
    readonly title: string
    readonly artist: string
    readonly album?: string
  }
}

export function AddToSetlistModal({ isOpen, onClose, song }: AddToSetlistModalProps) {
  const isAuthenticated = useIsAuthenticated()
  const setlists = useSetlists()
  const isLoading = useSetlistsLoading()
  const [addingToSetlistId, setAddingToSetlistId] = useState<string | null>(null)
  const [successSetlistId, setSuccessSetlistId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const displayTitle = useMemo(() => normalizeTrackName(song.title), [song.title])
  const displayArtist = useMemo(() => normalizeArtistName(song.artist), [song.artist])

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      setlistsStore.fetchAll()
    }
  }, [isOpen, isAuthenticated])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const isSongInSetlist = useCallback(
    (setlist: Setlist) => {
      const songIdStr = String(song.songId)
      return (
        setlist.songs?.some(s => s.songId === songIdStr && s.songProvider === "lrclib") ?? false
      )
    },
    [song.songId],
  )

  const handleToggleSetlist = useCallback(
    async (setlistId: string) => {
      if (addingToSetlistId) return

      const setlist = setlists.find(s => s.id === setlistId)
      if (!setlist) return

      const isInSetlist = isSongInSetlist(setlist)
      setAddingToSetlistId(setlistId)

      let success: boolean
      if (isInSetlist) {
        success = await setlistsStore.removeSong(setlistId, `lrclib:${song.songId}`)
      } else {
        const addedSong = await setlistsStore.addSong(setlistId, {
          songId: String(song.songId),
          songProvider: "lrclib",
          title: song.title,
          artist: song.artist,
          ...(song.album !== undefined && { album: song.album }),
        })
        success = addedSong !== null
      }

      setAddingToSetlistId(null)

      if (success && !isInSetlist) {
        setSuccessSetlistId(setlistId)
        setTimeout(() => {
          setSuccessSetlistId(null)
        }, 600)
      }
    },
    [addingToSetlistId, song, setlists, isSongInSetlist],
  )

  const handleCreateSetlist = useCallback(
    (setlist: Setlist) => {
      setShowCreateModal(false)
      handleToggleSetlist(setlist.id)
    },
    [handleToggleSetlist],
  )

  const handleClose = useCallback(() => {
    setAddingToSetlistId(null)
    setSuccessSetlistId(null)
    onClose()
  }, [onClose])

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={handleBackdropClick}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={springs.default}
              className="relative mx-4 w-full max-w-sm rounded-sm p-6 shadow-xl"
              style={{ background: "var(--color-surface1)" }}
            >
              <button
                type="button"
                onClick={handleClose}
                className="absolute right-4 top-4 rounded-full p-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                style={{ color: "var(--color-text3)" }}
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>

              <h2
                className="text-xl font-semibold mb-2 pr-8"
                style={{ color: "var(--color-text)" }}
              >
                Add to setlist
              </h2>
              <p className="text-sm mb-4 truncate" style={{ color: "var(--color-text3)" }}>
                {displayTitle} — {displayArtist}
              </p>

              {!isAuthenticated ? (
                <div className="text-center py-6">
                  <MusicNote
                    size={48}
                    weight="fill"
                    className="mx-auto mb-3"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                  <p className="mb-4" style={{ color: "var(--color-text3)" }}>
                    Sign in to use setlists
                  </p>
                  <Link
                    href="/login"
                    className="inline-block px-6 py-2.5 rounded-sm transition-colors hover:brightness-110"
                    style={{ background: "var(--color-accent)", color: "white" }}
                    onClick={handleClose}
                  >
                    Sign in
                  </Link>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  >
                    <SpinnerGap size={32} style={{ color: "var(--color-accent)" }} />
                  </motion.div>
                </div>
              ) : setlists.length === 0 ? (
                <div className="text-center py-6">
                  <MusicNote
                    size={48}
                    weight="fill"
                    className="mx-auto mb-3"
                    style={{ color: "var(--color-text-muted)" }}
                  />
                  <p className="mb-4" style={{ color: "var(--color-text3)" }}>
                    Create your first setlist
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-sm transition-colors hover:brightness-110"
                    style={{ background: "var(--color-accent)", color: "white" }}
                  >
                    <Plus size={20} weight="bold" />
                    Create setlist
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {setlists.map(setlist => {
                    const isAdding = addingToSetlistId === setlist.id
                    const isSuccess = successSetlistId === setlist.id
                    const isInSetlist = isSongInSetlist(setlist)

                    return (
                      <button
                        key={setlist.id}
                        type="button"
                        onClick={() => handleToggleSetlist(setlist.id)}
                        disabled={addingToSetlistId !== null}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-sm transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                        style={{
                          background: isInSetlist
                            ? "var(--color-accent-soft)"
                            : "var(--color-surface2)",
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: setlist.color ?? "var(--color-accent)" }}
                        >
                          {isAdding ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Number.POSITIVE_INFINITY,
                                ease: "linear",
                              }}
                            >
                              <SpinnerGap size={20} style={{ color: "white" }} />
                            </motion.div>
                          ) : isSuccess || isInSetlist ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            >
                              <Check size={20} weight="bold" style={{ color: "white" }} />
                            </motion.div>
                          ) : (
                            <MusicNote size={20} weight="fill" style={{ color: "white" }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-medium truncate"
                            style={{ color: "var(--color-text)" }}
                          >
                            {setlist.name}
                          </p>
                          <p className="text-sm" style={{ color: "var(--color-text3)" }}>
                            {setlist.songCount} {setlist.songCount === 1 ? "song" : "songs"}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    disabled={addingToSetlistId !== null}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-sm border-2 border-dashed transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--color-surface1)" }}
                    >
                      <Plus size={20} style={{ color: "var(--color-text3)" }} />
                    </div>
                    <span style={{ color: "var(--color-text3)" }}>Create new setlist</span>
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateSetlistModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateSetlist}
      />
    </>
  )
}
