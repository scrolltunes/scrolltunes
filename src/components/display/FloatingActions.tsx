"use client"

import { Info, Warning } from "@phosphor-icons/react"
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
        {hasIssue ? (
          <motion.button
            type="button"
            onClick={handleWarningClick}
            className="flex items-center gap-2 h-11 px-3 rounded-sm bg-tokyoNight-orange/20 hover:bg-tokyoNight-orange/30 backdrop-blur-sm border border-tokyoNight-orange/30 transition-colors"
            aria-label="Report issue"
            whileTap={{ scale: 0.95 }}
          >
            <Warning size={20} className="text-tokyoNight-orange" />
            <span className="text-tokyoNight-orange text-sm font-medium">Report issue</span>
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={onInfoPress}
            className="w-11 h-11 rounded-sm flex items-center justify-center bg-tokyoNight-bg/80 backdrop-blur-sm border border-tokyoNight-selection hover:bg-tokyoNight-selection/50 transition-colors"
            aria-label="Song info"
            whileTap={{ scale: 0.9 }}
          >
            <Info size={20} className="text-tokyoNight-comment" />
          </motion.button>
        )}
      </div>
    </div>
  )
})
