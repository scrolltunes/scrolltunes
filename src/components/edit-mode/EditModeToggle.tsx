"use client"

import { useHasEdits, useIsEditMode } from "@/core"
import { PencilSimple } from "@phosphor-icons/react"
import { motion } from "motion/react"

interface EditModeToggleProps {
  readonly onEnterEditMode: () => void
  readonly className?: string
  readonly showLabel?: boolean
}

export function EditModeToggle({
  onEnterEditMode,
  className = "",
  showLabel = false,
}: EditModeToggleProps) {
  const isEditMode = useIsEditMode()
  const hasEdits = useHasEdits()

  if (isEditMode) {
    // Don't show toggle button when already in edit mode
    return null
  }

  return (
    <motion.button
      type="button"
      onClick={onEnterEditMode}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg
        bg-neutral-800/80 hover:bg-neutral-700/80
        text-neutral-300 hover:text-white
        transition-colors
        ${className}
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      aria-label="Enter edit mode"
    >
      <PencilSimple
        size={20}
        weight={hasEdits ? "fill" : "regular"}
        className={hasEdits ? "text-indigo-400" : ""}
      />

      {showLabel && <span className="text-sm font-medium">Edit</span>}

      {/* Modified indicator dot */}
      {hasEdits && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-500" />
      )}
    </motion.button>
  )
}
