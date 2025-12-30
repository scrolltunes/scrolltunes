"use client"

import { springs } from "@/animations"
import {
  useChordsData,
  useCurrentLineIndex,
  useCurrentTime,
  usePlayerControls,
  usePlayerState,
  usePreferences,
  useResetCount,
  useShowChords,
  useTranspose,
  useVariableSpeedPainting,
} from "@/core"
import { detectLyricsDirection } from "@/lib"
import { type LyricChordPosition, matchChordsToLyrics, transposeChordLine } from "@/lib/chords"
import { mergeChordSources } from "@/lib/chords/merge-chords"
import type { ChordEnhancementPayloadV1 } from "@/lib/gp/chord-types"
import { animate, motion, useMotionValue, useTransform } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LyricLine } from "./LyricLine"

const SCROLL_INDICATOR_TIMEOUT_TOUCH = 3000 // Hide manual scroll badge after touch scroll
const SCROLL_INDICATOR_TIMEOUT_WHEEL = 6000 // Hide manual scroll badge after wheel scroll
const MOMENTUM_FRICTION = 0.0022 // Velocity decay rate (higher = faster stop)
const MIN_VELOCITY = 0.01 // Minimum velocity to continue momentum (pixels/ms)
const MAX_VELOCITY = 4 // Maximum velocity clamp (pixels/ms)
const VELOCITY_SMOOTHING = 0.2 // Smooths touch velocity for natural fling
const RUBBERBAND_COEFFICIENT = 0.55
const OVERSCROLL_DAMPING = 0.6

const isEmptyLine = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed === "" || trimmed === "♪"
}

const rubberbandDistance = (distance: number, dimension: number): number => {
  if (distance <= 0 || dimension <= 0) return 0
  return (
    (distance * dimension * RUBBERBAND_COEFFICIENT) /
    (dimension + RUBBERBAND_COEFFICIENT * distance)
  )
}

export interface LyricsDisplayProps {
  readonly className?: string
  readonly chordEnhancement?: ChordEnhancementPayloadV1 | null | undefined
}

/**
 * Main lyrics display with auto-scrolling and manual override
 *
 * Uses Motion transforms for GPU-accelerated scrolling.
 * Detects manual scroll/touch and temporarily disables auto-scroll.
 */
