"use client"

import { springs } from "@/animations"
import type { Lyrics } from "@/core"
import { ArrowLeft, Play, SpinnerGap, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useEffect, useState } from "react"

export interface SongConfirmationProps {
  readonly track: {
    readonly id: string
    readonly name: string
    readonly artist: string
    readonly album: string
    readonly albumArt?: string
    readonly duration: number
  }
  readonly onConfirm: (lyrics: Lyrics) => void
  readonly onBack: () => void
  readonly className?: string
}

type FetchState =
  | { readonly _tag: "loading" }
  | { readonly _tag: "success"; readonly lyrics: Lyrics }
  | { readonly _tag: "error"; readonly message: string }

export const SongConfirmation = memo(function SongConfirmation({
  track,
  onConfirm,
  onBack,
  className = "",
}: SongConfirmationProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ _tag: "loading" })

  useEffect(() => {
    const controller = new AbortController()

    async function fetchLyrics() {
      try {
        const params = new URLSearchParams({
          track: track.name,
          artist: track.artist,
        })
        const response = await fetch(`/api/lyrics?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("Failed to fetch lyrics")
        }

        const data = await response.json()

        if (!data.lyrics || data.lyrics.lines.length === 0) {
          setFetchState({ _tag: "error", message: "No synced lyrics found for this track" })
          return
        }

        setFetchState({ _tag: "success", lyrics: data.lyrics })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setFetchState({
          _tag: "error",
          message: error instanceof Error ? error.message : "Failed to fetch lyrics",
        })
      }
    }

    fetchLyrics()

    return () => {
      controller.abort()
    }
  }, [track.name, track.artist])

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  return (
    <motion.div
      className={`fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={springs.default}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 bg-neutral-950 border-t border-neutral-800 rounded-t-3xl p-6 pb-8 max-h-[85vh] overflow-y-auto"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={springs.default}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-6"
          aria-label="Go back"
        >
          <ArrowLeft size={20} weight="bold" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <div className="flex flex-col items-center text-center">
          <motion.div
            className="w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden bg-neutral-800 shadow-2xl mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springs.bouncy, delay: 0.1 }}
          >
            {track.albumArt ? (
              <img
                src={track.albumArt}
                alt={`${track.album} album art`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                <div className="text-neutral-600 text-6xl font-bold">
                  {track.name.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            className="mb-8"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...springs.default, delay: 0.15 }}
          >
            <h2 className="text-2xl font-bold text-white mb-1">{track.name}</h2>
            <p className="text-lg text-neutral-400 mb-1">{track.artist}</p>
            <p className="text-sm text-neutral-500">
              {track.album} • {formatDuration(track.duration)}
            </p>
          </motion.div>

          <motion.div
            className="w-full max-w-sm"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...springs.default, delay: 0.2 }}
          >
            {fetchState._tag === "loading" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <SpinnerGap size={32} className="text-indigo-500 animate-spin" weight="bold" />
                <p className="text-neutral-400">Fetching lyrics...</p>
              </div>
            )}

            {fetchState._tag === "success" && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-green-400 font-medium">Ready to play</p>
                <button
                  type="button"
                  onClick={() => onConfirm(fetchState.lyrics)}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
                >
                  <Play size={24} weight="fill" />
                  <span>Start</span>
                </button>
              </div>
            )}

            {fetchState._tag === "error" && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <Warning size={24} weight="fill" />
                  <p className="font-medium">{fetchState.message}</p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <button
                    type="button"
                    onClick={() =>
                      onConfirm({
                        songId: track.id,
                        title: track.name,
                        artist: track.artist,
                        duration: track.duration / 1000,
                        lines: [
                          {
                            id: "placeholder",
                            text: "No synced lyrics available",
                            startTime: 0,
                            endTime: track.duration / 1000,
                          },
                        ],
                      })
                    }
                    className="w-full px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl transition-colors"
                  >
                    Play without synced lyrics
                  </button>
                  <button
                    type="button"
                    onClick={onBack}
                    className="w-full px-6 py-3 text-neutral-400 hover:text-white font-medium transition-colors"
                  >
                    Go back
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
})
