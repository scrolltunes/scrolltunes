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

const SCROLL_INDICATOR_TIMEOUT = 3000 // Hide manual scroll badge after 3 seconds
const MOMENTUM_FRICTION = 0.0015 // Velocity decay rate (higher = faster stop)
const MIN_VELOCITY = 0.005 // Minimum velocity to continue momentum (pixels/ms)
const MAX_VELOCITY = 5 // Maximum velocity clamp (pixels/ms)

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
  const [showManualScrollIndicator, setShowManualScrollIndicator] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const manualIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const momentumRafIdRef = useRef<number | null>(null)

  // Refs for geometry-based scroll calculation
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Calculate scroll bounds with snap-back effect
  const applyRubberband = useCallback((newScrollY: number): number => {
    const container = containerRef.current
    const content = contentRef.current
    const minScroll = initialScrollValue.current

    // Calculate max scroll (content height - container height, accounting for 50vh padding on both sides)
    let maxScroll = 0
    if (container && content) {
      const containerHeight = container.clientHeight
      const contentHeight = content.scrollHeight
      // Content has py-[50vh] so actual scrollable area is contentHeight - containerHeight
      maxScroll = Math.max(0, contentHeight - containerHeight)
    }

    // Snap back when scrolling above top
    if (newScrollY < minScroll) {
      return minScroll
    }

    // Snap back when scrolling past bottom
    if (newScrollY > maxScroll) {
      return maxScroll
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

  // Track if initial scroll has happened and what the initial scroll value was
  const hasInitialScroll = useRef(false)
  const initialScrollValue = useRef(0)

  // Initial scroll when lyrics first render or when reset - always scroll to first non-empty line
  useEffect(() => {
    if (!lyrics || hasInitialScroll.current) return

    // Find first non-empty line index (default to 0 if all empty)
    let firstLineIndex = lyrics.lines.findIndex(line => line.text.trim() !== "")
    if (firstLineIndex === -1) firstLineIndex = 0

    // Retry with increasing delays to handle font loading and layout shifts
    const delays = [50, 100, 200]
    const timeoutIds: NodeJS.Timeout[] = []

    for (const delay of delays) {
      const timeoutId = setTimeout(() => {
        if (!hasInitialScroll.current && scrollToLine(firstLineIndex)) {
          hasInitialScroll.current = true
          // Capture the scroll value after initial scroll completes
          setScrollY(current => {
            initialScrollValue.current = current
            return current
          })
        }
      }, delay)
      timeoutIds.push(timeoutId)
    }

    return () => {
      for (const id of timeoutIds) {
        clearTimeout(id)
      }
    }
  }, [lyrics, scrollToLine, state._tag])

  // Reset state when lyrics change
  useEffect(() => {
    hasInitialScroll.current = false
    setScrollY(0)
    setIsManualScrolling(false)
    setShowManualScrollIndicator(false)
  }, [lyrics])

  // Only auto-scroll when playing AND not manually overridden
  const isPlaying = state._tag === "Playing"
  const isAutoScrollEnabled = isPlaying && !isManualScrolling

  // Reset scroll and state when player is reset to Ready, or manual scroll when play is pressed
  const prevStateTag = useRef(state._tag)
  useEffect(() => {
    // Reset scroll position when transitioning to Ready (reset button pressed)
    if (prevStateTag.current !== "Ready" && state._tag === "Ready") {
      hasInitialScroll.current = false
      setScrollY(initialScrollValue.current)
      setIsManualScrolling(false)
      setShowManualScrollIndicator(false)
    }
    // Clear manual scroll when transitioning to Playing
    else if (prevStateTag.current !== "Playing" && state._tag === "Playing") {
      setIsManualScrolling(false)
      setShowManualScrollIndicator(false)
    }
    prevStateTag.current = state._tag
  }, [state._tag])

  // Update scroll position when current line changes (only during active playback)
  useEffect(() => {
    if (!lyrics || !isAutoScrollEnabled) return

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
  }, [currentLineIndex, isAutoScrollEnabled, lyrics, scrollToLine])

  // Check if active line is visible in viewport
  const isActiveLineVisible = useCallback(() => {
    if (currentLineIndex < 0) return true
    const container = containerRef.current
    const activeLine = lineRefs.current[currentLineIndex]
    if (!container || !activeLine) return true

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()

    // Line is visible if any part of it is within the container
    return lineRect.bottom > containerRect.top && lineRect.top < containerRect.bottom
  }, [currentLineIndex])

  // Handle manual scroll detection - sticky override until highlight leaves view
  // When playing and highlight goes out of view, resume auto-follow
  const handleUserScroll = useCallback(() => {
    setIsManualScrolling(true)
    setShowManualScrollIndicator(true)

    // Clear existing timeout
    if (manualIndicatorTimeoutRef.current) {
      clearTimeout(manualIndicatorTimeoutRef.current)
    }

    // Only hide the badge after timeout - do NOT reset isManualScrolling
    manualIndicatorTimeoutRef.current = setTimeout(() => {
      setShowManualScrollIndicator(false)
    }, SCROLL_INDICATOR_TIMEOUT)

    // If playing and active line goes out of view, reset manual scroll to resume following
    if (isPlaying && !isActiveLineVisible()) {
      setIsManualScrolling(false)
      setShowManualScrollIndicator(false)
    }
  }, [isPlaying, isActiveLineVisible])

  // Handle wheel events
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      handleUserScroll()
      setScrollY(prev => applyRubberband(prev + e.deltaY))
    },
    [handleUserScroll, applyRubberband],
  )

  // Handle touch events for mobile with velocity-based momentum
  const touchStartY = useRef<number | null>(null)
  const touchLastY = useRef<number | null>(null)
  const touchLastTime = useRef<number | null>(null)
  const touchVelocity = useRef<number>(0)

  // Helper to get max scroll bounds
  const getMaxScroll = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return 0
    return Math.max(0, content.scrollHeight - container.clientHeight)
  }, [])

  // Start momentum animation after touch ends
  const startMomentumScroll = useCallback(() => {
    const initialV = touchVelocity.current

    if (Math.abs(initialV) < MIN_VELOCITY) {
      // Just snap back to bounds
      const maxScroll = getMaxScroll()
      setScrollY(prev => Math.min(Math.max(prev, initialScrollValue.current), maxScroll))
      return
    }

    let v = initialV
    let lastTime = performance.now()

    const step = () => {
      const now = performance.now()
      const dt = now - lastTime
      lastTime = now

      // Velocity decays exponentially with friction
      v *= Math.exp(-MOMENTUM_FRICTION * dt)

      let stop = false
      setScrollY(prev => {
        const next = applyRubberband(prev + v * dt)
        const maxScroll = getMaxScroll()

        // Stop if past bounds and velocity pointing further out
        if ((next < 0 && v < 0) || (next > maxScroll && v > 0)) {
          stop = true
        }
        return next
      })

      if (stop || Math.abs(v) < MIN_VELOCITY) {
        // Final clamp to bounds
        const maxScroll = getMaxScroll()
        setScrollY(prev => Math.min(Math.max(prev, initialScrollValue.current), maxScroll))
        momentumRafIdRef.current = null
        return
      }

      momentumRafIdRef.current = requestAnimationFrame(step)
    }

    momentumRafIdRef.current = requestAnimationFrame(step)
  }, [applyRubberband, getMaxScroll])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const y = e.touches[0]?.clientY ?? null
      touchStartY.current = y
      touchLastY.current = y
      touchLastTime.current = performance.now()
      touchVelocity.current = 0

      // Cancel any running momentum when user touches again
      if (momentumRafIdRef.current !== null) {
        cancelAnimationFrame(momentumRafIdRef.current)
        momentumRafIdRef.current = null
      }

      handleUserScroll()
    },
    [handleUserScroll],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const currentY = e.touches[0]?.clientY ?? 0
      if (
        touchStartY.current === null ||
        touchLastY.current === null ||
        touchLastTime.current === null
      )
        return

      const now = performance.now()
      const dy = touchLastY.current - currentY // positive dy = scroll down
      const dt = now - touchLastTime.current

      touchStartY.current = currentY
      touchLastY.current = currentY
      touchLastTime.current = now

      if (dt > 0) {
        // Calculate velocity (pixels per ms), clamped to avoid crazy spikes
        const v = dy / dt
        touchVelocity.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v))
      }

      setScrollY(prev => applyRubberband(prev + dy))
    },
    [applyRubberband],
  )

  // Start momentum scroll when touch ends
  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null
    touchLastY.current = null
    touchLastTime.current = null
    startMomentumScroll()
  }, [startMomentumScroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (manualIndicatorTimeoutRef.current) {
        clearTimeout(manualIndicatorTimeoutRef.current)
      }
      if (momentumRafIdRef.current !== null) {
        cancelAnimationFrame(momentumRafIdRef.current)
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

  // Blur the focused line when player state changes to avoid persistent focus ring
  useEffect(() => {
    const focused = document.activeElement as HTMLElement
    if (focused && focused.tagName === "BUTTON" && lineRefs.current.includes(focused as HTMLButtonElement)) {
      focused.blur()
    }
  }, [state._tag])

  if (!lyrics) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-neutral-500 text-lg">Load a song to see lyrics</p>
      </div>
    )
  }

  // Only show highlight when playing/paused, not in Ready state
  // Empty lines render as spacers without highlight, so no special handling needed
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
      {showManualScrollIndicator && (
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
