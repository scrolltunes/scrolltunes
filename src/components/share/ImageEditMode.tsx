"use client"

import { useHaptic } from "@/hooks/useHaptic"
import { useScreenReaderAnnounce } from "@/hooks/useScreenReaderAnnounce"
import { ArrowCounterClockwise, Check, Image } from "@phosphor-icons/react"
import { memo, useCallback, useEffect, useRef } from "react"
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
  const { haptic } = useHaptic()
  const { announce, liveRegionProps } = useScreenReaderAnnounce()
  const prevIsEditingRef = useRef(isEditing)
  const prevScaleRef = useRef(scale)

  const hasChanges =
    offsetX !== DEFAULT_IMAGE_EDIT.offsetX ||
    offsetY !== DEFAULT_IMAGE_EDIT.offsetY ||
    scale !== DEFAULT_IMAGE_EDIT.scale

  // Announce mode changes
  useEffect(() => {
    if (prevIsEditingRef.current !== isEditing) {
      announce(isEditing ? "Image edit mode entered" : "Image edit mode exited")
      prevIsEditingRef.current = isEditing
    }
  }, [isEditing, announce])

  // Announce zoom level changes
  useEffect(() => {
    if (prevScaleRef.current !== scale && isEditing) {
      const zoomPercent = Math.round(scale * 100)
      announce(`Zoom ${zoomPercent}%`)
      prevScaleRef.current = scale
    }
  }, [scale, isEditing, announce])

  const handleToggle = useCallback(() => {
    haptic("light")
    onToggle()
  }, [haptic, onToggle])

  const handleReset = useCallback(() => {
    haptic("medium")
    announce("Image position reset")
    onReset()
  }, [haptic, announce, onReset])

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
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
          onClick={handleReset}
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
      <div {...liveRegionProps} />
    </>
  )
})
