"use client"

import { memo } from "react"

export interface PageIndicatorProps {
  readonly currentPage: number
  readonly totalPages: number
  readonly className?: string
}

/**
 * Display current page number and total pages for Score Book mode
 *
 * Positioned absolute top-right with subtle styling
 */
export const PageIndicator = memo(function PageIndicator({
  currentPage,
  totalPages,
  className = "",
}: PageIndicatorProps) {
  return (
    <div
      className={`absolute top-4 right-4 text-sm font-medium ${className}`}
      style={{ color: "var(--color-text-muted)" }}
      aria-label={`Page ${currentPage} of ${totalPages}`}
      aria-live="polite"
    >
      Page {currentPage} of {totalPages}
    </div>
  )
})
