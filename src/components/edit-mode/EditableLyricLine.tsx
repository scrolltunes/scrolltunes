"use client"

import { type LyricLine, songEditsStore } from "@/core"
import type { LinePatch, SectionType } from "@/lib/song-edits"
import { Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useState } from "react"
import { useEditMode } from "./EditModeProvider"

interface EditableLyricLineProps {
  readonly line: LyricLine
  readonly lineIndex: number
  readonly linePatch: LinePatch | undefined
  readonly allLineIds: readonly string[]
  readonly sectionMarker: { type: SectionType; label?: string } | null
}

const SECTION_LABELS: Record<SectionType, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  "pre-chorus": "Pre-Chorus",
  intro: "Intro",
  outro: "Outro",
  instrumental: "Instrumental",
  custom: "Section",
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function EditableLyricLine({
  line,
  lineIndex,
  linePatch,
  allLineIds,
  sectionMarker,
}: EditableLyricLineProps) {
  const { isSelected, toggleLine } = useEditMode()
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState("")

  const selected = isSelected(line.id)
  const isSkipped = linePatch?.action === "skip" && linePatch.skipped
  const isModified = linePatch?.action === "modify" && linePatch.customText !== undefined
  const displayText = isModified ? linePatch.customText : line.text
  const isEmptyLine = line.text.trim() === ""

  const handleToggle = useCallback(() => {
    if (isEditing) return
    toggleLine(line.id)
  }, [isEditing, line.id, toggleLine])

  const handleDoubleClick = useCallback(() => {
    if (isEmptyLine) return
    setEditText(displayText ?? "")
    setIsEditing(true)
  }, [displayText, isEmptyLine])

  const handleBlur = useCallback(() => {
    if (editText !== line.text) {
      songEditsStore.modifyLineText(lineIndex, editText)
    }
    setIsEditing(false)
  }, [editText, lineIndex, line.text])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleBlur()
      } else if (e.key === "Escape") {
        setEditText(line.text)
        setIsEditing(false)
      }
    },
    [handleBlur, line.text],
  )

  // Empty lines (instrumental sections)
  if (isEmptyLine) {
    return (
      <motion.div
        className={`
          relative flex items-center gap-3 px-3 py-2 rounded-lg
          transition-all duration-150
          ${selected ? "bg-indigo-600/20" : "hover:bg-neutral-800/50"}
          ${isSkipped ? "opacity-40" : ""}
        `}
        whileHover={{ x: 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {/* Timing */}
        <span className="w-12 text-xs font-mono text-neutral-500 shrink-0">
          {formatTime(line.startTime)}
        </span>

        {/* Checkbox */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
          style={{
            borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
            background: selected ? "var(--color-accent)" : "transparent",
          }}
          aria-label={selected ? "Deselect line" : "Select line"}
        >
          {selected && <Check size={12} weight="bold" className="text-white" />}
        </button>

        {/* Instrumental indicator */}
        <div
          className={`flex-1 flex items-center gap-2 text-neutral-500 italic ${isSkipped ? "line-through" : ""}`}
        >
          <span className="text-lg">♪</span>
          <span className="text-sm">Instrumental</span>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSkipped && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-amber-900/50 text-amber-400">
              Skip
            </span>
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="relative">
      {/* Section marker */}
      {sectionMarker && (
        <div className="absolute -top-5 left-[4.5rem] text-xs font-medium text-indigo-400 uppercase tracking-wider">
          {sectionMarker.type === "custom"
            ? (sectionMarker.label ?? "Section")
            : SECTION_LABELS[sectionMarker.type]}
        </div>
      )}

      <motion.div
        className={`
          relative flex items-center gap-3 px-3 py-2 rounded-lg
          transition-all duration-150
          ${selected ? "bg-indigo-600/20" : "hover:bg-neutral-800/50"}
          ${isSkipped ? "opacity-40" : ""}
        `}
        whileHover={{ x: 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {/* Timing */}
        <span className="w-12 text-xs font-mono text-neutral-500 shrink-0">
          {formatTime(line.startTime)}
        </span>

        {/* Checkbox */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
          style={{
            borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
            background: selected ? "var(--color-accent)" : "transparent",
          }}
          aria-label={selected ? "Deselect line" : "Select line"}
        >
          {selected && <Check size={12} weight="bold" className="text-white" />}
        </button>

        {/* Line content */}
        <div className="flex-1 min-w-0 cursor-pointer" onDoubleClick={handleDoubleClick}>
          {isEditing ? (
            <input
              ref={el => el?.focus()}
              type="text"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full bg-neutral-800 text-white px-2 py-1 rounded
                border border-neutral-600 focus:border-indigo-500 focus:outline-none"
            />
          ) : (
            <span
              className={`
                text-lg leading-relaxed
                ${isSkipped ? "line-through text-neutral-500" : "text-white"}
                ${isModified ? "text-emerald-300" : ""}
              `}
            >
              {displayText}
            </span>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSkipped && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-amber-900/50 text-amber-400">
              Skip
            </span>
          )}
          {isModified && !isSkipped && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-emerald-900/50 text-emerald-400">
              Edited
            </span>
          )}
        </div>
      </motion.div>
    </div>
  )
}
