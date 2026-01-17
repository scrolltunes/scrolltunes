"use client"

import { ActionBarMetronome } from "@/components/audio"
import {
  type Setlist,
  favoritesStore,
  useHasEdits,
  useIsAuthenticated,
  useIsFavorite,
  useSetlistsContainingSong,
} from "@/core"
import {
  Heart,
  Info,
  ListPlus,
  MusicNote,
  PencilSimple,
  ShareNetwork,
  Warning,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface SongActionBarProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly albumArt?: string
  readonly bpm?: number | null
  readonly onAddToSetlist: () => void
  readonly onShareClick?: () => void
  readonly onInfoClick?: () => void
  readonly onEditClick?: () => void
  readonly hasIssue?: boolean
  readonly onWarningClick?: () => void
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
  bpm,
  onAddToSetlist,
  onShareClick,
  onInfoClick,
  onEditClick,
  hasIssue,
  onWarningClick,
}: SongActionBarProps) {
  const isAuthenticated = useIsAuthenticated()
  const containingSetlists = useSetlistsContainingSong(songId)
  const isInSetlist = containingSetlists.length > 0
  const isFavorite = useIsFavorite(songId)
  const hasEdits = useHasEdits()

  const handleToggleFavorite = useCallback(() => {
    favoritesStore.toggle({
      id: songId,
      title,
      artist,
      album: "",
      ...(albumArt && { albumArt }),
    })
  }, [songId, title, artist, albumArt])

  const showInfoOrWarning = onInfoClick || (hasIssue && onWarningClick)

  return (
    <div className="flex items-center justify-center gap-3 py-4 px-4 max-w-3xl mx-auto">
      {/* Info/Warning button */}
      {hasIssue && onWarningClick ? (
        <button
          type="button"
          onClick={onWarningClick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors"
          style={{
            background: "var(--color-warning-soft)",
            color: "var(--color-warning)",
          }}
          aria-label="Report issue"
        >
          <Warning size={20} />
          <span className="hidden sm:inline">Report issue</span>
        </button>
      ) : onInfoClick ? (
        <button
          type="button"
          onClick={onInfoClick}
          className="flex items-center gap-1.5 p-2 rounded-full text-sm font-medium transition-colors hover:bg-white/5"
          style={{
            background: "var(--color-surface2)",
            color: "var(--color-text3)",
          }}
          aria-label="Song info"
        >
          <Info size={20} />
        </button>
      ) : null}

      {/* Separator - show if info/warning button and other buttons are visible */}
      {showInfoOrWarning && (
        <div className="w-px h-6" style={{ background: "var(--color-border)" }} />
      )}

      {/* Favorite button */}
      <motion.button
        type="button"
        onClick={handleToggleFavorite}
        className="flex items-center justify-center p-2 rounded-full transition-colors hover:bg-white/5"
        style={{ background: "var(--color-surface2)" }}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={isFavorite}
        whileTap={{ scale: 0.9 }}
      >
        <motion.div
          key={isFavorite ? "filled" : "outline"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          <Heart
            size={20}
            weight={isFavorite ? "fill" : "regular"}
            style={{ color: isFavorite ? "var(--color-favorite)" : "var(--color-text3)" }}
          />
        </motion.div>
      </motion.button>

      {/* Setlist button - icon only on mobile, full on desktop */}
      {isAuthenticated && (
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
      )}

      {/* Edit button - hidden for now */}
      {false && isAuthenticated && onEditClick && (
        <button
          type="button"
          onClick={onEditClick}
          className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-colors hover:bg-white/5"
          style={{
            background: hasEdits ? "var(--color-accent-soft)" : "var(--color-surface2)",
            color: hasEdits ? "var(--color-accent)" : "var(--color-text3)",
          }}
          aria-label="Edit lyrics"
        >
          <PencilSimple size={18} />
          <span>{hasEdits ? "Modified" : "Edit"}</span>
        </button>
      )}

      {/* Separator - only show if both setlist button and share button are visible */}
      {isAuthenticated && onShareClick && (
        <div className="w-px h-6" style={{ background: "var(--color-border)" }} />
      )}

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

      {/* Metronome - always right-justified, only show if BPM is available */}
      {bpm !== null && bpm !== undefined && bpm > 0 && (
        <div className="ml-auto flex items-center gap-3">
          <div className="w-px h-6" style={{ background: "var(--color-border)" }} />
          <ActionBarMetronome bpm={bpm} />
        </div>
      )}
    </div>
  )
})
