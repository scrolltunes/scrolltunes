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

const MIN_LINES = 4
const MAX_LINES = 10
const LINE_HEIGHT_MULTIPLIER = 1.8
const VERTICAL_PADDING = 100

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

    calculateLinesPerPage()

    const observer = new ResizeObserver(() => calculateLinesPerPage())
    observer.observe(container)

    return () => observer.disconnect()
  }, [containerRef, fontSize, totalLines])

  return { linesPerPage }
}
