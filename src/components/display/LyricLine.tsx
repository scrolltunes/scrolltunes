"use client"

import { memo } from "react"
import { motion } from "motion/react"
import { springs } from "@/animations"

export interface LyricLineProps {
  readonly text: string
  readonly isActive: boolean
  readonly isPast: boolean
  readonly onClick?: () => void
  readonly index: number
}

/**
 * Single lyric line with active highlighting
 *
 * Uses Motion for smooth transitions between states
 */
export const LyricLine = memo(function LyricLine({
  text,
  isActive,
  isPast,
  onClick,
  index,
}: LyricLineProps) {
  // Empty lines render as spacing
  if (!text.trim()) {
    return <div className="h-8" aria-hidden="true" />
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      initial={false}
      animate={{
        scale: isActive ? 1.02 : 1,
        opacity: isPast ? 0.4 : isActive ? 1 : 0.7,
      }}
      transition={springs.lyricHighlight}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Line ${index + 1}: ${text}`}
    >
      <motion.span
        className="block text-2xl md:text-3xl lg:text-4xl font-medium leading-relaxed"
        animate={{
          color: isActive ? "#ffffff" : isPast ? "#525252" : "#a3a3a3",
        }}
        transition={springs.default}
      >
        {text}
      </motion.span>

      {isActive && (
        <motion.div
          className="absolute inset-0 -z-10 rounded-lg bg-indigo-500/10"
          layoutId="activeHighlight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springs.lyricHighlight}
        />
      )}
    </motion.button>
  )
})
