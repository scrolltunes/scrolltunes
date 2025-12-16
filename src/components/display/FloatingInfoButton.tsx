"use client"

import { Info, Warning } from "@phosphor-icons/react"
import { memo } from "react"

export interface FloatingInfoButtonProps {
  readonly hasBpm: boolean
  readonly onPress: () => void
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
  position = "bottom-left",
  className = "",
}: FloatingInfoButtonProps) {
  return (
    <div
      className={`fixed z-30 ${positionClasses[position]} ${className}`}
      aria-label="Song info button"
    >
      <button
        type="button"
        onClick={onPress}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm border border-neutral-700/50 ${
          hasBpm
            ? "bg-neutral-900/80 hover:bg-neutral-800"
            : "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30"
        }`}
        aria-label={hasBpm ? "Song info" : "Song info - BPM missing"}
      >
        {hasBpm ? (
          <Info size={20} className="text-neutral-300" />
        ) : (
          <Warning size={20} className="text-amber-500" />
        )}
      </button>
    </div>
  )
})
