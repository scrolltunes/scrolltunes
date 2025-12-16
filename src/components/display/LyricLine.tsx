"use client"

import { springs } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo, useMemo } from "react"

export interface LyricLineProps {
  readonly text: string
  readonly isActive: boolean
  readonly isPast: boolean
  readonly onClick?: () => void
  readonly index: number
  readonly fontSize?: number
  readonly innerRef?: (el: HTMLButtonElement | null) => void
  readonly duration?: number | undefined
  readonly isRTL?: boolean
  readonly isPlaying?: boolean
}

interface WordTiming {
  readonly word: string
  readonly delay: number
  readonly wordDuration: number
}

function calculateWordTimings(text: string, totalDuration: number): WordTiming[] {
  const words = text.split(/(\s+)/)
  const nonSpaceWords = words.filter(w => w.trim() !== "")
  const totalChars = nonSpaceWords.reduce((sum, w) => sum + w.length, 0)

  if (totalChars === 0) return []

  let charsSoFar = 0
  const result: WordTiming[] = []

  for (const word of words) {
    if (word.trim() === "") {
      result.push({ word, delay: 0, wordDuration: 0 })
    } else {
      const delay = (charsSoFar / totalChars) * totalDuration
      const wordDuration = (word.length / totalChars) * totalDuration
      result.push({ word, delay, wordDuration })
      charsSoFar += word.length
    }
  }

  return result
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
  duration,
  isRTL = false,
  isPlaying = true,
}: LyricLineProps) {
  const wordTimings = useMemo(
    () => (duration !== undefined ? calculateWordTimings(text, duration) : []),
    [text, duration],
  )

  // Empty lines render as a musical note
  if (!text.trim()) {
    return (
      <div className="py-2 text-center text-neutral-600 text-2xl" aria-hidden="true">
        ♪
      </div>
    )
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
      {isActive && duration !== undefined ? (
        <span
          dir={isRTL ? "rtl" : undefined}
          className={`relative z-10 block ${textSizeClass} font-medium leading-relaxed transition-colors duration-300`}
          style={fontSize !== undefined ? { fontSize: `${fontSize}px` } : undefined}
        >
          {isPlaying ? (
            wordTimings.map((timing, i) => {
              if (timing.word.trim() === "") {
                return timing.word
              }
              return (
                <span key={i} className="relative inline-block">
                  <span className="text-neutral-500">{timing.word}</span>
                  <motion.span
                    className="absolute inset-0 text-white overflow-hidden"
                    initial={{ clipPath: isRTL ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)" }}
                    animate={{ clipPath: "inset(0 0% 0 0)" }}
                    transition={{
                      duration: timing.wordDuration,
                      delay: timing.delay,
                      ease: "linear",
                    }}
                  >
                    {timing.word}
                  </motion.span>
                </span>
              )
            })
          ) : (
            <span className="text-white">{text}</span>
          )}
        </span>
      ) : (
        <span
          className={`relative z-10 block ${textSizeClass} font-medium leading-relaxed ${textColorClass} transition-colors duration-300`}
          style={fontSize !== undefined ? { fontSize: `${fontSize}px` } : undefined}
        >
          {text}
        </span>
      )}

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
