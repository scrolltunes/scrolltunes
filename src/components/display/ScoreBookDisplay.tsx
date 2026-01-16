"use client"

import { springs, variants } from "@/animations"
import {
  type LyricLine as LyricLineType,
  scoreBookStore,
  useChordsData,
  useContinuousTime,
  useCurrentLineIndex,
  useIsAdmin,
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
  const currentTime = useContinuousTime()
  const isAdmin = useIsAdmin()

  // ScoreBook pagination state
  const { currentPage, totalPages, linesPerPage, pageLineRanges, direction } = useScoreBookState()

  // Container ref for swipe gestures
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Content area ref for accurate height measurement (inside the padded area)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null
  const totalLines = lyrics?.lines.length ?? 0

  // Dynamic pagination calculation - measures actual content area
  const { linesPerPage: calculatedLinesPerPage, debugHeight } = useDynamicPagination({
    contentRef,
    fontSize: scoreBookFontSize,
    totalLines,
  })

  // Reset pagination when song changes (must be first to avoid race conditions)
  const songId = lyrics?.songId
  useEffect(() => {
    scoreBookStore.reset()
  }, [songId])

  // Update ScoreBookStore when pagination parameters change
  useEffect(() => {
    if (totalLines > 0 && calculatedLinesPerPage > 0) {
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

  // Get preview line from next page (first non-empty line of next page)
  const { previewLine, previewLineIndex } = useMemo(() => {
    const nextPageRange = pageLineRanges[currentPage + 1]
    if (!nextPageRange || !lyrics) {
      return { previewLine: undefined, previewLineIndex: undefined }
    }
    for (let i = nextPageRange.start; i <= nextPageRange.end; i++) {
      const line = lyrics.lines[i]
      if (line && line.text.trim() !== "") {
        return { previewLine: line, previewLineIndex: i }
      }
    }
    return { previewLine: undefined, previewLineIndex: undefined }
  }, [pageLineRanges, currentPage, lyrics])

  // Calculate page progress (0-1) - no memo for smooth continuous updates
  let pageProgress = 0
  if (currentPageLines.length > 0) {
    const firstLine = currentPageLines[0]
    const lastLine = currentPageLines[currentPageLines.length - 1]
    if (firstLine && lastLine) {
      const pageStartTime = firstLine.startTime
      const pageEndTime = lastLine.endTime
      const pageDuration = pageEndTime - pageStartTime

      if (pageDuration > 0) {
        if (currentTime >= pageEndTime) {
          pageProgress = 1
        } else if (currentTime > pageStartTime) {
          pageProgress = (currentTime - pageStartTime) / pageDuration
        }
      }
    }
  }

  // Animation variants - use crossfade for reduced motion
  const animationVariants = prefersReducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : variants.pageFlip

  const transitionConfig = prefersReducedMotion
    ? { duration: 0.25, ease: "easeInOut" }
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
      {/* Main content area */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 h-full overflow-hidden"
        {...swipeHandlers}
      >
        {/* Page progress bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1 z-40"
          style={{ background: "var(--color-progress-track)" }}
        >
          <div
            className="h-full w-full origin-left"
            style={{
              transform: `scaleX(${pageProgress})`,
              background:
                "linear-gradient(90deg, var(--color-progress-start) 0%, var(--color-progress-end) 100%)",
            }}
          />
        </div>

        {/* Page indicator */}
        <PageIndicator currentPage={currentPage + 1} totalPages={totalPages} />

        {/* Debug overlay - admin only */}
        {isAdmin && (
          <div className="absolute top-2 left-2 z-50 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono leading-relaxed">
            <div>
              Lines: {currentPageLines.length} | Store: {linesPerPage} | Calc:{" "}
              {calculatedLinesPerPage}
            </div>
            <div>
              H: {debugHeight}px | Page: {currentPage + 1}/{totalPages}
            </div>
            <div>
              Ranges: {pageLineRanges.length} | Range:{" "}
              {currentPageRange ? `${currentPageRange.start}-${currentPageRange.end}` : "none"}
            </div>
            <div>
              Font: {scoreBookFontSize}px | Total: {totalLines}
            </div>
          </div>
        )}

        {/* Hidden measurement div - measures container height */}
        <div ref={contentRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* Animated page container */}
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentPage}
            className="absolute inset-0 pt-16 pb-20 px-4 sm:px-8 lg:px-12 overflow-hidden"
            custom={direction}
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
              {...(previewLine && { previewLine })}
              {...(previewLineIndex !== undefined && { previewLineIndex })}
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
