"use client"

import { FavoriteButton } from "@/components/ui"
import {
  FONT_SIZE_STEP,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  preferencesStore,
  usePreference,
} from "@/core"
import type { ChordsState } from "@/core/ChordsStore"
import { CaretUp, Minus, MusicNotes, Plus, SlidersHorizontal, TextAa } from "@phosphor-icons/react"
import { memo, useCallback, useState } from "react"

type MockChordsStatus = ChordsState["status"]

interface MockSongActionBarProps {
  readonly status: MockChordsStatus
  readonly showChords: boolean
  readonly isChordPanelOpen: boolean
  readonly onToggleChords: () => void
  readonly onChordSettingsClick: () => void
}

const MockSongActionBar = memo(function MockSongActionBar({
  status,
  showChords,
  isChordPanelOpen,
  onToggleChords,
  onChordSettingsClick,
}: MockSongActionBarProps) {
  const fontSize = usePreference("fontSize")

  const chordsReady = status === "ready"
  const chordsNotFound = status === "not-found"
  const chordsLoading = status === "loading" || status === "idle"

  const isAtMin = fontSize <= MIN_FONT_SIZE
  const isAtMax = fontSize >= MAX_FONT_SIZE

  const handleDecrease = useCallback(() => {
    const newSize = Math.max(MIN_FONT_SIZE, fontSize - FONT_SIZE_STEP)
    preferencesStore.setFontSize(newSize)
  }, [fontSize])

  const handleIncrease = useCallback(() => {
    const newSize = Math.min(MAX_FONT_SIZE, fontSize + FONT_SIZE_STEP)
    preferencesStore.setFontSize(newSize)
  }, [fontSize])

  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {/* Font size controls */}
      <div className="flex items-center gap-1 bg-neutral-800/50 rounded-full px-2 py-1.5">
        <TextAa size={18} weight="fill" className="text-neutral-400 mr-1" />
        <button
          type="button"
          onClick={handleDecrease}
          disabled={isAtMin}
          className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Decrease font size"
        >
          <Minus size={14} weight="bold" />
        </button>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={isAtMax}
          className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Increase font size"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>

      <div className="w-px h-6 bg-neutral-700" />

      <FavoriteButton songId={12345} title="Test Song" artist="Test Artist" size="md" />

      <div className="w-px h-6 bg-neutral-700" />

      {/* Chords button - show different states based on availability */}
      {chordsNotFound ? (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800/50 rounded-full text-sm text-neutral-500">
          <MusicNotes size={20} />
          <span>No chords available</span>
        </div>
      ) : (
        <div
          className={`flex items-center rounded-full overflow-hidden transition-colors ${
            showChords && chordsReady ? "bg-indigo-600/20" : "bg-neutral-800/50"
          }`}
        >
          {/* Main button - toggle chords on/off */}
          <button
            type="button"
            onClick={onToggleChords}
            disabled={chordsLoading}
            className={`flex items-center gap-1.5 px-3 py-2 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              showChords && chordsReady
                ? "text-indigo-400 hover:bg-indigo-600/30"
                : "text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
            }`}
            aria-label={showChords ? "Hide chords" : "Show chords"}
            aria-pressed={showChords && chordsReady}
          >
            <MusicNotes size={20} weight={showChords && chordsReady ? "fill" : "regular"} />
            <span>Chords</span>
            <span className="text-[10px] font-semibold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">
              Beta
            </span>
          </button>

          {/* Divider */}
          <div className={`w-px h-5 ${showChords && chordsReady ? "bg-indigo-500/30" : "bg-neutral-600/50"}`} />

          {/* Settings dropdown */}
          <button
            type="button"
            onClick={onChordSettingsClick}
            disabled={!showChords || !chordsReady}
            className={`flex items-center justify-center w-8 h-9 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              showChords && chordsReady
                ? isChordPanelOpen
                  ? "text-indigo-300 bg-indigo-600/30"
                  : "text-indigo-400 hover:bg-indigo-600/30"
                : "text-neutral-400"
            }`}
            aria-label={isChordPanelOpen ? "Close chord settings" : "Open chord settings"}
            aria-expanded={isChordPanelOpen}
          >
            {isChordPanelOpen ? (
              <CaretUp size={14} weight="bold" />
            ) : (
              <SlidersHorizontal size={16} />
            )}
          </button>
        </div>
      )}
    </div>
  )
})

interface StateCardProps {
  readonly title: string
  readonly description: string
  readonly status: MockChordsStatus
  readonly showChords?: boolean
  readonly isChordPanelOpen?: boolean
}

function StateCard({
  title,
  description,
  status,
  showChords: initialShowChords = false,
  isChordPanelOpen: initialPanelOpen = false,
}: StateCardProps) {
  const [showChords, setShowChords] = useState(initialShowChords)
  const [isChordPanelOpen, setIsChordPanelOpen] = useState(initialPanelOpen)

  return (
    <div className="bg-neutral-900 rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-neutral-400">{description}</p>
        <code className="text-xs text-indigo-400 mt-1 block">status: "{status}"</code>
      </div>
      <div className="bg-neutral-950 rounded-lg">
        <MockSongActionBar
          status={status}
          showChords={showChords}
          isChordPanelOpen={isChordPanelOpen}
          onToggleChords={() => setShowChords(prev => !prev)}
          onChordSettingsClick={() => setIsChordPanelOpen(prev => !prev)}
        />
      </div>
    </div>
  )
}

export default function ChordsStatesTestPage() {
  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Chords Button States</h1>
          <p className="text-neutral-400">Test page showing all possible states of the chords button in SongActionBar</p>
        </div>

        <div className="grid gap-6">
          <StateCard
            title="Idle"
            description="Initial state before any fetch has started"
            status="idle"
          />

          <StateCard
            title="Loading"
            description="Chords are being fetched from the API"
            status="loading"
          />

          <StateCard
            title="Ready (Chords Off)"
            description="Chords loaded successfully, toggle is off"
            status="ready"
            showChords={false}
          />

          <StateCard
            title="Ready (Chords On)"
            description="Chords loaded successfully, toggle is on"
            status="ready"
            showChords={true}
          />

          <StateCard
            title="Ready (Settings Open)"
            description="Chords on with settings panel open"
            status="ready"
            showChords={true}
            isChordPanelOpen={true}
          />

          <StateCard
            title="Not Found"
            description="No chords available for this song"
            status="not-found"
          />

          <StateCard
            title="Error"
            description="Failed to fetch chords (shows same as loading/idle)"
            status="error"
          />
        </div>
      </div>
    </div>
  )
}
