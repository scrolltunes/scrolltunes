"use client"

import { springs, variants } from "@/animations"
import {
  type LyricLine as LyricLineType,
  scoreBookStore,
  useChordsData,
  useCurrentLineIndex,
  useCurrentTime,
  usePlayerControls,
  usePlayerState,
  usePreferences,
  useScoreBookState,
  useShowChords,
  useTranspose,
} from "@/core"
import { useDynamicPagination, useSwipeGesture } from "@/hooks"
import { detectLyricsDirection } from "@/lib"
import { type LyricChordPosition, matchChordsToLyrics, transposeChordLine } from "@/lib/chords"
import { mergeChordSources } from "@/lib/chords/merge-chords"
import type { ChordEnhancementPayloadV1 } from "@/lib/gp/chord-types"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import { PageFlipWarning } from "./PageFlipWarning"
import { PageIndicator } from "./PageIndicator"
import { ScoreBookPage } from "./ScoreBookPage"

/**
 * Chord data for a single line
 */
interface LineChordData {
  readonly chords?: readonly string[]
  readonly chordPositions?: readonly LyricChordPosition[]
}

export interface ScoreBookDisplayProps {
  readonly className?: string
  readonly chordEnhancement?: ChordEnhancementPayloadV1 | null | undefined
}

/**
 * Main Score Book display - page-based lyrics with auto/manual page navigation
 *
 * Orchestrates ScoreBookPage, PageIndicator, PageFlipWarning, and pagination logic.
 * Pages flip automatically when the current line crosses a page boundary,
 * or manually via swipe gestures.
 */
