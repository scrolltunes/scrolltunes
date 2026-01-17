"use client"

import { ChordBadge, InlineChord } from "@/components/chords"
import type { LyricWord } from "@/core"
import type { LyricChordPosition } from "@/lib/chords"

import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface LyricLineProps {
  /**
   * The text content of the line
   */
  readonly text: string
  /**
   * Whether this is the currently active line
   */
  readonly isActive: boolean
  /**
   * Whether this line has already been sung
   */
  readonly isPast: boolean
  /**
   * Whether this is the next line to be sung
   */
  readonly isNext?: boolean
  /**
   * Font size in pixels
   */
  readonly fontSize?: number
  /**
   * Callback when line is clicked
   */
  readonly onClick?: () => void
  /**
   * Line index for ARIA labels
   */
  readonly index: number
  /**
   * Simple chord names for fallback display (centered row)
   */
  readonly chords?: readonly string[]
  /**
   * Position-based chord data for inline display
   */
  readonly chordPositions?: readonly LyricChordPosition[]
  /**
   * Whether text is right-to-left
   */
  readonly isRTL?: boolean
  /**
   * Ref callback for the button element
   */
  readonly innerRef?: (el: HTMLButtonElement | null) => void

  // Word timing props (reserved for future use)
  /**
   * Duration of the line in seconds
   */
  readonly duration?: number | undefined
  /**
   * Start time of the line in seconds
   */
  readonly lineStartTime?: number | undefined
  /**
   * Word-level timing data for karaoke-style animation
   */
  readonly wordTimings?: readonly LyricWord[] | undefined
  /**
   * Elapsed time within the current line in seconds
   */
  readonly elapsedInLine?: number | undefined
  /**
   * Whether playback is currently active
   */
  readonly isPlaying?: boolean
  /**
   * Enable variable speed word painting based on syllable count
   */
  readonly variableSpeed?: boolean
}

interface ChordInWord extends LyricChordPosition {
  readonly offsetInWord: number
}

/**
 * Split text into words with their positions
 */
function splitIntoWords(text: string): { word: string; startIndex: number; endIndex: number }[] {
  const words = text.split(/(\s+)/)
  let position = 0
  const result: { word: string; startIndex: number; endIndex: number }[] = []

  for (const word of words) {
    const startIndex = position
    const endIndex = position + word.length
    position = endIndex
    result.push({ word, startIndex, endIndex })
  }

  return result
}

/**
 * Group chords by the word they belong to
 */
function chordsByWord(
  words: { word: string; startIndex: number; endIndex: number }[],
  chordPositions: readonly LyricChordPosition[] | undefined,
): ChordInWord[][] {
  if (!chordPositions || chordPositions.length === 0) {
    return words.map(() => [])
  }

  return words.map(word => {
    if (word.word.trim() === "") return []

    const chords = chordPositions.filter(
      ch => ch.charIndex >= word.startIndex && ch.charIndex < word.endIndex,
    )
    return chords.map(ch => ({
      ...ch,
      offsetInWord: ch.charIndex - word.startIndex,
    }))
  })
}

/**
 * Render a word with chord badges positioned above specific characters
 */
function renderWordWithChordAnchors(
  word: string,
  chords: readonly ChordInWord[],
  isActive: boolean,
  isNext: boolean,
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
              <ChordBadge
                key={`${ch.name}-${i}`}
                chord={ch.name}
                size="sm"
                isActive={isActive || isNext}
              />
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
 * Static lyric line component for Score Book mode
 *
 * Renders lines without word-level animation. Uses line-level styling:
 * - Active: bold text + subtle background + left border accent
 * - Next: slight opacity reduction + indent
 * - Past: reduced opacity
 * - Upcoming: medium opacity
 *
 * Supports chord display above text when chord data is provided.
 */
export const LyricLine = memo(function LyricLine({
  text,
  isActive,
  isPast,
  isNext = false,
  fontSize,
  onClick,
  index,
  chords,
  chordPositions,
  isRTL = false,
  innerRef,
  // Word timing props - reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  duration: _duration,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lineStartTime: _lineStartTime,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  wordTimings: _wordTimings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  elapsedInLine: _elapsedInLine,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isPlaying: _isPlaying,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  variableSpeed: _variableSpeed,
}: LyricLineProps) {
  // Handle empty lines with musical note placeholder
  if (!text.trim()) {
    return (
      <div
        className="py-2 text-2xl text-left md:text-center"
        style={{
          color: "var(--color-text-ghost)",
        }}
        aria-hidden="true"
      >
        ♪
      </div>
    )
  }

  const hasPositionedChords = chordPositions && chordPositions.length > 0
  const words = splitIntoWords(text)
  const chordsPerWord = chordsByWord(words, chordPositions)

  // Opacity and styling based on position
  const opacityClass = isPast ? "opacity-40" : isNext ? "opacity-85" : "opacity-100"

  // Text color based on position
  const textStyle = isPast
    ? { color: "var(--color-text-muted)" }
    : isActive
      ? { color: "var(--color-text)" }
      : isNext
        ? { color: "var(--color-text2)" }
        : { color: "var(--color-text3)" }

  // Font weight - same for all lines to prevent layout shift
  // See docs/lyrics-display-design.md for rationale
  const fontWeightClass = "font-normal"

  const textSizeClass = fontSize === undefined ? "text-2xl md:text-3xl lg:text-4xl" : ""

  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onClick}
      className={`relative w-full ${hasPositionedChords ? "pt-6 pb-2" : "py-2"} rounded-lg focus:outline-none ${opacityClass} ${isRTL ? "text-right" : "text-left md:text-center"}`}
      aria-current={isActive ? "true" : undefined}
      aria-label={`Line ${index + 1}: ${text}`}
    >
      {/* Fallback: centered chords row for lines without position data */}
      {!hasPositionedChords && chords && chords.length > 0 && (
        <InlineChord chords={chords} isCurrentLine={isActive} />
      )}

      {/* Static text rendering - pl-2 accounts for active indicator bar */}
      <span
        dir={isRTL ? "rtl" : undefined}
        className={`relative z-10 block pl-2 ${textSizeClass} ${fontWeightClass} leading-relaxed transition-colors duration-300`}
        style={{
          ...(fontSize !== undefined ? { fontSize: `${fontSize}px` } : {}),
          ...textStyle,
        }}
      >
        {words.map((wordData, i) => {
          const word = wordData.word

          if (word.trim() === "") {
            return <span key={i}>{word}</span>
          }

          const wordChords = chordsPerWord[i] ?? []

          return (
            <span key={i} className="relative inline-block">
              {renderWordWithChordAnchors(word, wordChords, isActive, isNext)}
            </span>
          )
        })}
      </span>

      {/* Active line indicator - subtle left border */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.8 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-1 bottom-1 w-[3px] rounded-full z-0"
            style={{
              left: isRTL ? "auto" : "0",
              right: isRTL ? "0" : "auto",
              background: "var(--color-accent)",
              opacity: 0.6,
            }}
          />
        )}
      </AnimatePresence>
    </button>
  )
})
