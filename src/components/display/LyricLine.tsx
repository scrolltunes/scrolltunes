"use client"

import { springs } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface LyricLineProps {
  readonly text: string
  readonly isActive: boolean
  readonly isPast: boolean
  readonly onClick?: () => void
  readonly index: number
  readonly fontSize?: number
  readonly innerRef?: (el: HTMLButtonElement | null) => void
}

/**
 * Single lyric line with active highlighting
 */
export const LyricLine = memo(function LyricLine({
  text,
  isActive,
  isPast,
  onClick,
  index,
  fontSize,
  innerRef,
}: LyricLineProps) {
  // Empty lines render as spacing
  if (!text.trim()) {
    return <div className="h-8" aria-hidden="true" />
  }

  const opacityClass = isPast ? "opacity-40" : isActive ? "opacity-100" : "opacity-70"
  const textColorClass = isActive ? "text-white" : isPast ? "text-neutral-600" : "text-neutral-400"
  const textSizeClass = fontSize === undefined ? "text-2xl md:text-3xl lg:text-4xl" : ""

  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onClick}
      className={`relative w-full text-center px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${opacityClass}`}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Line ${index + 1}: ${text}`}
    >
      <span
        className={`relative z-10 block ${textSizeClass} font-medium leading-relaxed ${textColorClass} transition-colors duration-300`}
        style={fontSize !== undefined ? { fontSize: `${fontSize}px` } : undefined}
      >
        {text}
      </span>

      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.lyricHighlight}
            className="absolute inset-0 z-0 rounded-lg bg-indigo-500/30"
          />
        )}
      </AnimatePresence>
    </button>
  )
})
