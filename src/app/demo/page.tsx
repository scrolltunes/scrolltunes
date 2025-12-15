"use client"

import { FloatingMetronome, VoiceIndicator } from "@/components/audio"
import { LyricsDisplay } from "@/components/display"
import { usePlayerControls, usePlayerState } from "@/core"
import { useDebounce, useVoiceTrigger } from "@/hooks"
import { MOCK_SONGS, getMockBpmForSong, getMockLyrics } from "@/lib/mock-lyrics"
import {
  ArrowCounterClockwise,
  CircleNotch,
  MagnifyingGlass,
  MusicNote,
  Pause,
  Play,
} from "@phosphor-icons/react"
import { useMemo, useState } from "react"

const DEBOUNCE_MS = 300

export default function DemoPage() {
  const [selectedSong, setSelectedSong] = useState<string | null>(null)
  const [currentBpm, setCurrentBpm] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const { debouncedValue: debouncedQuery, isPending: isSearching } = useDebounce(searchQuery, {
    delayMs: DEBOUNCE_MS,
  })

  const playerState = usePlayerState()
  const { play, pause, unload, load } = usePlayerControls()

  const { isListening, isSpeaking, level, startListening, stopListening } = useVoiceTrigger({
    autoPlay: true,
    resumeOnVoice: true,
  })

  const permissionDenied = false

  const handleLoadSong = (songId: string) => {
    const lyrics = getMockLyrics(songId)
    if (lyrics) {
      load(lyrics)
      setSelectedSong(songId)
      setCurrentBpm(getMockBpmForSong(songId))
    }
  }

  const handleReset = () => {
    unload()
    setSelectedSong(null)
    setCurrentBpm(null)
  }

  const handleToggleListening = async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }

  const isPlaying = playerState._tag === "Playing"
  const isReady = playerState._tag !== "Idle"

  const filteredSongs = useMemo(() => {
    if (!debouncedQuery.trim()) return MOCK_SONGS
    const query = debouncedQuery.toLowerCase()
    return MOCK_SONGS.filter(
      song => song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query),
    )
  }, [debouncedQuery])

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-neutral-950/80 backdrop-blur-lg border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-lg font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <MusicNote size={24} weight="fill" className="text-indigo-500" />
            ScrollTunes Demo
          </button>

          <div className="flex items-center gap-3">
            {/* Voice indicator */}
            <VoiceIndicator
              isListening={isListening}
              isSpeaking={isSpeaking}
              level={level}
              permissionDenied={permissionDenied}
              onToggle={handleToggleListening}
              size="sm"
            />

            {/* Playback controls */}
            {isReady && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isPlaying ? pause() : play())}
                  className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
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
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-16 h-screen flex flex-col">
        {/* Song selector (when no song loaded) */}
        {playerState._tag === "Idle" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <h2 className="text-2xl font-medium mb-6">Select a song to test</h2>

            {/* Search box */}
            <div className="relative w-full max-w-sm mb-6">
              {isSearching ? (
                <CircleNotch
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin"
                />
              ) : (
                <MagnifyingGlass
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
                />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search songs..."
                className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Song results */}
            <div className="grid gap-4 w-full max-w-sm">
              {filteredSongs.length > 0 ? (
                filteredSongs.map(song => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleLoadSong(song.id)}
                    className="p-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-xl text-left transition-colors"
                  >
                    <div className="font-medium">{song.title}</div>
                    <div className="text-sm text-neutral-400">{song.artist}</div>
                  </button>
                ))
              ) : (
                <p className="text-neutral-500 text-center py-4">No songs found</p>
              )}
            </div>

            <p className="mt-8 text-sm text-neutral-500 text-center max-w-md">
              After loading a song, click the microphone icon to start voice detection. The lyrics
              will auto-scroll when you start singing.
            </p>
          </div>
        )}

        {/* Lyrics display (when song loaded) */}
        {playerState._tag !== "Idle" && <LyricsDisplay className="flex-1" />}

        {playerState._tag !== "Idle" && (
          <FloatingMetronome bpm={currentBpm} position="bottom-right" />
        )}

        {/* Status bar */}
        <footer className="fixed bottom-0 left-0 right-0 bg-neutral-950/80 backdrop-blur-lg border-t border-neutral-800 px-4 py-2">
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
            {selectedSong && (
              <span>
                Song: <span className="text-neutral-300">{selectedSong}</span>
              </span>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}
