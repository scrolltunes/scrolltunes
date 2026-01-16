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

const MANUAL_MODE_TIMEOUT = 6000 // Resume auto-scroll after 6s of no interaction
const SCROLL_INDICATOR_TIMEOUT_TOUCH = 3000 // Hide manual scroll badge after touch scroll
const SCROLL_INDICATOR_TIMEOUT_WHEEL = 6000 // Hide manual scroll badge after wheel scroll
const MOMENTUM_FRICTION = 0.0022 // Velocity decay rate (higher = faster stop)
const MIN_VELOCITY = 0.01 // Minimum velocity to continue momentum (pixels/ms)
const MAX_VELOCITY = 4 // Maximum velocity clamp (pixels/ms)
const VELOCITY_SMOOTHING = 0.2 // Smooths touch velocity for natural fling
const RUBBERBAND_COEFFICIENT = 0.55
const OVERSCROLL_DAMPING = 0.6
const PTR_DEAD_ZONE = 10 // Minimum downward movement before declaring pull-to-refresh

type ScrollMode = "auto" | "manual"

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
  readonly onCreateCard?: (selectedIds: readonly string[]) => void
}

/**
 * Main lyrics display with auto-scrolling and manual override
 *
 * Uses Motion transforms for GPU-accelerated scrolling.
 * Detects manual scroll/touch and temporarily disables auto-scroll.
 */
