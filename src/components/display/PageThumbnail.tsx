"use client"

import type { LyricLine } from "@/core"

import { memo } from "react"

export interface PageThumbnailProps {
  /**
   * The page index (0-based)
   */
  readonly pageIndex: number
  /**
   * Lines to display in this thumbnail
   */
  readonly lines: readonly LyricLine[]
  /**
   * Whether this is the currently active page
   */
  readonly isCurrentPage: boolean
  /**
   * Index of the currently active line (global, for highlighting within page)
   */
  readonly currentLineIndex: number
  /**
   * Index of the first line on this page (global)
   */
  readonly pageStartIndex: number
  /**
   * Callback when thumbnail is clicked
   */
  readonly onClick: () => void
}

/**
 * Miniature page preview for the page strip navigation
 *
 * Features:
 * - 4:3 aspect ratio container (~150px width)
 * - Scaled-down text (CSS transform: scale(0.25)) with overflow hidden
 * - Current page: accent border + subtle glow
 * - Non-current: surface1 background, muted border
 * - Hover: slight scale up, brighter border
 * - Page number badge in corner
 */
export const PageThumbnail = memo(function PageThumbnail({
  pageIndex,
  lines,
  isCurrentPage,
  currentLineIndex,
  pageStartIndex,
  onClick,
}: PageThumbnailProps) {
  const pageNumber = pageIndex + 1

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={isCurrentPage ? "page" : undefined}
      className={`
        relative flex-shrink-0 w-[150px] rounded-lg overflow-hidden
        transition-all duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        ${isCurrentPage ? "scale-100" : "hover:scale-105 hover:brightness-110"}
      `}
      style={{
        aspectRatio: "4 / 3",
        backgroundColor: "var(--color-surface1)",
        border: isCurrentPage
          ? "2px solid var(--color-accent)"
          : "1px solid var(--color-border-muted)",
        boxShadow: isCurrentPage ? "0 0 12px rgba(91, 108, 255, 0.3)" : "none",
      }}
    >
      {/* Scaled content container */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transformOrigin: "top left",
          transform: "scale(0.25)",
          width: "400%",
          height: "400%",
        }}
      >
        <div className="flex flex-col gap-1 p-4">
          {lines.map((line, i) => {
            const globalIndex = pageStartIndex + i
            const isActiveLine = globalIndex === currentLineIndex && isCurrentPage

            return (
              <div
                key={line.id}
                className={`
                  text-sm leading-relaxed truncate
                  ${isActiveLine ? "font-semibold" : "font-normal"}
                `}
                style={{
                  color: isActiveLine ? "var(--color-accent)" : "var(--color-text-muted)",
                }}
              >
                {line.text || "\u00A0"}
              </div>
            )
          })}
        </div>
      </div>

      {/* Page number badge */}
      <div
        className="absolute top-1 right-1 px-1.5 py-0.5 text-xs font-medium rounded"
        style={{
          backgroundColor: isCurrentPage ? "var(--color-accent)" : "var(--color-surface2)",
          color: isCurrentPage ? "var(--color-text-inverse)" : "var(--color-text-muted)",
        }}
      >
        {pageNumber}
      </div>
    </button>
  )
})
