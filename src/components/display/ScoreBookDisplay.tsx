"use client"

import { springs, variants } from "@/animations"
import {
  type LyricLine as LyricLineType,
  scoreBookStore,
  useChordsData,
  useCurrentLineIndex,
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
import { PageIndicator } from "./PageIndicator"
import { PageNavigationArrows } from "./PageNavigationArrows"
import { PageSidebar } from "./PageSidebar"
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
  /**
   * Whether manual navigation mode is active (disables auto-advance)
   */
  readonly isManualMode?: boolean
  /**
   * Callback to enter manual navigation mode during playback
   */
  readonly enterManualMode?: () => void
}

/**
 * Main Score Book display - page-based lyrics with auto/manual page navigation
 *
 * Orchestrates ScoreBookPage, PageIndicator, PageSidebar, and pagination logic.
 * Pages flip automatically when the current line crosses a page boundary,
 * or manually via swipe gestures or navigation arrows.
 */
export const ScoreBookDisplay = memo(function ScoreBookDisplay({
  className = "",
  chordEnhancement,
  isManualMode = false,
  enterManualMode,
}: ScoreBookDisplayProps) {
  const state = usePlayerState()
  const currentLineIndex = useCurrentLineIndex()
  const { jumpToLine } = usePlayerControls()
  const { scoreBookFontSize, scoreBookShowChords } = usePreferences()
  const chordsData = useChordsData()
  const showChords = useShowChords()
  const transposeSemitones = useTranspose()
  const prefersReducedMotion = useReducedMotion()

  // ScoreBook pagination state
  const { currentPage, totalPages, linesPerPage, pageLineRanges } = useScoreBookState()

  // Container ref for dynamic pagination
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null
  const totalLines = lyrics?.lines.length ?? 0

  // Dynamic pagination calculation
  const { linesPerPage: calculatedLinesPerPage } = useDynamicPagination({
    containerRef,
    fontSize: scoreBookFontSize,
    totalLines,
  })

  // Update ScoreBookStore when pagination parameters change
  useEffect(() => {
    if (totalLines > 0) {
      scoreBookStore.setPagination(totalLines, calculatedLinesPerPage)
    }
  }, [totalLines, calculatedLinesPerPage])

  // Navigate to page containing current line after repagination (e.g., window resize)
  // This ensures content is never hidden when linesPerPage changes
  // Note: Only depends on calculatedLinesPerPage to avoid overriding manual navigation
  useEffect(() => {
    if (currentLineIndex < 0) return

    const targetPage = scoreBookStore.findPageForLine(currentLineIndex)
    scoreBookStore.goToPage(targetPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculatedLinesPerPage])

  // Reset pagination when song changes
  const songId = lyrics?.songId
  useEffect(() => {
    scoreBookStore.reset()
  }, [songId])

  // Auto-advance page when current line crosses page boundary during playback
  // Respects manual mode - when user navigates manually, auto-advance is paused
  const isPlaying = state._tag === "Playing"
  useEffect(() => {
    if (!isPlaying || currentLineIndex < 0 || isManualMode) return

    const targetPage = scoreBookStore.findPageForLine(currentLineIndex)
    if (targetPage !== currentPage) {
      scoreBookStore.goToPage(targetPage)
    }
  }, [currentLineIndex, currentPage, isPlaying, isManualMode])

  // Manual navigation via swipe
  const handleSwipeLeft = useCallback(() => {
    enterManualMode?.()
    scoreBookStore.nextPage()
  }, [enterManualMode])

  const handleSwipeRight = useCallback(() => {
    enterManualMode?.()
    scoreBookStore.prevPage()
  }, [enterManualMode])

  const { handlers: swipeHandlers } = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50,
    enabled: true,
  })

  // Navigation arrow handlers
  const handlePrevPage = useCallback(() => {
    enterManualMode?.()
    scoreBookStore.prevPage()
  }, [enterManualMode])

  const handleNextPage = useCallback(() => {
    enterManualMode?.()
    scoreBookStore.nextPage()
  }, [enterManualMode])

  // Handle line click - jump to that line
  const handleLineClick = useCallback(
    (index: number) => {
      jumpToLine(index)
    },
    [jumpToLine],
  )

  // Handle page selection from sidebar
  const handlePageSelect = useCallback((pageIndex: number) => {
    scoreBookStore.goToPage(pageIndex)
  }, [])

  // Build pages array for sidebar
  const pages = useMemo(() => {
    if (!lyrics) return []
    return pageLineRanges.map(range => lyrics.lines.slice(range.start, range.end + 1))
  }, [lyrics, pageLineRanges])

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

  const hasPrev = currentPage > 0
  const hasNext = currentPage < totalPages - 1

  return (
    <div className={`flex h-full ${className}`} aria-label="Score Book lyrics display">
      {/* Desktop sidebar with page thumbnails */}
      <PageSidebar
        pages={pages}
        currentPage={currentPage}
        currentLineIndex={activeIndex}
        onPageSelect={handlePageSelect}
        linesPerPage={linesPerPage}
      />

      {/* Main content area */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden" {...swipeHandlers}>
        {/* Page indicator */}
        <PageIndicator currentPage={currentPage + 1} totalPages={totalPages} />

        {/* Animated page container */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentPage}
            className="absolute inset-0 pt-16 pb-20 px-4 lg:px-8 overflow-hidden"
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
              fontSize={scoreBookFontSize}
              showChords={scoreBookShowChords && showChords}
              onLineClick={handleLineClick}
              lineChordData={lineChordData}
              isRTL={isRTL}
            />
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <PageNavigationArrows
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      </div>
    </div>
  )
})