export function LyricsDisplay({ className = "", chordEnhancement }: LyricsDisplayProps) {
  const state = usePlayerState()
  const currentLineIndex = useCurrentLineIndex()
  const currentTime = useCurrentTime()
  const resetCount = useResetCount()
  const { jumpToLine } = usePlayerControls()
  const { fontSize } = usePreferences()
  const chordsData = useChordsData()
  const showChords = useShowChords()
  const transposeSemitones = useTranspose()
  const variableSpeed = useVariableSpeedPainting()

  // Manual scroll override state
  const [isManualScrolling, setIsManualScrolling] = useState(false)
  const [showManualScrollIndicator, setShowManualScrollIndicator] = useState(false)
  const scrollY = useMotionValue(0)
  const manualIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const momentumRafIdRef = useRef<number | null>(null)
  const scrollAnimationRef = useRef<ReturnType<typeof animate> | null>(null)
  const scrollYOffset = useTransform(scrollY, value => -value)

  // Refs for geometry-based scroll calculation
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])

  const getScrollBounds = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return null

    const containerHeight = container.clientHeight
    const contentHeight = content.scrollHeight
    const minScroll = initialScrollValue.current
    const maxScroll = Math.max(minScroll, contentHeight - containerHeight)

    return { minScroll, maxScroll, containerHeight }
  }, [])

  const clampScroll = useCallback(
    (value: number): number => {
      const bounds = getScrollBounds()
      if (!bounds) return value
      return Math.min(Math.max(value, bounds.minScroll), bounds.maxScroll)
    },
    [getScrollBounds],
  )

  const applyRubberband = useCallback(
    (value: number): number => {
      const bounds = getScrollBounds()
      if (!bounds) return value

      const { minScroll, maxScroll, containerHeight } = bounds
      if (value < minScroll) {
        const overscroll = minScroll - value
        return minScroll - rubberbandDistance(overscroll, containerHeight)
      }
      if (value > maxScroll) {
        const overscroll = value - maxScroll
        return maxScroll + rubberbandDistance(overscroll, containerHeight)
      }
      return value
    },
    [getScrollBounds],
  )

  const stopScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current) {
      scrollAnimationRef.current.stop()
      scrollAnimationRef.current = null
    }
  }, [])

  const setScrollYImmediate = useCallback(
    (value: number) => {
      stopScrollAnimation()
      scrollY.set(value)
    },
    [scrollY, stopScrollAnimation],
  )

  const updateScrollY = useCallback(
    (updater: (prev: number) => number) => {
      const next = updater(scrollY.get())
      scrollY.set(next)
    },
    [scrollY],
  )

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null

  // Detect RTL direction once per song
  const isRTL = useMemo(
    () => (lyrics ? detectLyricsDirection(lyrics.lines) === "rtl" : false),
    [lyrics],
  )

  // Build map of line index → chord data (transposed if needed)
  // Uses GP chord enhancement if available, otherwise falls back to Songsterr
  const lineChordData = useMemo(() => {
    if (!showChords || !lyrics) {
      return new Map<number, { chords: string[]; chordPositions: LyricChordPosition[] }>()
    }

    // If we have a chord enhancement, use mergeChordSources to combine GP + Songsterr
    if (chordEnhancement) {
      const merged = mergeChordSources(lyrics.lines, chordsData, chordEnhancement)
      const map = new Map<number, { chords: string[]; chordPositions: LyricChordPosition[] }>()

      for (const line of merged.lines) {
        if (line.chords.length > 0) {
          // Extract chord names and transpose if needed
          const chordNames = line.chords.map(c => c.chord)
          const chords =
            transposeSemitones !== 0
              ? transposeChordLine(chordNames, transposeSemitones)
              : chordNames

          // For GP chords, we don't have char positions, so estimate from time
          const lyricsLine = lyrics.lines[line.lineIndex]
          const chordPositions: LyricChordPosition[] = line.chords.map((c, idx) => {
            const lineStart = lyricsLine?.startTime ?? 0
            const lineEnd = lyricsLine?.endTime ?? lineStart + 3000
            const lineDuration = lineEnd - lineStart
            const lineLength = lyricsLine?.text.length ?? 1
            // Convert absolute time to char position
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
  }, [showChords, chordsData, lyrics, transposeSemitones, chordEnhancement])

  // Scroll to position a line at target position
  const getLineScrollTarget = useCallback(
    (lineIndex: number): number | null => {
      const container = containerRef.current
      const activeLine = lineRefs.current[lineIndex]

      // Skip if container or line not ready
      if (!container || !activeLine) return null

      const containerRect = container.getBoundingClientRect()
      const lineRect = activeLine.getBoundingClientRect()

      // Where the line currently is (relative to container top)
      const lineCurrentY = lineRect.top - containerRect.top

      // Target position: 25% from container top for comfortable reading
      const targetY = containerRect.height * 0.25

      // Adjust scroll by the difference
      const delta = lineCurrentY - targetY
      return clampScroll(scrollY.get() + delta)
    },
    [clampScroll, scrollY],
  )

  // Calculate initial scroll position for a line (independent of current scrollY)
  const getInitialScrollTarget = useCallback(
    (lineIndex: number): number | null => {
      const container = containerRef.current
      const content = contentRef.current
      const targetLine = lineRefs.current[lineIndex]

      if (!container || !content || !targetLine) return null

      const containerHeight = container.clientHeight
      const contentHeight = content.scrollHeight
      const currentScroll = scrollY.get()

      // Get line's current visual position relative to container
      const containerRect = container.getBoundingClientRect()
      const lineRect = targetLine.getBoundingClientRect()
      const lineCurrentY = lineRect.top - containerRect.top

      // Target position: 25% from container top
      const targetY = containerHeight * 0.25

      // Calculate what scroll value would position the line at targetY
      // lineCurrentY is based on currentScroll, so we need to account for that
      const target = currentScroll + (lineCurrentY - targetY)

      // Clamp to valid scroll range
      const minScroll = 0
      const maxScroll = Math.max(0, contentHeight - containerHeight)
      return Math.min(Math.max(target, minScroll), maxScroll)
    },
    [scrollY],
  )

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
        if (!hasInitialScroll.current) {
          const target = getLineScrollTarget(firstLineIndex)
          if (target === null) return
          hasInitialScroll.current = true
          initialScrollValue.current = target
          setScrollYImmediate(target)
        }
      }, delay)
      timeoutIds.push(timeoutId)
    }

    return () => {
      for (const id of timeoutIds) {
        clearTimeout(id)
      }
    }
  }, [getLineScrollTarget, lyrics, setScrollYImmediate, state._tag])

  // Reset state when song changes (not just lyrics timing updates)
  const songId = lyrics?.songId
  useEffect(() => {
    hasInitialScroll.current = false
    setScrollYImmediate(0)
    setIsManualScrolling(false)
    setShowManualScrollIndicator(false)
  }, [songId, setScrollYImmediate])

  // Only auto-scroll when playing AND not manually overridden
  const isPlaying = state._tag === "Playing"
  const isAutoScrollEnabled = isPlaying && !isManualScrolling

  // Reset scroll position when reset button is pressed
  const prevResetCount = useRef(resetCount)
  useEffect(() => {
    if (resetCount > prevResetCount.current) {
      // Try to recalculate, fall back to cached initial value
      let target: number | null = null
      if (lyrics) {
        const idx = lyrics.lines.findIndex(line => line.text.trim() !== "")
        const firstLineIndex = idx !== -1 ? idx : 0
        target = getInitialScrollTarget(firstLineIndex)
      }

      const scrollTarget = target ?? initialScrollValue.current
      setScrollYImmediate(scrollTarget)
      hasInitialScroll.current = true
      setIsManualScrolling(false)
      setShowManualScrollIndicator(false)
    }
    prevResetCount.current = resetCount
  }, [resetCount, lyrics, getInitialScrollTarget, setScrollYImmediate])

  // Clear manual scroll when transitioning to Playing
  const prevStateTag = useRef(state._tag)
  useEffect(() => {
    if (prevStateTag.current !== "Playing" && state._tag === "Playing") {
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
        const target = getLineScrollTarget(lineIndex)
        if (target === null) return
        stopScrollAnimation()
        scrollAnimationRef.current = animate(scrollY, target, springs.scroll)
      })
    })

    return () => {
      cancelAnimationFrame(rafId1)
      if (rafId2 !== undefined) cancelAnimationFrame(rafId2)
    }
  }, [
    currentLineIndex,
    getLineScrollTarget,
    isAutoScrollEnabled,
    lyrics,
    scrollY,
    stopScrollAnimation,
  ])

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

  const scheduleManualIndicatorHide = useCallback(
    (delayMs: number) => {
      if (manualIndicatorTimeoutRef.current) {
        clearTimeout(manualIndicatorTimeoutRef.current)
      }
      manualIndicatorTimeoutRef.current = setTimeout(() => {
        setShowManualScrollIndicator(false)
        if (isPlaying && isActiveLineVisible()) {
          setIsManualScrolling(false)
        }
      }, delayMs)
    },
    [isPlaying, isActiveLineVisible],
  )

  // Handle manual scroll detection - sticky override until highlight leaves view
  // When playing and highlight goes out of view, resume auto-follow
  const handleUserScroll = useCallback(() => {
    setIsManualScrolling(true)
    setShowManualScrollIndicator(true)

    // If playing and active line goes out of view, reset manual scroll to resume following
    if (isPlaying && !isActiveLineVisible()) {
      setIsManualScrolling(false)
      setShowManualScrollIndicator(false)
    }
  }, [isPlaying, isActiveLineVisible])

  // Handle wheel events
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault()
      }
      stopScrollAnimation()
      handleUserScroll()
      scheduleManualIndicatorHide(SCROLL_INDICATOR_TIMEOUT_WHEEL)
      updateScrollY(prev => clampScroll(prev + e.deltaY))
    },
    [
      handleUserScroll,
      clampScroll,
      scheduleManualIndicatorHide,
      stopScrollAnimation,
      updateScrollY,
    ],
  )

  // Handle touch events for mobile with velocity-based momentum
  const touchStartY = useRef<number | null>(null)
  const touchLastY = useRef<number | null>(null)
  const touchLastTime = useRef<number | null>(null)
  const touchVelocity = useRef<number>(0)

  // Start momentum animation after touch ends
  const startMomentumScroll = useCallback(() => {
    const initialV = touchVelocity.current

    if (Math.abs(initialV) < MIN_VELOCITY) {
      scrollY.set(clampScroll(scrollY.get()))
      return
    }

    let v = initialV
    let lastTime = performance.now()
    stopScrollAnimation()

    const step = () => {
      const now = performance.now()
      const dt = now - lastTime
      lastTime = now

      // Velocity decays exponentially with friction
      v *= Math.exp(-MOMENTUM_FRICTION * dt)

      const current = scrollY.get()
      const next = applyRubberband(current + v * dt)
      const bounds = getScrollBounds()
      const isOverscrolled = bounds ? next < bounds.minScroll || next > bounds.maxScroll : false

      if (isOverscrolled) {
        v *= OVERSCROLL_DAMPING
      }

      scrollY.set(next)

      if (Math.abs(v) < MIN_VELOCITY) {
        scrollY.set(clampScroll(scrollY.get()))
        momentumRafIdRef.current = null
        return
      }

      momentumRafIdRef.current = requestAnimationFrame(step)
    }

    momentumRafIdRef.current = requestAnimationFrame(step)
  }, [applyRubberband, clampScroll, getScrollBounds, scrollY, stopScrollAnimation])

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

      stopScrollAnimation()
      handleUserScroll()
    },
    [handleUserScroll, stopScrollAnimation],
  )

  const handleTouchMove = useCallback(
    (currentY: number, event: Pick<TouchEvent, "cancelable" | "preventDefault">) => {
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
        const smoothed = touchVelocity.current * (1 - VELOCITY_SMOOTHING) + v * VELOCITY_SMOOTHING
        touchVelocity.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, smoothed))
      }

      const bounds = getScrollBounds()
      const minScroll = bounds?.minScroll ?? initialScrollValue.current
      const currentScroll = scrollY.get()
      const nextRaw = currentScroll + dy
      const isAtTop = currentScroll <= minScroll + 0.5
      const isPullingDown = dy < 0
      const isRubberbanding = nextRaw < minScroll
      const allowNativePullToRefresh = isPullingDown && isAtTop && isRubberbanding

      if (!allowNativePullToRefresh && event.cancelable) {
        event.preventDefault()
      }

      updateScrollY(prev => applyRubberband(prev + dy))
    },
    [applyRubberband, getScrollBounds, scrollY, updateScrollY],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY
      if (currentY === undefined) return
      handleTouchMove(currentY, event)
    }

    container.addEventListener("touchmove", handleMove, { passive: false })
    return () => {
      container.removeEventListener("touchmove", handleMove)
    }
  }, [handleTouchMove])

  // Start momentum scroll when touch ends
  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null
    touchLastY.current = null
    touchLastTime.current = null
    scheduleManualIndicatorHide(SCROLL_INDICATOR_TIMEOUT_TOUCH)
    startMomentumScroll()
  }, [scheduleManualIndicatorHide, startMomentumScroll])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (manualIndicatorTimeoutRef.current) {
        clearTimeout(manualIndicatorTimeoutRef.current)
      }
      if (momentumRafIdRef.current !== null) {
        cancelAnimationFrame(momentumRafIdRef.current)
      }
      if (scrollAnimationRef.current) {
        scrollAnimationRef.current.stop()
        scrollAnimationRef.current = null
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
    if (
      focused &&
      focused.tagName === "BUTTON" &&
      lineRefs.current.includes(focused as HTMLButtonElement)
    ) {
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
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-label="Lyrics display"
    >
      {/* Manual scroll indicator */}
      {showManualScrollIndicator && (
        <div className="absolute top-4 right-4 z-30 px-3 py-1 bg-neutral-800/80 rounded-full text-sm text-neutral-400">
          Manual scroll
        </div>
      )}

      <motion.div
        ref={contentRef}
        className="pt-[50vh] pb-[25vh] max-w-4xl mx-auto"
        style={{ y: scrollYOffset }}
      >
        {lyrics.lines.map((line, index) => {
          const isActive = index === activeLineIndex
          const isNext = index === activeLineIndex + 1
          const duration = isActive
            ? (lyrics.lines[index + 1]?.startTime ?? lyrics.duration) - line.startTime
            : undefined
          const chordData = lineChordData.get(index)
          // Calculate elapsed time within the current line for word-level sync
          const elapsedInLine = isActive ? Math.max(0, currentTime - line.startTime) : undefined

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
              lineStartTime={line.startTime}
              wordTimings={line.words}
              elapsedInLine={elapsedInLine}
              {...(duration !== undefined && { duration })}
            />
          )
        })}
      </motion.div>
    </div>
  )
}
