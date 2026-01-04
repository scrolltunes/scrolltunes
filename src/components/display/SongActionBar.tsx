"use client"

import {
  FONT_SIZE_STEP,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type Setlist,
  preferencesStore,
  useIsAuthenticated,
  usePreference,
  useSetlistsContainingSong,
} from "@/core"
import { ListPlus, Minus, MusicNote, Plus, ShareNetwork, TextAa } from "@phosphor-icons/react"
import { memo, useCallback } from "react"

export interface SongActionBarProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly albumArt?: string
  readonly onAddToSetlist: () => void
  readonly onShareClick?: () => void
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
  onShareClick,
}: SongActionBarProps) {
  const isAuthenticated = useIsAuthenticated()
  const containingSetlists = useSetlistsContainingSong(songId)
  const isInSetlist = containingSetlists.length > 0
  const fontSize = usePreference("fontSize")

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
      <div
        className="flex items-center gap-1 rounded-full px-2 py-1.5"
        style={{ background: "var(--color-surface2)" }}
      >
        <TextAa size={18} weight="fill" style={{ color: "var(--color-text3)" }} className="mr-1" />
        <button
          type="button"
          onClick={handleDecrease}
          disabled={isAtMin}
          className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-white/5"
          style={{ color: "var(--color-text2)" }}
          aria-label="Decrease font size"
        >
          <Minus size={14} weight="bold" />
        </button>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={isAtMax}
          className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-white/5"
          style={{ color: "var(--color-text2)" }}
          aria-label="Increase font size"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>

      {/* Setlist button - icon only on mobile, full on desktop */}
      {isAuthenticated && (
        <>
          <div className="w-px h-6" style={{ background: "var(--color-border)" }} />
          <button
            type="button"
            onClick={onAddToSetlist}
            className={`relative flex items-center gap-2 rounded-full transition-colors text-sm font-medium hover:bg-white/5 ${
              isInSetlist ? "px-2 py-2 sm:px-3" : "p-2 sm:px-3 sm:py-2"
            }`}
            style={{
              background: "var(--color-surface2)",
              color: isInSetlist ? "var(--color-text)" : "var(--color-text3)",
            }}
            aria-label={isInSetlist ? "Manage setlists" : "Add to setlist"}
          >
            {isInSetlist ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">Setlists</span>
                <span
                  className="text-[10px] leading-none"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {containingSetlists.length}
                </span>
                <div className="flex items-center gap-0.5">
                  {containingSetlists.slice(0, 2).map(setlist => (
                    <SetlistIcon key={setlist.id} setlist={setlist} />
                  ))}
                  {containingSetlists.length > 2 && (
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-medium"
                      style={{
                        background: "var(--color-surface3)",
                        color: "var(--color-text3)",
                      }}
                      title={`${containingSetlists.length - 2} more`}
                    >
                      +{containingSetlists.length - 2}
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

      {/* Separator */}
      <div className="w-px h-6" style={{ background: "var(--color-border)" }} />

      {/* Share lyrics */}
      {onShareClick && (
        <button
          type="button"
          onClick={onShareClick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors hover:bg-white/5"
          style={{
            background: "var(--color-surface2)",
            color: "var(--color-text3)",
          }}
          aria-label="Share lyrics"
        >
          <ShareNetwork size={18} />
          <span className="hidden sm:inline">Share Lyrics</span>
        </button>
      )}
    </div>
  )
})