export const ScoreBookDisplay = memo(function ScoreBookDisplay({
  className = "",
  chordEnhancement,
}: ScoreBookDisplayProps) {
  const state = usePlayerState()
  const currentLineIndex = useCurrentLineIndex()
  const currentTime = useCurrentTime()
  const { jumpToLine } = usePlayerControls()
  const { fontSize, scoreBookShowChords, scoreBookWordHighlight } = usePreferences()
  const chordsData = useChordsData()
  const showChords = useShowChords()
  const transposeSemitones = useTranspose()
  const prefersReducedMotion = useReducedMotion()

  // ScoreBook pagination state
  const { currentPage, totalPages, pageLineRanges } = useScoreBookState()

  // Container ref for dynamic pagination
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null
  const totalLines = lyrics?.lines.length ?? 0

  // Dynamic pagination calculation
  const { linesPerPage } = useDynamicPagination({
    containerRef,
    fontSize,
    totalLines,
  })

  // Update ScoreBookStore when pagination parameters change
  useEffect(() => {
    if (totalLines > 0) {
      scoreBookStore.setPagination(totalLines, linesPerPage)
    }
  }, [totalLines, linesPerPage])

  // Reset pagination when song changes
  const songId = lyrics?.songId
  useEffect(() => {
    scoreBookStore.reset()
  }, [songId])

  // Auto-advance page when current line crosses page boundary
  const isPlaying = state._tag === "Playing"
  useEffect(() => {
    if (!isPlaying || currentLineIndex < 0) return

    const targetPage = scoreBookStore.findPageForLine(currentLineIndex)
    if (targetPage !== currentPage) {
      scoreBookStore.goToPage(targetPage)
    }
  }, [currentLineIndex, currentPage, isPlaying])

  // Manual navigation via swipe
  const handleSwipeLeft = useCallback(() => {
    scoreBookStore.nextPage()
  }, [])

  const handleSwipeRight = useCallback(() => {
    scoreBookStore.prevPage()
  }, [])

  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50,
    enabled: true,
  })

  // Page flip warning - show on second-to-last line of current page
  const showPageFlipWarning = useMemo(() => {
    if (!isPlaying || currentPage >= totalPages - 1) return false
    return scoreBookStore.isOnSecondToLastLineOfPage(currentLineIndex)
  }, [isPlaying, currentPage, totalPages, currentLineIndex])

  // Handle page flip warning tap
  const handlePageFlipTap = useCallback(() => {
    scoreBookStore.nextPage()
  }, [])

  // Handle line click - jump to that line
  const handleLineClick = useCallback(
    (index: number) => {
      jumpToLine(index)
    },
    [jumpToLine],
  )

  // Detect RTL direction once per song
  const isRTL = useMemo(
    () => (lyrics ? detectLyricsDirection(lyrics.lines) === "rtl" : false),
    [lyrics],
  )

  // Build map of line index → chord data (transposed if needed)
  const lineChordData = useMemo(() => {
    if (!showChords || !lyrics) {
      return new Map<number, LineChordData>()
    }

    // If we have a chord enhancement, use mergeChordSources to combine GP + Songsterr
    if (chordEnhancement) {
      const merged = mergeChordSources(lyrics.lines, chordsData, chordEnhancement)
      const map = new Map<number, LineChordData>()

      for (const line of merged.lines) {
        if (line.chords.length > 0) {
          const chordNames = line.chords.map(c => c.chord)
          const chords =
            transposeSemitones !== 0
              ? transposeChordLine(chordNames, transposeSemitones)
              : chordNames

          const lyricsLine = lyrics.lines[line.lineIndex]
          const chordPositions: LyricChordPosition[] = line.chords.map((c, idx) => {
            const lineStart = lyricsLine?.startTime ?? 0
            const lineEnd = lyricsLine?.endTime ?? lineStart + 3000
            const lineDuration = lineEnd - lineStart
            const lineLength = lyricsLine?.text.length ?? 1
            const timeOffset = c.absoluteMs - lineStart
            const charIndex = Math.floor((timeOffset / lineDuration) * lineLength)
            return {
              name: chords[idx] ?? c.chord,
              charIndex: Math.max(0, Math.min(lineLength - 1, charIndex)),
            }
          })

          map.set(line.lineIndex, {
            chords: chords.slice(0, 3),
            chordPositions: chordPositions.slice(0, 3),
          })
        }
      }
      return map
    }

    // No GP enhancement - use Songsterr only
    if (!chordsData) {
      return new Map<number, LineChordData>()
    }

    const matched = matchChordsToLyrics(chordsData.lines, lyrics.lines)
    const map = new Map<number, LineChordData>()

    for (let i = 0; i < matched.length; i++) {
      const line = matched[i]
      if (line?.chords && line.chords.length > 0) {
        const chords =
          transposeSemitones !== 0
            ? transposeChordLine(line.chords, transposeSemitones)
            : [...line.chords]

        const chordPositions = (line.chordPositions ?? []).map((pos, idx) => ({
          ...pos,
          name: chords[idx] ?? pos.name,
        }))

        map.set(i, { chords: chords.slice(0, 3), chordPositions: chordPositions.slice(0, 3) })
      }
    }
    return map
  }, [showChords, chordsData, lyrics, transposeSemitones, chordEnhancement])

  // Get lines for current page
  const currentPageRange = pageLineRanges[currentPage]
  const currentPageLines: readonly LyricLineType[] = useMemo(() => {
    if (!lyrics || !currentPageRange) return []
    return lyrics.lines.slice(currentPageRange.start, currentPageRange.end + 1)
  }, [lyrics, currentPageRange])

  // Animation variants - use crossfade for reduced motion
  const animationVariants = prefersReducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : variants.pageFlip

  const transitionConfig = prefersReducedMotion
    ? { duration: 0.3, ease: "easeInOut" }
    : springs.pageFlip

  if (!lyrics) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-neutral-500 text-lg">Load a song to see lyrics</p>
      </div>
    )
  }

  // Show highlight when playing/paused
  const isPlayingOrPaused = isPlaying || state._tag === "Paused"
  const activeIndex = isPlayingOrPaused ? Math.max(0, currentLineIndex) : -1

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden h-full ${className}`}
      {...swipeHandlers}
      aria-label="Score Book lyrics display"
    >
      {/* Page indicator */}
      <PageIndicator currentPage={currentPage + 1} totalPages={totalPages} />

      {/* Animated page container */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentPage}
          className="absolute inset-0 pt-16 pb-20"
          variants={animationVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transitionConfig}
        >
          <ScoreBookPage
            lines={currentPageLines}
            currentLineIndex={activeIndex}
            pageStartIndex={currentPageRange?.start ?? 0}
            fontSize={fontSize}
            showChords={scoreBookShowChords && showChords}
            showWordHighlight={scoreBookWordHighlight}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onLineClick={handleLineClick}
            lineChordData={lineChordData}
            isRTL={isRTL}
            songDuration={lyrics.duration}
            allLines={lyrics.lines}
          />
        </motion.div>
      </AnimatePresence>

      {/* Page flip warning */}
      <PageFlipWarning visible={showPageFlipWarning} onTap={handlePageFlipTap} />
    </div>
  )
})
