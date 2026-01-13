"use client"

import type { LyricLine as LyricLineType } from "@/core"
import type { LyricChordPosition } from "@/lib/chords"
import { ArrowBendDownRight } from "@phosphor-icons/react"

import { memo } from "react"
import { StaticLyricLine } from "./StaticLyricLine"

/**
 * Position of a line relative to the current line
 */
type LinePosition = "past-far" | "past-near" | "current" | "next" | "upcoming"

/**
 * Get line position relative to current line index
 */
function getLinePosition(
  lineIndex: number,
  currentLineIndex: number,
  pageStartIndex: number,
): LinePosition {
  const relativeIndex = lineIndex - currentLineIndex

  if (relativeIndex < -2) return "past-far"
  if (relativeIndex < 0) return "past-near"
  if (relativeIndex === 0) return "current"
  if (relativeIndex === 1) return "next"
  return "upcoming"
}

/**
 * Chord data for a single line
 */
interface LineChordData {
  readonly chords?: readonly string[]
  readonly chordPositions?: readonly LyricChordPosition[]
}

export interface ScoreBookPageProps {
  /**
   * Lines to render on this page
   */
  readonly lines: readonly LyricLineType[]
  /**
   * Index of the currently active line (global, not page-relative)
   */
  readonly currentLineIndex: number
  /**
   * Index of the first line on this page (global)
   */
  readonly pageStartIndex: number
  /**
   * Font size for lyrics
   */
  readonly fontSize: number
  /**
   * Whether to show chords
   */
  readonly showChords: boolean
  /**
   * Callback when a line is clicked
   */
  readonly onLineClick?: (index: number) => void
  /**
   * Map of line index to chord data
   */
  readonly lineChordData?: ReadonlyMap<number, LineChordData>
  /**
   * Whether text is right-to-left
   */
  readonly isRTL?: boolean
  /**
   * Preview line from next page (shown faded at bottom)
   */
  readonly previewLine?: LyricLineType
  /**
   * Global index of the preview line
   */
  readonly previewLineIndex?: number
}

/**
 * Render a single page of lyric lines with position-based styling
 *
 * Styling per spec:
 * - Past (>2 lines): 30% opacity
 * - Past (1-2 lines): 40% opacity
 * - Current: 100% opacity, left border accent, font-weight 600
 * - Next: 85% opacity, slight indent, font-weight 500
 * - Upcoming: 50% opacity
 */
export const ScoreBookPage = memo(function ScoreBookPage({
  lines,
  currentLineIndex,
  pageStartIndex,
  fontSize,
  showChords,
  onLineClick,
  lineChordData,
  isRTL = false,
  previewLine,
  previewLineIndex,
}: ScoreBookPageProps) {
  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {lines.map((line, i) => {
        const globalIndex = pageStartIndex + i
        const position = getLinePosition(globalIndex, currentLineIndex, pageStartIndex)

        const isActive = position === "current"
        const isPast = position === "past-far" || position === "past-near"
        const isNext = position === "next"

        // Get chord data for this line
        const chordData = showChords ? lineChordData?.get(globalIndex) : undefined

        return (
          <div key={line.id}>
            <StaticLyricLine
              text={line.text}
              isActive={isActive}
              isPast={isPast}
              isNext={isNext}
              index={globalIndex}
              fontSize={fontSize}
              isRTL={isRTL}
              {...(chordData?.chords && { chords: chordData.chords })}
              {...(chordData?.chordPositions && { chordPositions: chordData.chordPositions })}
              {...(onLineClick && { onClick: () => onLineClick(globalIndex) })}
            />
          </div>
        )
      })}

      {/* Preview of next page's first line */}
      {previewLine && (
        <div
          className="relative mt-3 opacity-30"
          style={{
            maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
          }}
        >
          <div className="flex items-center justify-center gap-1">
            <ArrowBendDownRight
              size={14}
              weight="regular"
              className="shrink-0"
              style={{ color: "var(--color-text3)" }}
            />
            <span
              className="truncate"
              style={{
                fontSize: `${Math.round(fontSize * 0.7)}px`,
                color: "var(--color-text3)",
              }}
            >
              {previewLine.text}
            </span>
          </div>
        </div>
      )}
    </div>
  )
})
