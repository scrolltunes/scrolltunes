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
        success = await setlistsStore.addSong(setlistId, {
          songId: String(song.songId),
          songProvider: "lrclib",
          title: song.title,
          artist: song.artist,
        })
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
              className="relative mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl"
            >
              <button
                type="button"
                onClick={handleClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>

              <h2 className="text-xl font-semibold text-white mb-2 pr-8">Add to setlist</h2>
              <p className="text-sm text-neutral-400 mb-4 truncate">
                {displayTitle} — {displayArtist}
              </p>

              {!isAuthenticated ? (
                <div className="text-center py-6">
                  <MusicNote size={48} weight="fill" className="mx-auto mb-3 text-neutral-600" />
                  <p className="text-neutral-400 mb-4">Sign in to use setlists</p>
                  <Link
                    href="/login"
                    className="inline-block px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
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
                    <SpinnerGap size={32} className="text-indigo-500" />
                  </motion.div>
                </div>
              ) : setlists.length === 0 ? (
                <div className="text-center py-6">
                  <MusicNote size={48} weight="fill" className="mx-auto mb-3 text-neutral-600" />
                  <p className="text-neutral-400 mb-4">Create your first setlist</p>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
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
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                          isInSetlist
                            ? "bg-indigo-600/20 hover:bg-indigo-600/30"
                            : "bg-neutral-800 hover:bg-neutral-700"
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: setlist.color ?? "#6366f1" }}
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
                              <SpinnerGap size={20} className="text-white" />
                            </motion.div>
                          ) : isSuccess || isInSetlist ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            >
                              <Check size={20} weight="bold" className="text-white" />
                            </motion.div>
                          ) : (
                            <MusicNote size={20} weight="fill" className="text-white" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-white font-medium truncate">{setlist.name}</p>
                          <p className="text-sm text-neutral-400">
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
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-10 h-10 rounded-lg bg-neutral-700 flex items-center justify-center flex-shrink-0">
                      <Plus size={20} className="text-neutral-400" />
                    </div>
                    <span className="text-neutral-400">Create new setlist</span>
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
