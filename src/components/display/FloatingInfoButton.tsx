"use client"

import { Info, Warning } from "@phosphor-icons/react"
import { memo } from "react"

export interface FloatingInfoButtonProps {
  readonly hasBpm: boolean
  readonly onPress: () => void
  readonly onWarningPress?: () => void
  readonly position?: "bottom-left" | "bottom-right"
  readonly className?: string
}

const positionClasses = {
  "bottom-left": "bottom-14 left-4",
  "bottom-right": "bottom-14 right-4",
}

export const FloatingInfoButton = memo(function FloatingInfoButton({
  hasBpm,
  onPress,
  onWarningPress,
  position = "bottom-left",
  className = "",
}: FloatingInfoButtonProps) {
  const handleClick = () => {
    if (!hasBpm && onWarningPress) {
      onWarningPress()
    } else {
      onPress()
    }
  }

  return (
    <div
      className={`fixed z-30 ${positionClasses[position]} ${className}`}
      aria-label="Song info button"
    >
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-2 transition-colors backdrop-blur-sm border border-neutral-700/50 ${
          hasBpm
            ? "w-11 h-11 rounded-full justify-center bg-neutral-900/80 hover:bg-neutral-800"
            : "h-11 px-3 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
        }`}
        aria-label={hasBpm ? "Song info" : "Report issue"}
      >
        {hasBpm ? (
          <Info size={20} className="text-neutral-300" />
        ) : (
          <>
            <Warning size={20} className="text-amber-500" />
            <span className="text-amber-500 text-sm font-medium">Report issue</span>
          </>
        )}
      </button>
    </div>
  )
})
