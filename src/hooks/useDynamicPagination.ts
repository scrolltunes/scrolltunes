"use client"

import { type RefObject, useLayoutEffect, useState } from "react"

export interface UseDynamicPaginationOptions {
  readonly contentRef: RefObject<HTMLElement | null>
  readonly fontSize: number
  readonly totalLines: number
}

export interface UseDynamicPaginationResult {
  readonly linesPerPage: number
  readonly debugHeight: number
}

const MIN_LINES = 3
const MAX_LINES = 10
// Content area padding: pt-16 (64px) + pb-20 (80px)
const CONTENT_PADDING = 144
// Mobile breakpoint (matches typical phone width)
const MOBILE_BREAKPOINT = 640

// Mobile: more conservative due to text wrapping on narrow screens
const MOBILE_LINE_HEIGHT_MULTIPLIER = 1.8
const MOBILE_FIXED_SPACING = 35

// Desktop: tighter spacing, less text wrapping
const DESKTOP_LINE_HEIGHT_MULTIPLIER = 1.3
const DESKTOP_FIXED_SPACING = 22

export function useDynamicPagination(
  options: UseDynamicPaginationOptions,
): UseDynamicPaginationResult {
  const { contentRef, fontSize, totalLines } = options
  const [linesPerPage, setLinesPerPage] = useState(6)
  const [debugHeight, setDebugHeight] = useState(0)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || totalLines === 0) return

    function calculateLinesPerPage() {
      const contentElement = contentRef.current
      if (!contentElement) return

      // Measure container height and subtract content area padding
      const availableHeight = contentElement.clientHeight - CONTENT_PADDING
      
      // Use different line height calculation based on screen width
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT
      const multiplier = isMobile ? MOBILE_LINE_HEIGHT_MULTIPLIER : DESKTOP_LINE_HEIGHT_MULTIPLIER
      const fixedSpacing = isMobile ? MOBILE_FIXED_SPACING : DESKTOP_FIXED_SPACING
      const lineHeight = fontSize * multiplier + fixedSpacing
      
      const calculatedLines = Math.floor(availableHeight / lineHeight)
      const clampedLines = Math.max(MIN_LINES, Math.min(calculatedLines, MAX_LINES))

      setDebugHeight(contentElement.clientHeight)
      setLinesPerPage(clampedLines)
    }

    // Defer initial calculation to next frame to ensure layout is complete
    const frameId = requestAnimationFrame(() => {
      calculateLinesPerPage()
    })

    const observer = new ResizeObserver(() => calculateLinesPerPage())
    observer.observe(content)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [contentRef, fontSize, totalLines])

  return { linesPerPage, debugHeight }
}
