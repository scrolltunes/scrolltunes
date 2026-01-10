"use client"

import { ArrowCounterClockwise, Check, Image } from "@phosphor-icons/react"
import { memo } from "react"
import { DEFAULT_IMAGE_EDIT } from "./designer/types"

interface ImageEditModeProps {
  readonly isEditing: boolean
  readonly offsetX: number
  readonly offsetY: number
  readonly scale: number
  readonly onToggle: () => void
  readonly onReset: () => void
}

/**
 * Toggle button for entering/exiting image edit mode.
 * Allows pan and zoom manipulation of album art backgrounds.
 */
export const ImageEditMode = memo(function ImageEditMode({
  isEditing,
  offsetX,
  offsetY,
  scale,
  onToggle,
  onReset,
}: ImageEditModeProps) {
  const hasChanges =
    offsetX !== DEFAULT_IMAGE_EDIT.offsetX ||
    offsetY !== DEFAULT_IMAGE_EDIT.offsetY ||
    scale !== DEFAULT_IMAGE_EDIT.scale

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:h-9 lg:w-9"
        style={{
          background: isEditing ? "var(--color-accent)" : "rgba(0,0,0,0.5)",
          color: isEditing ? "white" : "rgba(255,255,255,0.8)",
        }}
        aria-label={isEditing ? "Done editing image" : "Edit image position"}
      >
        {isEditing ? <Check size={18} weight="bold" /> : <Image size={18} weight="bold" />}
      </button>
      {isEditing && hasChanges && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors lg:h-9 lg:w-9"
          style={{
            background: "rgba(0,0,0,0.5)",
            color: "rgba(255,255,255,0.8)",
          }}
          aria-label="Reset image position"
        >
          <ArrowCounterClockwise size={18} weight="bold" />
        </button>
      )}
    </>
  )
})
