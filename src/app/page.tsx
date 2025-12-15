"use client"

import { VoiceIndicator } from "@/components/audio"
import { LyricsDisplay } from "@/components/display"
import { type SearchResultTrack, SongConfirmation, SongSearch } from "@/components/search"
import { type Lyrics, usePlayerControls, usePlayerState } from "@/core"
import { useVoiceTrigger } from "@/hooks"
import { ArrowCounterClockwise, MusicNote, Pause, Play } from "@phosphor-icons/react"
import { AnimatePresence } from "motion/react"
import { useCallback, useState } from "react"

type ViewState = "search" | "confirming" | "playing"

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("search")
  const [selectedTrack, setSelectedTrack] = useState<SearchResultTrack | null>(null)

  const playerState = usePlayerState()
  const { play, pause, reset, load } = usePlayerControls()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })

  const handleSelectTrack = useCallback((track: SearchResultTrack) => {
    setSelectedTrack(track)
    setViewState("confirming")
  }, [])

  const handleConfirm = useCallback(
    (lyrics: Lyrics) => {
      load(lyrics)
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <MusicNote size={24} weight="fill" className="text-indigo-500" />
            ScrollTunes
          </h1>

          <div className="flex items-center gap-3">
            {viewState === "playing" && (
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
                      onClick={() => (isPlaying ? pause() : play())}
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
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

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

        {viewState === "playing" && <LyricsDisplay className="flex-1" />}

        <AnimatePresence>
          {viewState === "confirming" && selectedTrack && (
            <SongConfirmation track={selectedTrack} onConfirm={handleConfirm} onBack={handleBack} />
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
