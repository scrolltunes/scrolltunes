"use client"

import { ChordBadge, InlineChord } from "@/components/chords"
import type { LyricWord } from "@/core"
import type { LyricChordPosition } from "@/lib/chords"

import { AnimatePresence, motion } from "motion/react"
import { memo, useMemo } from "react"

export interface LyricLineProps {
  readonly text: string
  readonly isActive: boolean
  readonly isPast: boolean
  readonly isNext?: boolean
  readonly onClick?: () => void
  readonly index: number
  readonly fontSize?: number
  readonly innerRef?: (el: HTMLButtonElement | null) => void
  readonly duration?: number | undefined
  readonly lineStartTime?: number | undefined
  readonly wordTimings?: readonly LyricWord[] | undefined
  readonly elapsedInLine?: number | undefined
  readonly isRTL?: boolean
  readonly isPlaying?: boolean
  readonly chords?: readonly string[] | undefined
  readonly chordPositions?: readonly LyricChordPosition[] | undefined
  readonly variableSpeed?: boolean
  readonly wordTimingEnabled?: boolean
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

function estimateSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "")
  if (cleaned.length <= 2) return 1

  const vowelGroups = cleaned.match(/[aeiouy]+/g)
  if (!vowelGroups) return 1

  let count = vowelGroups.length

  if (cleaned.endsWith("e") && count > 1) count--
  if (
    cleaned.endsWith("le") &&
    cleaned.length > 2 &&
    !/[aeiouy]/.test(cleaned[cleaned.length - 3] ?? "")
  ) {
    count++
  }

  return Math.max(1, count)
}

function calculateWordWeight(word: string, hasChord: boolean): number {
  const syllables = estimateSyllables(word)
  const baseWeight = syllables

  const chordEmphasis = hasChord ? 1.3 : 1.0

  const vowelCount = (word.match(/[aeiouyAEIOUY]/g) ?? []).length
  const vowelRatio = vowelCount / Math.max(1, word.length)
  const vowelBonus = 1 + vowelRatio * 0.2

  return baseWeight * chordEmphasis * vowelBonus
}

