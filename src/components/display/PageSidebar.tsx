"use client"

import type { LyricLine } from "@/core"

import { memo, useEffect, useRef } from "react"
import { PageThumbnail } from "./PageThumbnail"

export interface PageSidebarProps {
  /**
   * Array of pages, where each page is an array of lyric lines
   */
  readonly pages: readonly (readonly LyricLine[])[]
  /**
   * Current page index (0-based)
   */
  readonly currentPage: number
  /**
   * Index of the currently active line (global)
   */
  readonly currentLineIndex: number
  /**
   * Callback when a page is selected
   */
  readonly onPageSelect: (pageIndex: number) => void
  /**
   * Lines per page (for calculating page start indices)
   */
  readonly linesPerPage: number
}

/**
 * Desktop-only sidebar showing page thumbnails for navigation
 *
 * Features:
 * - 180px fixed width, full height
 * - Hidden on mobile (lg:flex)
 * - Scrollable list with smooth scroll
 * - Auto-scrolls to keep current page visible
 * - Subtle header showing page count
 */
export const PageSidebar = memo(function PageSidebar({
  pages,
  currentPage,
  currentLineIndex,
  onPageSelect,
  linesPerPage,
}: PageSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const currentThumbnailRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to keep current page thumbnail visible
  useEffect(() => {
    if (currentThumbnailRef.current) {
      currentThumbnailRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [currentPage])

  const totalPages = pages.length

  return (
    <nav
      ref={scrollContainerRef}
      className="hidden lg:flex flex-col w-[180px] h-full overflow-y-auto"
      style={{
        backgroundColor: "var(--color-surface0)",
        scrollBehavior: "smooth",
      }}
      aria-label="Page navigation"
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 text-xs font-medium"
        style={{
          backgroundColor: "var(--color-surface0)",
          color: "var(--color-text-muted)",
          borderBottom: "1px solid var(--color-border-muted)",
        }}
      >
        Pages ({totalPages})
      </div>

      {/* Thumbnails list */}
      <div className="flex flex-col gap-3 p-4">
        {pages.map((lines, pageIndex) => {
          const isCurrentPage = pageIndex === currentPage
          const pageStartIndex = pageIndex * linesPerPage

          return (
            <div key={pageIndex} ref={isCurrentPage ? currentThumbnailRef : undefined}>
              <PageThumbnail
                pageIndex={pageIndex}
                lines={lines}
                isCurrentPage={isCurrentPage}
                currentLineIndex={currentLineIndex}
                pageStartIndex={pageStartIndex}
                onClick={() => onPageSelect(pageIndex)}
              />
            </div>
          )
        })}
      </div>
    </nav>
  )
})
