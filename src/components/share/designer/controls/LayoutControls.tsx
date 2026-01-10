"use client"

import { motion } from "motion/react"
import { memo, useCallback } from "react"
import type { AspectRatioConfig, AspectRatioPreset } from "../types"
import { Slider } from "./Slider"

const ASPECT_RATIO_OPTIONS: readonly {
  preset: AspectRatioPreset
  label: string
  width: number
  height: number
}[] = [
  { preset: "1:1", label: "1:1", width: 1, height: 1 },
  { preset: "9:16", label: "9:16", width: 9, height: 16 },
  { preset: "16:9", label: "16:9", width: 16, height: 9 },
  { preset: "4:5", label: "4:5", width: 4, height: 5 },
] as const

export interface LayoutControlsProps {
  readonly aspectRatio: AspectRatioConfig
  readonly padding: number
  readonly onAspectRatioChange: (config: AspectRatioConfig) => void
  readonly onPaddingChange: (padding: number) => void
}

export const LayoutControls = memo(function LayoutControls({
  aspectRatio,
  padding,
  onAspectRatioChange,
  onPaddingChange,
}: LayoutControlsProps) {
  const handlePresetSelect = useCallback(
    (preset: AspectRatioPreset) => {
      onAspectRatioChange({ preset })
    },
    [onAspectRatioChange],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Aspect Ratio */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
          Aspect Ratio
        </span>
        <div className="flex gap-2">
          {ASPECT_RATIO_OPTIONS.map(option => {
            const isSelected = aspectRatio.preset === option.preset
            // Calculate visual aspect ratio for preview box (max 28px)
            const maxDim = 28
            const scale = maxDim / Math.max(option.width, option.height)
            const previewWidth = option.width * scale
            const previewHeight = option.height * scale

            return (
              <motion.button
                key={option.preset}
                type="button"
                onClick={() => handlePresetSelect(option.preset)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                style={{
                  background: isSelected ? "var(--color-accent-soft)" : "var(--color-surface2)",
                  border: isSelected ? "1px solid var(--color-accent)" : "1px solid transparent",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                aria-pressed={isSelected}
                aria-label={`Aspect ratio ${option.label}`}
              >
                <div
                  className="rounded"
                  style={{
                    width: previewWidth,
                    height: previewHeight,
                    background: isSelected ? "var(--color-accent)" : "var(--color-text3)",
                    opacity: isSelected ? 1 : 0.5,
                  }}
                />
                <span
                  className="text-xs font-medium"
                  style={{
                    color: isSelected ? "var(--color-accent)" : "var(--color-text3)",
                  }}
                >
                  {option.label}
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Padding */}
      <Slider
        label="Padding"
        value={padding}
        min={16}
        max={48}
        step={4}
        onChange={onPaddingChange}
        formatValue={v => `${v}px`}
      />
    </div>
  )
})