function calculateWordTimings(
  text: string,
  totalDuration: number,
  chordPositions: readonly LyricChordPosition[] | undefined,
  variableSpeed: boolean,
  providedWordTimings?: readonly LyricWord[] | undefined,
  lineStartTime?: number | undefined,
): WordTimingWithPosition[] {
  const words = text.split(/(\s+)/)

  // If we have enhancement-provided word timings, use them
  if (providedWordTimings && providedWordTimings.length > 0 && lineStartTime !== undefined) {
    let position = 0
    let wordIndex = 0
    const result: WordTimingWithPosition[] = []

    for (const word of words) {
      const startIndex = position
      const endIndex = position + word.length
      position = endIndex

      if (word.trim() === "") {
        result.push({ word, delay: 0, wordDuration: 0, startIndex, endIndex })
      } else {
        const timing = providedWordTimings[wordIndex]
        wordIndex++

        if (timing) {
          // Convert absolute times to relative delay/duration
          const delay = timing.startTime - lineStartTime
          const wordDuration = timing.endTime - timing.startTime
          result.push({ word, delay, wordDuration, startIndex, endIndex })
        } else {
          // Fallback: no timing for this word
          result.push({ word, delay: 0, wordDuration: 0, startIndex, endIndex })
        }
      }
    }

    return result
  }

  // Fallback: estimate timings using syllable-based interpolation
  const chordSet = new Set<number>()
  if (chordPositions) {
    for (const ch of chordPositions) {
      chordSet.add(ch.charIndex)
    }
  }

  let position = 0
  const wordData: { word: string; startIndex: number; endIndex: number; weight: number }[] = []

  for (const word of words) {
    const startIndex = position
    const endIndex = position + word.length
    position = endIndex

    if (word.trim() === "") {
      wordData.push({ word, startIndex, endIndex, weight: 0 })
    } else if (variableSpeed) {
      let hasChord = false
      for (let i = startIndex; i < endIndex; i++) {
        if (chordSet.has(i)) {
          hasChord = true
          break
        }
      }
      const weight = calculateWordWeight(word, hasChord)
      wordData.push({ word, startIndex, endIndex, weight })
    } else {
      wordData.push({ word, startIndex, endIndex, weight: word.length })
    }
  }

  const totalWeight = wordData.reduce((sum, w) => sum + w.weight, 0)

  let elapsed = 0
  const result: WordTimingWithPosition[] = []

  for (const wd of wordData) {
    if (wd.weight === 0) {
      result.push({
        word: wd.word,
        delay: 0,
        wordDuration: 0,
        startIndex: wd.startIndex,
        endIndex: wd.endIndex,
      })
    } else {
      const wordDuration = totalWeight > 0 ? (wd.weight / totalWeight) * totalDuration : 0
      result.push({
        word: wd.word,
        delay: elapsed,
        wordDuration,
        startIndex: wd.startIndex,
        endIndex: wd.endIndex,
      })
      elapsed += wordDuration
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

interface WordOverlayProps {
  readonly word: string
  readonly delay: number
  readonly wordDuration: number
  readonly elapsedInLine: number
  readonly isRTL: boolean
}

/**
 * Animated word overlay that syncs with player time.
 * Calculates initial progress based on elapsed time to handle seeks and late renders.
 */
function WordOverlay({ word, delay, wordDuration, elapsedInLine, isRTL }: WordOverlayProps) {
  // Calculate timing relative to current playback position
  const wordEndTime = delay + wordDuration
  const timeIntoWord = elapsedInLine - delay

  // Word hasn't started yet
  if (elapsedInLine < delay) {
    const remainingDelay = delay - elapsedInLine
    return (
      <motion.span
        className="absolute inset-0 text-white overflow-hidden pointer-events-none"
        initial={{ clipPath: isRTL ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{
          duration: wordDuration,
          delay: remainingDelay,
          ease: "linear",
        }}
      >
        {word}
      </motion.span>
    )
  }

  // Word is already complete
  if (elapsedInLine >= wordEndTime) {
    return <span className="absolute inset-0 text-white pointer-events-none">{word}</span>
  }

  // Word is in progress - calculate initial clip percentage
  const progress = wordDuration > 0 ? timeIntoWord / wordDuration : 1
  const initialClipPercent = Math.min(100, Math.max(0, progress * 100))
  const remainingDuration = Math.max(0, wordDuration - timeIntoWord)

  // Start from current progress and animate to complete
  const initialClip = isRTL
    ? `inset(0 0 0 ${100 - initialClipPercent}%)`
    : `inset(0 ${100 - initialClipPercent}% 0 0)`

  return (
    <motion.span
      className="absolute inset-0 text-white overflow-hidden pointer-events-none"
      initial={{ clipPath: initialClip }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{
        duration: remainingDuration,
        ease: "linear",
      }}
    >
      {word}
    </motion.span>
  )
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
  isNext = false,
  onClick,
  index,
  fontSize,
  innerRef,
  duration,
  lineStartTime,
  wordTimings: providedWordTimings,
  elapsedInLine = 0,
  isRTL = false,
  isPlaying = true,
  chords,
  chordPositions,
  variableSpeed = true,
  wordTimingEnabled = false,
}: LyricLineProps) {
  const wordTimings = useMemo(
    () =>
      calculateWordTimings(
        text,
        duration ?? 0,
        chordPositions,
        variableSpeed,
        providedWordTimings,
        lineStartTime,
      ),
    [text, duration, chordPositions, variableSpeed, providedWordTimings, lineStartTime],
  )

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

  const hasPositionedChords = chordPositions && chordPositions.length > 0
  // When chords are shown, keep lyrics visible but neutral so chords stand out
  const opacityClass = isPast ? "opacity-40" : "opacity-100"
  const baseTextColor = isPast
    ? "text-neutral-600"
    : isActive
      ? "text-neutral-400"
      : "text-neutral-500"
  const textSizeClass = fontSize === undefined ? "text-2xl md:text-3xl lg:text-4xl" : ""
  // Word timing animation only when explicitly enabled and no positioned chords
  const shouldAnimateWords =
    isActive && isPlaying && duration !== undefined && wordTimingEnabled && !hasPositionedChords

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
                {renderWordWithChordAnchors(word, wordChords, isActive, isNext)}
              </span>

              {/* Overlay layer: white text (word animation or whole-line highlight) */}
              {shouldAnimateWords ? (
                <WordOverlay
                  word={word}
                  delay={timing.delay}
                  wordDuration={timing.wordDuration}
                  elapsedInLine={elapsedInLine}
                  isRTL={isRTL}
                />
              ) : isActive ? (
                // Default: instant white highlight for the whole line
                <span className="absolute inset-0 text-white pointer-events-none">{word}</span>
              ) : null}
            </span>
          )
        })}
      </span>

      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", duration: 0.4, ease: "easeOut" }}
            className="absolute inset-0 z-0 rounded-lg bg-indigo-500/20"
          />
        )}
      </AnimatePresence>
    </button>
  )
})
