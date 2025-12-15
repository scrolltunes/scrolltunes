"use client"

import { springs } from "@/animations"
import {
  FloatingMetronome,
  FontSizeControl,
  ProgressIndicator,
  VoiceIndicator,
} from "@/components/audio"
import { LyricsDisplay } from "@/components/display"
import { Attribution } from "@/components/ui"
import {
  type Lyrics,
  recentSongsStore,
  usePlayerControls,
  usePlayerState,
  usePreferences,
} from "@/core"
import {
  useAutoHide,
  useDoubleTap,
  useKeyboardShortcuts,
  useShakeDetection,
  useTempoPreference,
  useVoiceTrigger,
  useWakeLock,
} from "@/hooks"
import { type LyricsApiResponse, isLyricsApiSuccess } from "@/lib"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { parseTrackSlugWithId } from "@/lib/slug"
import { soundSystem } from "@/sounds"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Gear,
  MusicNote,
  Pause,
  Play,
  SpinnerGap,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

type ErrorType = "invalid-url" | "not-found" | "network"

type LoadState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Error"; readonly errorType: ErrorType }
  | {
      readonly _tag: "Loaded"
      readonly lyrics: Lyrics
      readonly bpm: number | null
      readonly albumArt: string | null
    }

const errorMessages: Record<ErrorType, { title: string; description: string }> = {
  "invalid-url": {
    title: "Invalid song URL",
    description: "Please search for the song again",
  },
  "not-found": {
    title: "Lyrics not available",
    description: "Try a different version of this song",
  },
  network: {
    title: "Could not load lyrics",
    description: "Check your internet connection and try again",
  },
}

export default function SongPage() {
  const params = useParams<{ artistSlug: string; trackSlugWithId: string }>()
  const [loadState, setLoadState] = useState<LoadState>({ _tag: "Loading" })
  const [showSettings, setShowSettings] = useState(false)

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

  // Stop playback when navigating away (unmount only)
  const resetRef = useRef(reset)
  resetRef.current = reset
  useEffect(() => {
    return () => {
      resetRef.current()
    }
  }, [])

  useWakeLock({ enabled: isLoaded && preferences.wakeLockEnabled })

  const { isVisible: isHeaderVisible } = useAutoHide({
    timeoutMs: preferences.autoHideControlsMs,
    enabled: isLoaded && preferences.autoHideControlsMs > 0,
  })

  const handleTogglePlayPause = useCallback(async () => {
    if (playerState._tag === "Playing") {
      pause()
    } else {
      // Initialize sound system on user gesture (required for metronome)
      await soundSystem.initialize()
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
      setLoadState({ _tag: "Error", errorType: "invalid-url" })
      return
    }

    const id = lrclibId
    const controller = new AbortController()

    async function fetchLyrics() {
      // Try cache first
      const cached = loadCachedLyrics(id)
      if (cached) {
        load(cached.lyrics)
        setLoadState({
          _tag: "Loaded",
          lyrics: cached.lyrics,
          bpm: cached.bpm,
          albumArt: cached.albumArt ?? null,
        })

        recentSongsStore.updateMetadata({
          id,
          title: cached.lyrics.title,
          artist: cached.lyrics.artist,
          album: "",
          durationSeconds: cached.lyrics.duration,
          albumArt: cached.albumArt,
        })
        return
      }

      // Fetch from API
      setLoadState({ _tag: "Loading" })
      try {
        const response = await fetch(`/api/lyrics/${id}`, {
          signal: controller.signal,
        })
        const data: LyricsApiResponse = await response.json()

        if (!response.ok || !isLyricsApiSuccess(data)) {
          const errorType: ErrorType = response.status === 404 ? "not-found" : "network"
          setLoadState({ _tag: "Error", errorType })
          return
        }

        load(data.lyrics)
        setLoadState({
          _tag: "Loaded",
          lyrics: data.lyrics,
          bpm: data.bpm,
          albumArt: data.albumArt ?? null,
        })

        // Cache lyrics
        saveCachedLyrics(id, {
          lyrics: data.lyrics,
          bpm: data.bpm,
          key: data.key,
          albumArt: data.albumArt ?? undefined,
        })

        // Add to recents (without changing order)
        recentSongsStore.updateMetadata({
          id,
          title: data.lyrics.title,
          artist: data.lyrics.artist,
          album: "",
          durationSeconds: data.lyrics.duration,
          albumArt: data.albumArt ?? undefined,
        })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        setLoadState({ _tag: "Error", errorType: "network" })
      }
    }

    fetchLyrics()

    return () => {
      controller.abort()
    }
  }, [lrclibId])

  // Mark song as played when playback starts (moves to top of recents)
  const hasMarkedAsPlayed = useRef(false)
  useEffect(() => {
    if (lrclibId === null || hasMarkedAsPlayed.current) return
    if (playerState._tag === "Playing") {
      recentSongsStore.markAsPlayed(lrclibId)
      hasMarkedAsPlayed.current = true
    }
  }, [lrclibId, playerState._tag])

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
    const { title, description } = errorMessages[loadState.errorType]
    const canRetry = loadState.errorType === "network" || loadState.errorType === "not-found"

    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-6 p-6">
        <MusicNote size={64} weight="fill" className="text-neutral-700" />
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">{title}</h1>
          <p className="text-neutral-400">{description}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {canRetry && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ArrowCounterClockwise size={20} />
              Try again
            </button>
          )}
          <Link
            href="/"
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft size={20} />
            Back to search
          </Link>
        </div>
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
                {loadState.albumArt ? (
                  <img
                    src={loadState.albumArt}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
                    <MusicNote size={20} weight="fill" className="text-neutral-600" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium truncate max-w-[200px]">{songTitle}</span>
                  <span className="text-xs text-neutral-500 truncate max-w-[200px]">
                    {loadState.lyrics.artist}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                      onClick={() => setShowSettings(prev => !prev)}
                      className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                      aria-label={showSettings ? "Hide settings" : "Show settings"}
                      aria-expanded={showSettings}
                    >
                      <Gear size={20} />
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
          {showSettings && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={springs.default}
              className="fixed bottom-10 left-0 right-0 z-20 bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800"
            >
              <div className="max-w-4xl mx-auto p-4">
                <FontSizeControl />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="fixed bottom-0 left-0 right-0 z-10 bg-neutral-950/80 backdrop-blur-lg border-t border-neutral-800 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <ProgressIndicator className="flex-1" />

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
