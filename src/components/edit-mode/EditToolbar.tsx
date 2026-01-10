"use client"

import { useEditPayload } from "@/core"
import { motion } from "motion/react"
import { useEditMode } from "./EditModeProvider"

interface EditToolbarProps {
  readonly allLineIds: readonly string[]
  readonly onExitEditMode?: () => void
}

export function EditToolbar({ allLineIds, onExitEditMode }: EditToolbarProps) {
  const {
    selectedCount,
    skipSelected,
    unskipSelected,
    isDirty,
    isSaving,
    saveEdits,
    revertEdits,
    exitEditMode,
    clearSelection,
    selectAll,
  } = useEditMode()

  const payload = useEditPayload()
  const skippedCount =
    payload?.linePatches.filter(p => p.action === "skip" && p.skipped).length ?? 0
  const modifiedCount =
    payload?.linePatches.filter(p => p.action === "modify" && p.customText).length ?? 0

  const handleSave = async () => {
    const success = await saveEdits()
    if (success) {
      clearSelection()
    }
  }

  const handleExit = () => {
    exitEditMode()
    onExitEditMode?.()
  }

  const handleRevert = () => {
    if (isDirty) {
      // Could add a confirmation dialog here
      revertEdits()
    }
  }

  const handleSkip = () => {
    skipSelected(allLineIds)
    clearSelection()
  }

  const handleUnskip = () => {
    unskipSelected(allLineIds)
    clearSelection()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="shrink-0 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800"
    >
      {/* Main toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        {/* Left: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkip}
            disabled={selectedCount === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md
              bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            Skip {selectedCount > 0 && `(${selectedCount})`}
          </button>

          <button
            type="button"
            onClick={handleUnskip}
            disabled={selectedCount === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md
              bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            Unskip
          </button>

          <div className="w-px h-6 bg-neutral-700 mx-1" />

          <button
            type="button"
            onClick={() => selectAll(allLineIds)}
            className="px-3 py-1.5 text-sm font-medium rounded-md
              bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white
              transition-colors"
          >
            Select All
          </button>

          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md
              bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Right: Save/Exit */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleRevert}
              className="px-3 py-1.5 text-sm font-medium rounded-md
                text-neutral-400 hover:text-white
                transition-colors"
            >
              Revert
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="px-4 py-1.5 text-sm font-medium rounded-md
              bg-indigo-600 text-white hover:bg-indigo-500
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          <button
            type="button"
            onClick={handleExit}
            className="px-3 py-1.5 text-sm font-medium rounded-md
              text-neutral-400 hover:text-white
              transition-colors"
          >
            Exit Edit
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-neutral-500 border-t border-neutral-800/50">
        <span>{selectedCount > 0 ? `${selectedCount} selected` : "Tap checkboxes to select"}</span>

        <span className="text-neutral-700">•</span>

        <span className="text-neutral-400">Double-click text to edit</span>

        {(skippedCount > 0 || modifiedCount > 0) && (
          <>
            <span className="text-neutral-700">•</span>
            <span>
              {skippedCount > 0 && <span className="text-amber-500">{skippedCount} skipped</span>}
              {skippedCount > 0 && modifiedCount > 0 && ", "}
              {modifiedCount > 0 && (
                <span className="text-emerald-500">{modifiedCount} modified</span>
              )}
            </span>
          </>
        )}

        {isDirty && (
          <>
            <span className="text-neutral-700">•</span>
            <span className="text-amber-400">Unsaved changes</span>
          </>
        )}
      </div>
    </motion.div>
  )
}
