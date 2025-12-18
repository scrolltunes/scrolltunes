"use client"

import { favoritesStore, useIsFavorite } from "@/core"
import { Heart, Info, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface FloatingActionsProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly albumArt?: string
  readonly hasIssue: boolean
  readonly onInfoPress: () => void
  readonly onWarningPress?: () => void
  readonly position?: "bottom-left" | "bottom-right"
  readonly className?: string
}

const positionClasses = {
  "bottom-left": "bottom-14 left-4",
  "bottom-right": "bottom-14 right-4",
}

export const FloatingActions = memo(function FloatingActions({
  songId,
  title,
  artist,
  albumArt,
  hasIssue,
  onInfoPress,
  onWarningPress,
  position = "bottom-left",
  className = "",
}: FloatingActionsProps) {
  const isFavorite = useIsFavorite(songId)

  const handleToggleFavorite = useCallback(() => {
    favoritesStore.toggle({
      id: songId,
      title,
      artist,
      ...(albumArt !== undefined && { albumArt }),
    })
  }, [songId, title, artist, albumArt])

  const handleWarningClick = useCallback(() => {
    if (onWarningPress) {
      onWarningPress()
    }
  }, [onWarningPress])

  return (
    <div
      className={`fixed z-30 ${positionClasses[position]} ${className}`}
      aria-label="Song actions"
    >
      <div className="flex flex-col gap-2 items-center">
        <motion.button
          type="button"
          onClick={handleToggleFavorite}
          className={`relative w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border transition-colors ${
            isFavorite
              ? "bg-red-500/20 border-red-500/30 hover:bg-red-500/30"
              : "bg-neutral-900/80 border-neutral-700/50 hover:bg-neutral-800"
          }`}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          whileTap={{ scale: 0.9 }}
        >
          <Heart
            size={20}
            weight={isFavorite ? "fill" : "regular"}
            className={isFavorite ? "text-red-500" : "text-neutral-300"}
          />
        </motion.button>

        {hasIssue ? (
          <motion.button
            type="button"
            onClick={handleWarningClick}
            className="flex items-center gap-2 h-11 px-3 rounded-full bg-amber-500/20 hover:bg-amber-500/30 backdrop-blur-sm border border-amber-500/30 transition-colors"
            aria-label="Report issue"
            whileTap={{ scale: 0.95 }}
          >
            <Warning size={20} className="text-amber-500" />
            <span className="text-amber-500 text-sm font-medium">Report issue</span>
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={onInfoPress}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm border border-neutral-700/50 hover:bg-neutral-800 transition-colors"
            aria-label="Song info"
            whileTap={{ scale: 0.9 }}
          >
            <Info size={20} className="text-neutral-300" />
          </motion.button>
        )}
      </div>
    </div>
  )
})
