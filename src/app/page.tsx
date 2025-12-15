"use client"

import { ProgressIndicator, TempoControl, VoiceIndicator } from "@/components/audio"
import { LyricsDisplay } from "@/components/display"
import { type SearchResultTrack, SongConfirmation, SongSearch } from "@/components/search"
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
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretUp,
  GearSix,
  MusicNote,
  Pause,
  Play,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useCallback, useState } from "react"

type ViewState = "search" | "confirming" | "playing"

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("search")
  const [selectedTrack, setSelectedTrack] = useState<SearchResultTrack | null>(null)
  const [showControls, setShowControls] = useState(false)

  const playerState = usePlayerState()
  const { play, pause, reset, load } = usePlayerControls()
  const preferences = usePreferences()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })

  useKeyboardShortcuts({ enabled: viewState === "playing" })

  useTempoPreference({
    songId: selectedTrack?.id ?? null,
    autoLoad: true,
    autoSave: true,
  })

  const isPlayingView = viewState === "playing"

  useWakeLock({ enabled: isPlayingView && preferences.wakeLockEnabled })

  const { isVisible: isHeaderVisible } = useAutoHide({
    timeoutMs: preferences.autoHideControlsMs,
    enabled: isPlayingView && preferences.autoHideControlsMs > 0,
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
    enabled: isPlayingView && preferences.doubleTapEnabled,
  })

  useShakeDetection({
    onShake: reset,
    enabled: isPlayingView && preferences.shakeToRestartEnabled,
  })

  const handleSelectTrack = useCallback((track: SearchResultTrack) => {
    setSelectedTrack(track)
    setViewState("confirming")
  }, [])

  const handleConfirm = useCallback(
    (lyrics: Lyrics, bpm: number | null, _key: string | null) => {
      load(lyrics)
      // TODO: Use BPM to adjust scroll speed via setScrollSpeed(bpmToSpeed(bpm))
      if (bpm) {
        // Store BPM for potential future use
        console.log("Song BPM:", bpm)
      }
      setViewState("playing")
    },
    [load],
  )

  const handleBack = useCallback(() => {
    setSelectedTrack(null)
    setViewState("search")
  }, [])

  const handleReset = useCallback(() => {
    reset()
    setSelectedTrack(null)
    setViewState("search")
  }, [reset])

  const handleToggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  const isPlaying = playerState._tag === "Playing"
  const isReady = playerState._tag !== "Idle"

  const shouldShowHeader = !isPlayingView || isHeaderVisible

  return (
    <div ref={doubleTapRef} className="min-h-screen bg-neutral-950 text-white">
      <AnimatePresence>
        {shouldShowHeader && (
          <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800"
          >
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="text-lg font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <MusicNote size={24} weight="fill" className="text-indigo-500" />
                ScrollTunes
              </button>

              <div className="flex items-center gap-3">
                {!isPlayingView && (
                  <Link
                    href="/settings"
                    className="w-10 h-10 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors"
                    aria-label="Settings"
                  >
                    <GearSix size={20} />
                  </Link>
                )}

                {isPlayingView && (
                  <>
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
                          onClick={handleReset}
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
                  </>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="pt-16 h-screen flex flex-col">
        {viewState === "search" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md text-center mb-8">
              <h2 className="text-2xl font-medium mb-2">Find a song</h2>
              <p className="text-neutral-500">Search for any song to get synced lyrics</p>
            </div>
            <SongSearch onSelectTrack={handleSelectTrack} className="w-full max-w-md" />
          </div>
        )}

        {isPlayingView && <LyricsDisplay className={showControls ? "flex-1 pb-48" : "flex-1"} />}

        <AnimatePresence>
          {viewState === "confirming" && selectedTrack && (
            <SongConfirmation track={selectedTrack} onConfirm={handleConfirm} onBack={handleBack} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isPlayingView && showControls && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-20 bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800"
            >
              <div className="max-w-4xl mx-auto p-4 space-y-4">
                <ProgressIndicator />
                <TempoControl />
                <Attribution
                  lyrics={{ name: "LRCLIB", url: "https://lrclib.net" }}
                  bpm={{ name: "GetSongBPM", url: "https://getsongbpm.com" }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Static footer for API attribution - required for GetSongBPM API key verification */}
        <footer className="fixed bottom-2 left-0 right-0 text-center text-xs text-neutral-600">
          Powered by{" "}
          <a
            href="https://lrclib.net"
            target="_blank"
            rel="noopener"
            className="text-neutral-500 hover:text-neutral-400 underline underline-offset-2"
          >
            LRCLIB
          </a>
          {" & "}
          <a
            href="https://getsongbpm.com"
            target="_blank"
            rel="noopener"
            className="text-neutral-500 hover:text-neutral-400 underline underline-offset-2"
          >
            GetSongBPM
          </a>
        </footer>
      </main>
    </div>
  )
}
