"use client"

import { memo } from "react"

export interface LyricLineProps {
  readonly text: string
  readonly isActive: boolean
  readonly isPast: boolean
  readonly onClick?: () => void
  readonly index: number
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
}: LyricLineProps) {
  // Empty lines render as spacing
  if (!text.trim()) {
    return <div className="h-8" aria-hidden="true" />
  }

  const opacityClass = isPast ? "opacity-40" : isActive ? "opacity-100" : "opacity-70"
  const textColorClass = isActive ? "text-white" : isPast ? "text-neutral-600" : "text-neutral-400"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-center px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${opacityClass}`}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Line ${index + 1}: ${text}`}
    >
      <span
        className={`block text-2xl md:text-3xl lg:text-4xl font-medium leading-relaxed ${textColorClass}`}
      >
        {text}
      </span>

      {isActive && <div className="absolute inset-0 -z-10 rounded-lg bg-indigo-500/15" />}
    </button>
  )
})
