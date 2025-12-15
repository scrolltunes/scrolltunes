"use client"

import { springs } from "@/animations"
import {
  FloatingMetronome,
  ProgressIndicator,
  TempoControl,
  VoiceIndicator,
} from "@/components/audio"
import { LyricsDisplay } from "@/components/display"
import { Attribution } from "@/components/ui"
import { type Lyrics, usePlayerControls, usePlayerState, usePreferences } from "@/core"
import {
  useAutoHide,
  useDoubleTap,
  useKeyboardShortcuts,
  useShakeDetection,
  useTempoPreference,
  useVoiceTrigger,
  useWakeLock,
} from "@/hooks"
import { isLyricsApiSuccess, type LyricsApiResponse } from "@/lib"
import { parseTrackSlugWithId } from "@/lib/slug"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  CaretDown,
  CaretUp,
  MusicNote,
  Pause,
  Play,
  SpinnerGap,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

type LoadState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Error"; readonly message: string }
  | { readonly _tag: "Loaded"; readonly lyrics: Lyrics; readonly bpm: number | null }

export default function SongPage() {
  const params = useParams<{ artistSlug: string; trackSlugWithId: string }>()
  const [loadState, setLoadState] = useState<LoadState>({ _tag: "Loading" })
  const [showControls, setShowControls] = useState(false)

  const playerState = usePlayerState()
  const { play, pause, reset, load } = usePlayerControls()
  const preferences = usePreferences()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })

  const lrclibId = parseTrackSlugWithId(params.trackSlugWithId)

  useKeyboardShortcuts({ enabled: loadState._tag === "Loaded" })

  useTempoPreference({
    songId: lrclibId !== null ? `lrclib-${lrclibId}` : null,
    autoLoad: true,
    autoSave: true,
  })

  const isLoaded = loadState._tag === "Loaded"

  useWakeLock({ enabled: isLoaded && preferences.wakeLockEnabled })

  const { isVisible: isHeaderVisible } = useAutoHide({
    timeoutMs: preferences.autoHideControlsMs,
    enabled: isLoaded && preferences.autoHideControlsMs > 0,
  })

  const handleTogglePlayPause = useCallback(() => {
    if (playerState._tag === "Playing") {
      pause()
    } else {
      play()
    }
  }, [playerState._tag, play, pause])

  const doubleTapRef = useDoubleTap<HTMLDivElement>({
    onDoubleTap: handleTogglePlayPause,
    enabled: isLoaded && preferences.doubleTapEnabled,
  })

  useShakeDetection({
    onShake: reset,
    enabled: isLoaded && preferences.shakeToRestartEnabled,
  })

  useEffect(() => {
    if (lrclibId === null) {
      setLoadState({ _tag: "Error", message: "Invalid song URL" })
      return
    }

    const controller = new AbortController()

    async function fetchLyrics() {
      try {
        const response = await fetch(`/api/lyrics/${lrclibId}`, {
          signal: controller.signal,
        })
        const data: LyricsApiResponse = await response.json()

        if (!response.ok || !isLyricsApiSuccess(data)) {
          const errorMessage = "error" in data ? data.error : "Failed to load lyrics"
          setLoadState({ _tag: "Error", message: errorMessage })
          return
        }

        load(data.lyrics)
        setLoadState({ _tag: "Loaded", lyrics: data.lyrics, bpm: data.bpm })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setLoadState({ _tag: "Error", message: "Failed to load lyrics" })
      }
    }

    fetchLyrics()

    return () => {
      controller.abort()
    }
  }, [lrclibId, load])

  const handleToggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  const isPlaying = playerState._tag === "Playing"
  const isReady = playerState._tag !== "Idle"

  const shouldShowHeader = !isLoaded || isHeaderVisible
  const currentBpm = loadState._tag === "Loaded" ? loadState.bpm : null
  const songTitle = loadState._tag === "Loaded" ? loadState.lyrics.title : null

  if (loadState._tag === "Loading") {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        >
          <SpinnerGap size={48} className="text-indigo-500" />
        </motion.div>
        <p className="text-neutral-400">Loading lyrics...</p>
      </div>
    )
  }

  if (loadState._tag === "Error") {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-6 p-6">
        <MusicNote size={64} weight="fill" className="text-neutral-700" />
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Could not load lyrics</h1>
          <p className="text-neutral-400">{loadState.message}</p>
        </div>
        <Link
          href="/"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-medium transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={20} />
          Back to search
        </Link>
      </div>
    )
  }

  return (
    <div ref={doubleTapRef} className="min-h-screen bg-neutral-950 text-white">
      <AnimatePresence>
        {shouldShowHeader && (
          <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={springs.default}
            className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800"
          >
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                  aria-label="Back to search"
                >
                  <ArrowLeft size={20} />
                </Link>
                <div className="flex flex-col">
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {songTitle}
                  </span>
                  <span className="text-xs text-neutral-500 truncate max-w-[200px]">
                    {loadState.lyrics.artist}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <VoiceIndicator
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  level={level}
                  onToggle={handleToggleListening}
                  size="sm"
                />

                {isReady && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePlayPause}
                      className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause size={20} weight="fill" />
                      ) : (
                        <Play size={20} weight="fill" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={reset}
                      className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                      aria-label="Reset"
                    >
                      <ArrowCounterClockwise size={20} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowControls(prev => !prev)}
                      className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                      aria-label={showControls ? "Hide controls" : "Show controls"}
                      aria-expanded={showControls}
                    >
                      {showControls ? <CaretUp size={20} /> : <CaretDown size={20} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="pt-16 h-screen flex flex-col">
        <LyricsDisplay className="flex-1 pb-12" />

        <FloatingMetronome bpm={currentBpm} position="bottom-right" />

        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={springs.default}
              className="fixed bottom-10 left-0 right-0 z-20 bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800"
            >
              <div className="max-w-4xl mx-auto p-4 space-y-4">
                <ProgressIndicator />
                <TempoControl />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="fixed bottom-0 left-0 right-0 z-10 bg-neutral-950/80 backdrop-blur-lg border-t border-neutral-800 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-neutral-500">
            <span>
              State: <span className="text-neutral-300">{playerState._tag}</span>
            </span>
            <span>
              Voice:{" "}
              <span
                className={
                  isSpeaking
                    ? "text-green-400"
                    : isListening
                      ? "text-indigo-400"
                      : "text-neutral-400"
                }
              >
                {isSpeaking ? "Speaking" : isListening ? "Listening" : "Off"}
              </span>
              {isListening && <span className="ml-2">Level: {(level * 100).toFixed(0)}%</span>}
            </span>
            <Attribution
              lyrics={{ name: "LRCLIB", url: "https://lrclib.net" }}
              bpm={{ name: "GetSongBPM", url: "https://getsongbpm.com" }}
            />
          </div>
        </footer>
      </main>
    </div>
  )
}
