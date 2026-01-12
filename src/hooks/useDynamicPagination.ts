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
// Text line height multiplier (typical readable text)
const TEXT_LINE_HEIGHT = 1.5
// Fixed spacing per line: gap-2 (8px) + padding + highlight box margins
const FIXED_LINE_SPACING = 38
// Content area padding: pt-16 (64px) + pb-20 (80px)
const CONTENT_PADDING = 144

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
      // Line height = proportional text height + fixed spacing
      const lineHeight = fontSize * TEXT_LINE_HEIGHT + FIXED_LINE_SPACING
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
