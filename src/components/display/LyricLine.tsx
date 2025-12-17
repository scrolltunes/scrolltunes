"use client"

import { springs } from "@/animations"
import { ChordBadge, InlineChord } from "@/components/chords"
import type { LyricChordPosition } from "@/lib/chords"
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
  readonly chords?: readonly string[] | undefined
  readonly chordPositions?: readonly LyricChordPosition[] | undefined
}

interface WordTimingWithPosition {
  readonly word: string
  readonly delay: number
  readonly wordDuration: number
  readonly startIndex: number
  readonly endIndex: number
}

interface ChordInWord extends LyricChordPosition {
  readonly offsetInWord: number
}

function calculateWordTimings(text: string, totalDuration: number): WordTimingWithPosition[] {
  const words = text.split(/(\s+)/)
  const nonSpaceWords = words.filter(w => w.trim() !== "")
  const totalChars = nonSpaceWords.reduce((sum, w) => sum + w.length, 0)

  let charsSoFar = 0
  let position = 0
  const result: WordTimingWithPosition[] = []

  for (const word of words) {
    const startIndex = position
    const endIndex = position + word.length
    position = endIndex

    if (word.trim() === "") {
      result.push({ word, delay: 0, wordDuration: 0, startIndex, endIndex })
    } else {
      const delay = totalChars > 0 ? (charsSoFar / totalChars) * totalDuration : 0
      const wordDuration = totalChars > 0 ? (word.length / totalChars) * totalDuration : 0
      result.push({ word, delay, wordDuration, startIndex, endIndex })
      charsSoFar += word.length
    }
  }

  return result
}

function chordsByWord(
  wordTimings: readonly WordTimingWithPosition[],
  chordPositions: readonly LyricChordPosition[] | undefined,
): ChordInWord[][] {
  if (!chordPositions || chordPositions.length === 0) {
    return wordTimings.map(() => [])
  }

  return wordTimings.map(timing => {
    if (timing.word.trim() === "") return []

    const chords = chordPositions.filter(
      ch => ch.charIndex >= timing.startIndex && ch.charIndex < timing.endIndex,
    )
    return chords.map(ch => ({
      ...ch,
      offsetInWord: ch.charIndex - timing.startIndex,
    }))
  })
}

function renderWordWithChordAnchors(
  word: string,
  chords: readonly ChordInWord[],
  isActive: boolean,
): React.ReactNode {
  if (chords.length === 0) {
    return word
  }

  const chordsByOffset = new Map<number, ChordInWord[]>()
  for (const ch of chords) {
    const offset = Math.max(0, Math.min(word.length - 1, ch.offsetInWord))
    const arr = chordsByOffset.get(offset) ?? []
    arr.push(ch)
    chordsByOffset.set(offset, arr)
  }

  const sortedOffsets = [...chordsByOffset.keys()].sort((a, b) => a - b)

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const offset of sortedOffsets) {
    if (offset > cursor) {
      parts.push(<span key={`t-${cursor}`}>{word.slice(cursor, offset)}</span>)
      cursor = offset
    }

    const char = word[cursor] ?? ""
    const chordsAtOffset = chordsByOffset.get(offset)

    parts.push(
      <span key={`ch-${cursor}`} className="relative inline-block">
        <span>{char}</span>
        {chordsAtOffset && chordsAtOffset.length > 0 && (
          <span className="absolute bottom-full mb-[-0.3em] left-0 flex gap-0.5 whitespace-nowrap">
            {chordsAtOffset.map((ch, i) => (
              <ChordBadge key={`${ch.name}-${i}`} chord={ch.name} size="sm" isActive={isActive} />
            ))}
          </span>
        )}
      </span>,
    )
    cursor += 1
  }

  if (cursor < word.length) {
    parts.push(<span key={`tail-${cursor}`}>{word.slice(cursor)}</span>)
  }

  return parts
}

/**
 * Single lyric line with active highlighting and positioned chords
 *
 * Uses a unified word-based structure for all states to keep chords stable.
 * Chords are anchored to specific characters within words.
 * Animation overlay sits on top of the stable base layer.
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
  chords,
  chordPositions,
}: LyricLineProps) {
  const wordTimings = useMemo(() => calculateWordTimings(text, duration ?? 0), [text, duration])

  const chordsPerWord = useMemo(
    () => chordsByWord(wordTimings, chordPositions),
    [wordTimings, chordPositions],
  )

  if (!text.trim()) {
    return (
      <div className="py-2 text-center text-neutral-600 text-2xl" aria-hidden="true">
        ♪
      </div>
    )
  }

  const opacityClass = isPast ? "opacity-40" : isActive ? "opacity-100" : "opacity-70"
  const baseTextColor = isPast ? "text-neutral-600" : "text-neutral-400"
  const textSizeClass = fontSize === undefined ? "text-2xl md:text-3xl lg:text-4xl" : ""
  const hasPositionedChords = chordPositions && chordPositions.length > 0
  const shouldAnimate = isActive && isPlaying && duration !== undefined

  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onClick}
      className={`relative w-full text-center px-4 ${hasPositionedChords ? "pt-6 pb-2" : "py-2"} rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${opacityClass}`}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Line ${index + 1}: ${text}`}
    >
      {/* Fallback: centered chords row for lines without position data */}
      {!hasPositionedChords && chords && chords.length > 0 && (
        <InlineChord chords={chords} isCurrentLine={isActive} />
      )}

      {/* Unified word-based rendering for all states */}
      <span
        dir={isRTL ? "rtl" : undefined}
        className={`relative z-10 block ${textSizeClass} font-medium leading-relaxed transition-colors duration-300`}
        style={fontSize !== undefined ? { fontSize: `${fontSize}px` } : undefined}
      >
        {wordTimings.map((timing, i) => {
          const word = timing.word

          if (word.trim() === "") {
            return <span key={i}>{word}</span>
          }

          const wordChords = chordsPerWord[i] ?? []

          return (
            <span key={i} className="relative inline-block">
              {/* Base layer: text with chord anchors (always rendered, stable structure) */}
              <span className={isActive ? "text-neutral-500" : baseTextColor}>
                {renderWordWithChordAnchors(word, wordChords, isActive)}
              </span>

              {/* Overlay layer: white text (animated or static based on state) */}
              {shouldAnimate ? (
                <motion.span
                  className="absolute inset-0 text-white overflow-hidden pointer-events-none"
                  initial={{ clipPath: isRTL ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={{
                    duration: timing.wordDuration,
                    delay: timing.delay,
                    ease: "linear",
                  }}
                >
                  {word}
                </motion.span>
              ) : isActive ? (
                <span className="absolute inset-0 text-white pointer-events-none">{word}</span>
              ) : null}
            </span>
          )
        })}
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
