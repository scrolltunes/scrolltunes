"use client"

import { springs } from "@/animations"
import {
  useChordsData,
  useCurrentLineIndex,
  usePlayerControls,
  usePlayerState,
  usePreferences,
  useShowChords,
  useTranspose,
  useVariableSpeedPainting,
} from "@/core"
import { detectLyricsDirection } from "@/lib"
import { type LyricChordPosition, matchChordsToLyrics, transposeChordLine } from "@/lib/chords"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LyricLine } from "./LyricLine"

const SCROLL_OVERRIDE_TIMEOUT = 3000 // Resume auto-scroll after 3 seconds
const RUBBERBAND_RESISTANCE = 0.3 // How much resistance when overscrolling (0-1)
const MAX_OVERSCROLL = 100 // Maximum pixels of overscroll before full resistance

const isEmptyLine = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed === "" || trimmed === "♪"
}

export interface LyricsDisplayProps {
  readonly className?: string
}

/**
 * Main lyrics display with auto-scrolling and manual override
 *
 * Uses Motion transforms for GPU-accelerated scrolling.
 * Detects manual scroll/touch and temporarily disables auto-scroll.
 */
export function LyricsDisplay({ className = "" }: LyricsDisplayProps) {
  const state = usePlayerState()
  const currentLineIndex = useCurrentLineIndex()
  const { jumpToLine } = usePlayerControls()
  const { fontSize } = usePreferences()
  const chordsData = useChordsData()
  const showChords = useShowChords()
  const transposeSemitones = useTranspose()
  const variableSpeed = useVariableSpeedPainting()

  // Manual scroll override state
  const [isManualScrolling, setIsManualScrolling] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const manualScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs for geometry-based scroll calculation
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Calculate scroll bounds with rubberband effect
  const applyRubberband = useCallback((newScrollY: number): number => {
    const container = containerRef.current
    const content = contentRef.current
    const minScroll = 0

    // Calculate max scroll (content height - container height, accounting for 50vh padding on both sides)
    let maxScroll = 0
    if (container && content) {
      const containerHeight = container.clientHeight
      const contentHeight = content.scrollHeight
      // Content has py-[50vh] so actual scrollable area is contentHeight - containerHeight
      maxScroll = Math.max(0, contentHeight - containerHeight)
    }

    // Apply rubberband resistance when scrolling above top
    if (newScrollY < minScroll) {
      const overscroll = minScroll - newScrollY
      const resistance = Math.min(overscroll / MAX_OVERSCROLL, 1)
      const dampedOverscroll = overscroll * RUBBERBAND_RESISTANCE * (1 - resistance * 0.5)
      return minScroll - dampedOverscroll
    }

    // Apply rubberband resistance when scrolling past bottom
    if (newScrollY > maxScroll) {
      const overscroll = newScrollY - maxScroll
      const resistance = Math.min(overscroll / MAX_OVERSCROLL, 1)
      const dampedOverscroll = overscroll * RUBBERBAND_RESISTANCE * (1 - resistance * 0.5)
      return maxScroll + dampedOverscroll
    }

    return newScrollY
  }, [])

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null

  // Detect RTL direction once per song
  const isRTL = useMemo(
    () => (lyrics ? detectLyricsDirection(lyrics.lines) === "rtl" : false),
    [lyrics],
  )

  // Build map of line index → chord data (transposed if needed)
  const lineChordData = useMemo(() => {
    if (!showChords || !chordsData || !lyrics) {
      return new Map<number, { chords: string[]; chordPositions: LyricChordPosition[] }>()
    }

    // Match Songsterr chord lines to LRCLIB lyrics
    const matched = matchChordsToLyrics(chordsData.lines, lyrics.lines)

    // Build map of line index to (transposed) chord data
    const map = new Map<number, { chords: string[]; chordPositions: LyricChordPosition[] }>()
    for (let i = 0; i < matched.length; i++) {
      const line = matched[i]
      if (line?.chords && line.chords.length > 0) {
        const chords =
          transposeSemitones !== 0
            ? transposeChordLine(line.chords, transposeSemitones)
            : [...line.chords]

        // Also transpose the positioned chords
        const chordPositions = (line.chordPositions ?? []).map((pos, idx) => ({
          ...pos,
          name: chords[idx] ?? pos.name,
        }))

        map.set(i, { chords: chords.slice(0, 3), chordPositions: chordPositions.slice(0, 3) })
      }
    }
    return map
  }, [showChords, chordsData, lyrics, transposeSemitones])

  // Scroll to position a line at target position
  const scrollToLine = useCallback((lineIndex: number): boolean => {
    const container = containerRef.current
    const activeLine = lineRefs.current[lineIndex]

    // Skip if container or line not ready
    if (!container || !activeLine) return false

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()

    // Where the line currently is (relative to container top)
    const lineCurrentY = lineRect.top - containerRect.top

    // Target position: 25% from container top for comfortable reading
    const targetY = containerRect.height * 0.25

    // Adjust scroll by the difference
    const delta = lineCurrentY - targetY
    setScrollY(prev => prev + delta)
    return true
  }, [])

  // Track if initial scroll has happened
  const hasInitialScroll = useRef(false)

  // Initial scroll when lyrics first render - only needed if first line is empty
  useEffect(() => {
    if (!lyrics || hasInitialScroll.current) return

    // Only scroll initially if the first line is empty (to show first non-empty line)
    const firstLine = lyrics.lines[0]
    if (firstLine?.text.trim() !== "") {
      hasInitialScroll.current = true
      return
    }

    // Find first non-empty line index
    const firstLineIndex = lyrics.lines.findIndex(line => line.text.trim() !== "")
    if (firstLineIndex === -1) return

    // Retry with increasing delays to handle font loading and layout shifts
    const delays = [50, 100, 200]
    const timeoutIds: NodeJS.Timeout[] = []

    for (const delay of delays) {
      const timeoutId = setTimeout(() => {
        if (!hasInitialScroll.current && scrollToLine(firstLineIndex)) {
          hasInitialScroll.current = true
        }
      }, delay)
      timeoutIds.push(timeoutId)
    }

    return () => {
      for (const id of timeoutIds) {
        clearTimeout(id)
      }
    }
  }, [lyrics, scrollToLine])

  // Reset initial scroll flag when lyrics change
  useEffect(() => {
    hasInitialScroll.current = false
    setScrollY(0)
  }, [lyrics])

  // Update scroll position when current line changes (if not manually scrolling)
  useEffect(() => {
    if (isManualScrolling || !lyrics) return

    let lineIndex = Math.max(0, currentLineIndex)

    // If current line is empty (or just a musical note), scroll to the next non-empty line
    // This keeps the next lyric visible while waiting
    const currentLine = lyrics.lines[lineIndex]
    if (currentLine && isEmptyLine(currentLine.text)) {
      for (let i = lineIndex + 1; i < lyrics.lines.length; i++) {
        const line = lyrics.lines[i]
        if (line && !isEmptyLine(line.text)) {
          lineIndex = i
          break
        }
      }
    }

    // Double RAF to ensure layout is fully settled (fonts loaded, text reflowed)
    let rafId2: number | undefined
    const rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        scrollToLine(lineIndex)
      })
    })

    return () => {
      cancelAnimationFrame(rafId1)
      if (rafId2 !== undefined) cancelAnimationFrame(rafId2)
    }
  }, [currentLineIndex, isManualScrolling, lyrics, scrollToLine])

  // Handle manual scroll detection
  const handleUserScroll = useCallback(() => {
    setIsManualScrolling(true)

    // Clear existing timeout
    if (manualScrollTimeoutRef.current) {
      clearTimeout(manualScrollTimeoutRef.current)
    }

    // Resume auto-scroll after timeout
    manualScrollTimeoutRef.current = setTimeout(() => {
      setIsManualScrolling(false)
    }, SCROLL_OVERRIDE_TIMEOUT)
  }, [])

  // Handle wheel events
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      handleUserScroll()
      setScrollY(prev => applyRubberband(prev + e.deltaY))
    },
    [handleUserScroll, applyRubberband],
  )

  // Handle touch events for mobile
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0]?.clientY ?? null
      handleUserScroll()
    },
    [handleUserScroll],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return
      const currentY = e.touches[0]?.clientY ?? 0
      const deltaY = touchStartY.current - currentY
      touchStartY.current = currentY
      setScrollY(prev => applyRubberband(prev + deltaY))
    },
    [applyRubberband],
  )

  // Snap back to bounds when touch ends
  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null
    const container = containerRef.current
    const content = contentRef.current

    // Calculate max scroll
    let maxScroll = 0
    if (container && content) {
      maxScroll = Math.max(0, content.scrollHeight - container.clientHeight)
    }

    // Snap back to bounds
    setScrollY(prev => {
      if (prev < 0) return 0
      if (prev > maxScroll) return maxScroll
      return prev
    })
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current)
      }
    }
  }, [])

  // Handle line click
  const handleLineClick = useCallback(
    (index: number) => {
      jumpToLine(index)
      setIsManualScrolling(false)
    },
    [jumpToLine],
  )

  if (!lyrics) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-neutral-500 text-lg">Load a song to see lyrics</p>
      </div>
    )
  }

  // Only show highlight when playing/paused, not in Ready state
  // Empty lines render as spacers without highlight, so no special handling needed
  const isPlaying = state._tag === "Playing"
  const isPlayingOrPaused = isPlaying || state._tag === "Paused"
  const activeLineIndex = isPlayingOrPaused ? Math.max(0, currentLineIndex) : -1

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden h-full ${className}`}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Lyrics display"
    >
      {/* Manual scroll indicator */}
      {isManualScrolling && (
        <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-neutral-800/80 rounded-full text-sm text-neutral-400">
          Manual scroll
        </div>
      )}

      <motion.div
        ref={contentRef}
        className="py-[50vh] max-w-4xl mx-auto"
        animate={{ y: -scrollY }}
        transition={springs.scroll}
      >
        {lyrics.lines.map((line, index) => {
          const isActive = index === activeLineIndex
          const isNext = index === activeLineIndex + 1
          const duration = isActive
            ? (lyrics.lines[index + 1]?.startTime ?? lyrics.duration) - line.startTime
            : undefined
          const chordData = lineChordData.get(index)

          return (
            <LyricLine
              key={line.id}
              text={line.text}
              isActive={isActive}
              isPast={index < activeLineIndex}
              isNext={isNext}
              onClick={() => handleLineClick(index)}
              index={index}
              fontSize={fontSize}
              innerRef={el => {
                lineRefs.current[index] = el
              }}
              isRTL={isRTL}
              isPlaying={isPlaying}
              chords={chordData?.chords}
              chordPositions={chordData?.chordPositions}
              variableSpeed={variableSpeed}
              {...(duration !== undefined && { duration })}
            />
          )
        })}
      </motion.div>
    </div>
  )
}
