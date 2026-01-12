"use client"

import { type RefObject, useLayoutEffect, useState } from "react"

export interface UseDynamicPaginationOptions {
  readonly containerRef: RefObject<HTMLElement | null>
  readonly fontSize: number
  readonly totalLines: number
}

export interface UseDynamicPaginationResult {
  readonly linesPerPage: number
}

const MIN_LINES = 3
const MAX_LINES = 10
const LINE_HEIGHT_MULTIPLIER = 1.8
// Accounts for: internal padding of animated container (pt-16 pb-20 = 144px)
const VERTICAL_PADDING = 150

export function useDynamicPagination(
  options: UseDynamicPaginationOptions,
): UseDynamicPaginationResult {
  const { containerRef, fontSize, totalLines } = options
  const [linesPerPage, setLinesPerPage] = useState(6)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || totalLines === 0) return

    function calculateLinesPerPage() {
      const containerElement = containerRef.current
      if (!containerElement) return

      const availableHeight = containerElement.clientHeight - VERTICAL_PADDING
      const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER
      const calculatedLines = Math.floor(availableHeight / lineHeight)
      const clampedLines = Math.max(MIN_LINES, Math.min(calculatedLines, MAX_LINES))

      setLinesPerPage(clampedLines)
    }

    // Defer initial calculation to next frame to ensure layout is complete
    const frameId = requestAnimationFrame(() => {
      calculateLinesPerPage()
    })

    const observer = new ResizeObserver(() => calculateLinesPerPage())
    observer.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [containerRef, fontSize, totalLines])

  return { linesPerPage }
}
