"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { motion, useMotionValue, useSpring, type MotionValue } from "motion/react"
import { usePlayerState, useCurrentLineIndex, usePlayerControls } from "@/core"
import { LyricLine } from "./LyricLine"
import { springs } from "@/animations"

const LINE_HEIGHT = 64 // Approximate height of each line in pixels
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
  const containerRef = useRef<HTMLDivElement>(null)
  const state = usePlayerState()
  const currentLineIndex = useCurrentLineIndex()
  const { jumpToLine } = usePlayerControls()

  // Manual scroll override state
  const [isManualScrolling, setIsManualScrolling] = useState(false)
  const manualScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Motion values for smooth scrolling
  const scrollY = useMotionValue(0)
  const smoothScrollY = useSpring(scrollY, {
    stiffness: springs.scroll.stiffness,
    damping: springs.scroll.damping,
    mass: springs.scroll.mass,
  })

  // Get lyrics from state
  const lyrics = state._tag !== "Idle" ? state.lyrics : null

  // Calculate target scroll position based on current line
  const getTargetScrollY = useCallback((lineIndex: number): number => {
    if (!containerRef.current) return 0
    const containerHeight = containerRef.current.clientHeight
    const targetY = lineIndex * LINE_HEIGHT - containerHeight / 2 + LINE_HEIGHT / 2
    return Math.max(0, targetY)
  }, [])

  // Update scroll position when current line changes (if not manually scrolling)
  useEffect(() => {
    if (isManualScrolling || !lyrics) return
    const targetY = getTargetScrollY(currentLineIndex)
    scrollY.set(targetY)
  }, [currentLineIndex, isManualScrolling, lyrics, scrollY, getTargetScrollY])

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
      // Manually adjust scroll position
      scrollY.set(scrollY.get() + e.deltaY)
    },
    [handleUserScroll, scrollY],
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
      scrollY.set(scrollY.get() + deltaY)
    },
    [scrollY],
  )

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

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden h-full ${className}`}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      role="region"
      aria-label="Lyrics display"
      aria-live="polite"
    >
      {/* Manual scroll indicator */}
      {isManualScrolling && (
        <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-neutral-800/80 rounded-full text-sm text-neutral-400">
          Manual scroll
        </div>
      )}

      <motion.div
        className="py-[50vh]"
        style={{
          y: smoothScrollY as unknown as MotionValue<number>,
          transform: "translateY(calc(var(--motion-translateY) * -1))",
        }}
      >
        {lyrics.lines.map((line, index) => (
          <LyricLine
            key={line.id}
            text={line.text}
            isActive={index === currentLineIndex}
            isPast={index < currentLineIndex}
            onClick={() => handleLineClick(index)}
            index={index}
          />
        ))}
      </motion.div>
    </div>
  )
}
