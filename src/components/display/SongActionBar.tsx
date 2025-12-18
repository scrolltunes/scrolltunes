"use client"

import { FavoriteButton } from "@/components/ui"
import {
  FONT_SIZE_STEP,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type Setlist,
  chordsStore,
  preferencesStore,
  useChordsState,
  useIsAuthenticated,
  usePreference,
  useSetlistsContainingSong,
  useShowChords,
} from "@/core"
import {
  CaretUp,
  Guitar,
  ListPlus,
  Minus,
  MusicNote,
  Plus,
  SlidersHorizontal,
  TextAa,
} from "@phosphor-icons/react"
import { memo, useCallback } from "react"

export interface SongActionBarProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly albumArt?: string
  readonly onAddToSetlist: () => void
  readonly onChordSettingsClick: () => void
  readonly isChordPanelOpen: boolean
}

function SetlistIcon({ setlist }: { readonly setlist: Setlist }) {
  return (
    <div
      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: setlist.color ?? "#6366f1" }}
      title={setlist.name}
    >
      {setlist.icon ? (
        <span className="text-[10px]">{setlist.icon}</span>
      ) : (
        <MusicNote size={10} weight="fill" className="text-white" />
      )}
    </div>
  )
}

export const SongActionBar = memo(function SongActionBar({
  songId,
  title,
  artist,
  albumArt,
  onAddToSetlist,
  onChordSettingsClick,
  isChordPanelOpen,
}: SongActionBarProps) {
  const isAuthenticated = useIsAuthenticated()
  const containingSetlists = useSetlistsContainingSong(songId)
  const isInSetlist = containingSetlists.length > 0
  const fontSize = usePreference("fontSize")
  const chordsState = useChordsState()
  const showChords = useShowChords()
  const chordsReady = chordsState.status === "ready"
  const chordsNotFound = chordsState.status === "not-found"
  const chordsLoading = chordsState.status === "loading" || chordsState.status === "idle"

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
    <div className="flex items-center justify-center gap-3 py-4 px-4">
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

      {/* Favorite button - hidden on mobile (shown in FloatingSongDrawer) */}
      <div className="hidden sm:flex sm:items-center sm:gap-3">
        <div className="w-px h-6 bg-neutral-700" />

        <FavoriteButton
          songId={songId}
          title={title}
          artist={artist}
          {...(albumArt !== undefined && { albumArt })}
          size="md"
        />
      </div>

      {/* Setlist button - icon only on mobile, full on desktop */}
      {isAuthenticated && (
        <>
          <div className="w-px h-6 bg-neutral-700" />
          <button
            type="button"
            onClick={onAddToSetlist}
            className={`relative flex items-center gap-2 rounded-full transition-colors text-sm font-medium ${
              isInSetlist
                ? "bg-neutral-800/50 hover:bg-neutral-700/50"
                : "bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-400 hover:text-neutral-300"
            } ${isInSetlist ? "px-2 py-2 sm:px-3" : "p-2 sm:px-3 sm:py-2"}`}
            aria-label={isInSetlist ? "Manage setlists" : "Add to setlist"}
          >
            {isInSetlist ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-500 leading-none">
                  {containingSetlists.length}
                </span>
                <div className="flex items-center gap-0.5">
                  {containingSetlists.slice(0, 3).map(setlist => (
                    <SetlistIcon key={setlist.id} setlist={setlist} />
                  ))}
                  {containingSetlists.length > 3 && (
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-neutral-700 text-neutral-400 text-[10px] font-medium"
                      title={`${containingSetlists.length - 3} more`}
                    >
                      +{containingSetlists.length - 3}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <ListPlus size={20} />
                <span className="hidden sm:inline">Add to setlist</span>
              </>
            )}
          </button>
        </>
      )}

      {/* Chords button - show different states based on availability */}
      {chordsNotFound ? (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800/50 rounded-full text-sm text-neutral-500">
          <Guitar size={20} />
          <span className="hidden sm:inline">No chords available</span>
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
            onClick={() => chordsStore.toggleShowChords()}
            disabled={chordsLoading}
            className={`flex items-center gap-1.5 px-4 py-2 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              showChords && chordsReady
                ? "text-indigo-400 hover:bg-indigo-600/30"
                : "text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
            }`}
            aria-label={showChords ? "Hide chords" : "Show chords"}
            aria-pressed={showChords && chordsReady}
          >
            <Guitar size={20} weight={showChords && chordsReady ? "fill" : "regular"} />
            <span className="hidden sm:inline">Chords</span>
            <span className="text-[10px] font-semibold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">
              Beta
            </span>
          </button>

          {/* Divider */}
          <div
            className={`w-px h-5 ${showChords && chordsReady ? "bg-indigo-500/30" : "bg-neutral-600/50"}`}
          />

          {/* Settings dropdown */}
          <button
            type="button"
            onClick={onChordSettingsClick}
            disabled={!showChords || !chordsReady}
            className={`flex items-center justify-center w-10 h-9 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
