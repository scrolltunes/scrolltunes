"use client"

import { memo, useMemo } from "react"

export interface PageIndicatorProps {
  readonly currentPage: number
  readonly totalPages: number
  readonly className?: string
  readonly onPageClick?: (page: number) => void
  readonly isRTL?: boolean
}

/**
 * Minimal dot-based page indicator for Score Book mode
 *
 * - Shows small dots for each page
 * - Current page highlighted with accent color
 * - Collapses to ellipsis for many pages
 * - Tappable for direct page navigation
 */
export const PageIndicator = memo(function PageIndicator({
  currentPage,
  totalPages,
  className = "",
  onPageClick,
  isRTL = false,
}: PageIndicatorProps) {
  // For 1-page songs, show nothing
  if (totalPages <= 1) return null

  // Build dot indices, collapsing middle pages if too many
  const maxDots = 7
  const dots = useMemo(() => {
    if (totalPages <= maxDots) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    // Show first, last, and pages around current
    const result: (number | "ellipsis")[] = []
    const current = currentPage

    if (current <= 3) {
      // Near start: show first 4, ellipsis, last
      for (let i = 1; i <= Math.min(4, totalPages); i++) result.push(i)
      if (totalPages > 4) {
        result.push("ellipsis")
        result.push(totalPages)
      }
    } else if (current >= totalPages - 2) {
      // Near end: show first, ellipsis, last 4
      result.push(1)
      result.push("ellipsis")
      for (let i = Math.max(1, totalPages - 3); i <= totalPages; i++) result.push(i)
    } else {
      // Middle: show first, ellipsis, current-1/current/current+1, ellipsis, last
      result.push(1)
      result.push("ellipsis")
      for (let i = current - 1; i <= current + 1; i++) result.push(i)
      result.push("ellipsis")
      result.push(totalPages)
    }
    return result
  }, [totalPages, currentPage])

  return (
    <div
      className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} flex items-center gap-1.5 ${
        isRTL ? "flex-row-reverse" : ""
      } ${className}`}
      aria-label={`Page ${currentPage} of ${totalPages}`}
      aria-live="polite"
    >
      {dots.map((item, i) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            className="text-xs px-0.5"
            style={{ color: "var(--color-text-ghost)" }}
            aria-hidden="true"
          >
            ·
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageClick?.(item)}
            disabled={!onPageClick}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
              onPageClick ? "cursor-pointer hover:scale-125" : "cursor-default"
            }`}
            style={{
              background:
                item === currentPage
                  ? "var(--color-accent)"
                  : item < currentPage
                    ? "var(--color-text-muted)"
                    : "var(--color-text-ghost)",
              opacity: item === currentPage ? 1 : 0.6,
            }}
            aria-label={`Go to page ${item}`}
            aria-current={item === currentPage ? "page" : undefined}
          />
        ),
      )}
    </div>
  )
})
