"use client"

import { type LyricLine, songEditsStore, useEditPayload } from "@/core"
import type { LinePatch, SectionType } from "@/lib/song-edits"
import { useCallback, useEffect, useMemo } from "react"
import { useEditMode } from "./EditModeProvider"
import { EditableLyricLine } from "./EditableLyricLine"

interface EditableLyricsDisplayProps {
  readonly lines: readonly LyricLine[]
  readonly className?: string
}

export function EditableLyricsDisplay({ lines, className = "" }: EditableLyricsDisplayProps) {
  const { clearSelection, skipSelected, unskipSelected, selectAll } = useEditMode()
  const payload = useEditPayload()

  const allLineIds = useMemo(() => lines.map(l => l.id), [lines])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key.toLowerCase()) {
        case "s":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            skipSelected(allLineIds)
          } else {
            // Ctrl+S = Save
            e.preventDefault()
            songEditsStore.saveEdits()
          }
          break

        case "u":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            unskipSelected(allLineIds)
          }
          break

        case "a":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            selectAll(allLineIds)
          }
          break

        case "escape":
          e.preventDefault()
          clearSelection()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [allLineIds, skipSelected, unskipSelected, selectAll, clearSelection])

  // Get section marker for a line by index
  const getSectionMarker = useCallback(
    (lineIndex: number): { type: SectionType; label?: string } | null => {
      return songEditsStore.getSectionMarker(lineIndex)
    },
    [payload], // Re-compute when payload changes
  )

  // Get line patch for a line by index
  const getLinePatch = useCallback(
    (lineIndex: number): LinePatch | undefined => {
      return songEditsStore.getLinePatch(lineIndex)
    },
    [payload], // Re-compute when payload changes
  )

  return (
    <div className={`space-y-1 pb-32 ${className}`}>
      {lines.map((line, index) => (
        <EditableLyricLine
          key={line.id}
          line={line}
          lineIndex={index}
          linePatch={getLinePatch(index)}
          allLineIds={allLineIds}
          sectionMarker={getSectionMarker(index)}
        />
      ))}

      {/* Empty state */}
      {lines.length === 0 && (
        <div className="text-center text-neutral-500 py-12">No lyrics to edit</div>
      )}
    </div>
  )
}
