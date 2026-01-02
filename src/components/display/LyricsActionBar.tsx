"use client"

import { CheckSquare, ImageSquare, X } from "@phosphor-icons/react"
import { memo } from "react"

export interface LyricsActionBarProps {
  readonly isSelecting: boolean
  readonly selectedCount: number
  readonly onSelectClick: () => void
  readonly onCreateCardClick: () => void
  readonly onCancelClick: () => void
}

export const LyricsActionBar = memo(function LyricsActionBar({
  isSelecting,
  selectedCount,
  onSelectClick,
  onCreateCardClick,
  onCancelClick,
}: LyricsActionBarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-[env(safe-area-inset-bottom,16px)] pt-3"
      style={{ background: "var(--stage-surface1)" }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {isSelecting ? (
          <>
            <button
              type="button"
              onClick={onCancelClick}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-colors"
              style={{
                background: "var(--stage-surface2)",
                color: "var(--stage-text2)",
              }}
            >
              <X size={20} weight="bold" />
              <span className="text-sm font-medium">Cancel</span>
            </button>

            <span className="text-sm font-medium" style={{ color: "var(--stage-text2)" }}>
              {selectedCount} {selectedCount === 1 ? "line" : "lines"} selected
            </span>

            <button
              type="button"
              onClick={onCreateCardClick}
              disabled={!hasSelection}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-colors disabled:opacity-40"
              style={{
                background: hasSelection ? "var(--stage-accent)" : "var(--stage-surface2)",
                color: "var(--stage-text)",
              }}
            >
              <ImageSquare size={20} weight="fill" />
              <span className="text-sm font-medium">Create card</span>
            </button>
          </>
        ) : (
          <>
            <div />
            <button
              type="button"
              onClick={onSelectClick}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-colors"
              style={{
                background: "var(--stage-surface2)",
                color: "var(--stage-text2)",
              }}
            >
              <CheckSquare size={20} />
              <span className="text-sm font-medium">Select lyrics</span>
            </button>
            <div />
          </>
        )}
      </div>
    </div>
  )
})
