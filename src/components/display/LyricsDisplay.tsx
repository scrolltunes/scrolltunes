"use client"

import { useCurrentLineIndex, usePlayerControls, usePlayerState, usePreferences } from "@/core"
import { detectLyricsDirection } from "@/lib"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LyricLine } from "./LyricLine"

const SCROLL_OVERRIDE_TIMEOUT = 3000 // Resume auto-scroll after 3 seconds

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

  // Manual scroll override state
  const [isManualScrolling, setIsManualScrolling] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const manualScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs for geometry-based scroll calculation
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null

  // Detect RTL direction once per song
  const isRTL = useMemo(
    () => (lyrics ? detectLyricsDirection(lyrics.lines) === "rtl" : false),
    [lyrics],
  )

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

    const lineIndex = Math.max(0, currentLineIndex)

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
      setScrollY(prev => prev + e.deltaY)
    },
    [handleUserScroll],
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

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const currentY = e.touches[0]?.clientY ?? 0
    const deltaY = touchStartY.current - currentY
    touchStartY.current = currentY
    setScrollY(prev => prev + deltaY)
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
  const isPlayingOrPaused = state._tag === "Playing" || state._tag === "Paused"
  const activeLineIndex = isPlayingOrPaused ? Math.max(0, currentLineIndex) : -1

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden h-full ${className}`}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      aria-label="Lyrics display"
    >
      {/* Manual scroll indicator */}
      {isManualScrolling && (
        <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-neutral-800/80 rounded-full text-sm text-neutral-400">
          Manual scroll
        </div>
      )}

      <motion.div
        className="py-[50vh] max-w-4xl mx-auto"
        animate={{ y: -scrollY }}
        transition={{ type: "tween", duration: 0.5, ease: "easeOut" }}
      >
        {lyrics.lines.map((line, index) => {
          const isActive = index === activeLineIndex
          const duration = isActive
            ? (lyrics.lines[index + 1]?.startTime ?? lyrics.duration) - line.startTime
            : undefined

          return (
            <LyricLine
              key={line.id}
              text={line.text}
              isActive={isActive}
              isPast={index < activeLineIndex}
              onClick={() => handleLineClick(index)}
              index={index}
              fontSize={fontSize}
              innerRef={el => {
                lineRefs.current[index] = el
              }}
              isRTL={isRTL}
              {...(duration !== undefined && { duration })}
            />
          )
        })}
      </motion.div>
    </div>
  )
}