export function LyricsDisplay({
  className = "",
  chordEnhancement,
  onCreateCard,
}: LyricsDisplayProps) {
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

  // Scroll mode state machine: auto follows current line, manual lets user scroll freely
  const [scrollMode, setScrollMode] = useState<ScrollMode>("auto")
  const [showManualScrollIndicator, setShowManualScrollIndicator] = useState(false)
  const lastManualInteractionRef = useRef<number | null>(null)
  const manualModeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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
    // Standard scroll limit: contentHeight - containerHeight (content bottom at screen bottom)
    // Subtract extra to keep the last line visible higher up on screen
    // The content has 35vh bottom padding, so the last text line is already above the bottom
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

      // Target position: 15% from container top for comfortable reading
      const targetY = containerRect.height * 0.15

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

      // Target position: 15% from container top
      const targetY = containerHeight * 0.15

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
    setScrollMode("auto")
    setShowManualScrollIndicator(false)
  }, [songId, setScrollYImmediate])

  // Only auto-scroll when playing AND in auto mode
  const isPlaying = state._tag === "Playing"
  const isAutoScrollEnabled = isPlaying && scrollMode === "auto"

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
      setScrollMode("auto")
      setShowManualScrollIndicator(false)
    }
    prevResetCount.current = resetCount
  }, [resetCount, lyrics, getInitialScrollTarget, setScrollYImmediate])

  // Clear manual scroll when transitioning to Playing
  const prevStateTag = useRef(state._tag)
  useEffect(() => {
    if (prevStateTag.current !== "Playing" && state._tag === "Playing") {
      setScrollMode("auto")
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

  // Enter manual scroll mode and reset the timeout
  const enterManualMode = useCallback(() => {
    setScrollMode("manual")
    setShowManualScrollIndicator(true)
    lastManualInteractionRef.current = performance.now()

    // Clear any existing timeout
    if (manualModeTimeoutRef.current) {
      clearTimeout(manualModeTimeoutRef.current)
    }

    // Schedule return to auto mode after timeout
    manualModeTimeoutRef.current = setTimeout(() => {
      setScrollMode("auto")
      setShowManualScrollIndicator(false)
    }, MANUAL_MODE_TIMEOUT)
  }, [])

  // Mark an interaction to keep manual mode alive
  const markManualInteraction = useCallback(() => {
    lastManualInteractionRef.current = performance.now()

    // Reset the timeout
    if (manualModeTimeoutRef.current) {
      clearTimeout(manualModeTimeoutRef.current)
    }
    manualModeTimeoutRef.current = setTimeout(() => {
      setScrollMode("auto")
      setShowManualScrollIndicator(false)
    }, MANUAL_MODE_TIMEOUT)
  }, [])

  const scheduleManualIndicatorHide = useCallback((delayMs: number) => {
    if (manualIndicatorTimeoutRef.current) {
      clearTimeout(manualIndicatorTimeoutRef.current)
    }
    manualIndicatorTimeoutRef.current = setTimeout(() => {
      setShowManualScrollIndicator(false)
    }, delayMs)
  }, [])

  // Handle wheel events
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault()
      }
      stopScrollAnimation()

      if (scrollMode === "auto") {
        enterManualMode()
      } else {
        markManualInteraction()
      }

      scheduleManualIndicatorHide(SCROLL_INDICATOR_TIMEOUT_WHEEL)
      updateScrollY(prev => clampScroll(prev + e.deltaY))
    },
    [
      scrollMode,
      enterManualMode,
      markManualInteraction,
      clampScroll,
      scheduleManualIndicatorHide,
      stopScrollAnimation,
      updateScrollY,
    ],
  )

  // Handle touch events for mobile with velocity-based momentum
  // Uses document-level listeners during gesture to prevent browser scroll takeover
  const activeTouchIdRef = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchLastY = useRef<number | null>(null)
  const touchLastTime = useRef<number | null>(null)
  const touchVelocity = useRef<number>(0)
  const hasDecidedGestureRef = useRef<boolean>(false)
  const isPullToRefreshRef = useRef<boolean>(false)
  const totalDyRef = useRef<number>(0)
  const gestureCleanupRef = useRef<(() => void) | null>(null)
  const hasEnteredManualForGestureRef = useRef<boolean>(false)
  const wasAtTopOnTouchStartRef = useRef<boolean>(false)

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

      // Keep marking interaction during momentum to prevent timeout
      markManualInteraction()

      if (Math.abs(v) < MIN_VELOCITY) {
        scrollY.set(clampScroll(scrollY.get()))
        momentumRafIdRef.current = null
        return
      }

      momentumRafIdRef.current = requestAnimationFrame(step)
    }

    momentumRafIdRef.current = requestAnimationFrame(step)
  }, [
    applyRubberband,
    clampScroll,
    getScrollBounds,
    markManualInteraction,
    scrollY,
    stopScrollAnimation,
  ])

  // Internal touch move handler
  const handleTouchMoveInternal = useCallback(
    (currentY: number, event: TouchEvent) => {
      if (
        touchStartY.current === null ||
        touchLastY.current === null ||
        touchLastTime.current === null
      )
        return

      const now = performance.now()
      const dy = touchLastY.current - currentY // positive dy = scroll down (finger up)
      const dt = now - touchLastTime.current

      touchLastY.current = currentY
      touchLastTime.current = now
      totalDyRef.current += dy

      // Decide once per gesture: pull-to-refresh or custom scroll
      if (!hasDecidedGestureRef.current) {
        const isPullingDown = totalDyRef.current < -PTR_DEAD_ZONE

        // Only allow PTR if we were already at top when touch started
        if (wasAtTopOnTouchStartRef.current && isPullingDown) {
          // Let browser handle pull-to-refresh - clean up our listeners
          isPullToRefreshRef.current = true
          hasDecidedGestureRef.current = true
          if (gestureCleanupRef.current) {
            gestureCleanupRef.current()
            gestureCleanupRef.current = null
          }
          return
        }

        // Once we've moved enough, decide this is custom scroll
        if (Math.abs(totalDyRef.current) > PTR_DEAD_ZONE) {
          isPullToRefreshRef.current = false
          hasDecidedGestureRef.current = true
          // NOW enter manual mode since we're taking control
          if (!hasEnteredManualForGestureRef.current) {
            hasEnteredManualForGestureRef.current = true
            if (scrollMode === "auto") {
              enterManualMode()
            }
          }
        }
      }

      // If this is a pull-to-refresh gesture, let browser handle it
      if (isPullToRefreshRef.current) {
        return
      }

      // Take full control: prevent default and update scroll
      if (event.cancelable) {
        event.preventDefault()
      }

      if (dt > 0) {
        // Calculate velocity (pixels per ms), clamped to avoid crazy spikes
        const v = dy / dt
        const smoothed = touchVelocity.current * (1 - VELOCITY_SMOOTHING) + v * VELOCITY_SMOOTHING
        touchVelocity.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, smoothed))
      }

      markManualInteraction()
      updateScrollY(prev => applyRubberband(prev + dy))
    },
    [
      applyRubberband,
      enterManualMode,
      getScrollBounds,
      markManualInteraction,
      scrollMode,
      scrollY,
      updateScrollY,
    ],
  )

  // Internal touch end handler
  const handleTouchEndInternal = useCallback(() => {
    touchStartY.current = null
    touchLastY.current = null
    touchLastTime.current = null
    activeTouchIdRef.current = null

    const wasPullToRefresh = isPullToRefreshRef.current

    // Reset gesture decision state
    hasDecidedGestureRef.current = false
    isPullToRefreshRef.current = false
    totalDyRef.current = 0
    hasEnteredManualForGestureRef.current = false
    gestureCleanupRef.current = null

    // Only run momentum if we owned the gesture (not pull-to-refresh)
    if (!wasPullToRefresh) {
      scheduleManualIndicatorHide(SCROLL_INDICATOR_TIMEOUT_TOUCH)
      startMomentumScroll()
    }
  }, [scheduleManualIndicatorHide, startMomentumScroll])

  // Touch start: set up gesture and attach document-level listeners
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return

      activeTouchIdRef.current = touch.identifier
      touchStartY.current = touch.clientY
      touchLastY.current = touch.clientY
      touchLastTime.current = performance.now()
      touchVelocity.current = 0
      hasDecidedGestureRef.current = false
      isPullToRefreshRef.current = false
      totalDyRef.current = 0
      hasEnteredManualForGestureRef.current = false

      // Cancel any running momentum FIRST before checking position
      const wasMomentumScrolling = momentumRafIdRef.current !== null
      if (momentumRafIdRef.current !== null) {
        cancelAnimationFrame(momentumRafIdRef.current)
        momentumRafIdRef.current = null
      }

      stopScrollAnimation()

      // Check if at top when touch starts - only allow PTR if already at top AND not interrupting momentum
      const bounds = getScrollBounds()
      const minScroll = bounds?.minScroll ?? initialScrollValue.current
      const isAtTop = scrollY.get() <= minScroll + 0.5
      wasAtTopOnTouchStartRef.current = isAtTop && !wasMomentumScrolling

      // Don't enter manual mode yet - wait until we decide this is custom scroll, not PTR

      // Attach global listeners for this gesture to capture moves outside container
      const handleMove = (event: TouchEvent) => {
        const t = Array.from(event.touches).find(t => t.identifier === activeTouchIdRef.current)
        if (!t) return
        handleTouchMoveInternal(t.clientY, event)
      }

      const handleEnd = (event: TouchEvent) => {
        const stillActive = Array.from(event.touches).some(
          t => t.identifier === activeTouchIdRef.current,
        )
        if (stillActive) return
        cleanup()
        handleTouchEndInternal()
      }

      const cleanup = () => {
        window.removeEventListener("touchmove", handleMove)
        window.removeEventListener("touchend", handleEnd)
        window.removeEventListener("touchcancel", handleEnd)
        gestureCleanupRef.current = null
      }

      // Store cleanup so we can call it if we decide this is PTR
      gestureCleanupRef.current = cleanup

      window.addEventListener("touchmove", handleMove, { passive: false })
      window.addEventListener("touchend", handleEnd)
      window.addEventListener("touchcancel", handleEnd)
    },
    [
      getScrollBounds,
      handleTouchEndInternal,
      handleTouchMoveInternal,
      scrollY,
      stopScrollAnimation,
    ],
  )

  // No-op handlers for React props (actual handling is via document listeners)
  const handleTouchEnd = useCallback(() => {
    // Handled by document-level listener
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (manualIndicatorTimeoutRef.current) {
        clearTimeout(manualIndicatorTimeoutRef.current)
      }
      if (manualModeTimeoutRef.current) {
        clearTimeout(manualModeTimeoutRef.current)
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
      setScrollMode("auto")
      setShowManualScrollIndicator(false)
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

  // Show highlight when playing/paused
  const isPlayingOrPaused = isPlaying || state._tag === "Paused"
  const activeIndex = isPlayingOrPaused ? Math.max(0, currentLineIndex) : -1

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
        <div className="fixed top-32 right-4 z-30 px-3 py-1 bg-[var(--color-surface2)] backdrop-blur-sm rounded-sm text-sm text-[var(--color-text-muted)]">
          Manual scroll
        </div>
      )}

      <motion.div
        ref={contentRef}
        className="pt-[15vh] pb-[25vh] max-w-4xl mx-auto"
        style={{ y: scrollYOffset }}
      >
        {lyrics.lines.map((line, index) => {
          const isActive = index === activeIndex
          const isNext = index === activeIndex + 1
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
              isPast={index < activeIndex}
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
