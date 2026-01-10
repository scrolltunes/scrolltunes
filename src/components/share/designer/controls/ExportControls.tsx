"use client"

import { memo, useCallback } from "react"
import type { ExportFormat, ExportQuality, ExportSettings } from "../types"
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl"
import { Slider } from "./Slider"

// ============================================================================
// Options
// ============================================================================

const FORMAT_OPTIONS: readonly SegmentedOption<ExportFormat>[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
] as const

const QUALITY_OPTIONS: readonly SegmentedOption<ExportQuality>[] = [
  { value: "standard", label: "1x" },
  { value: "high", label: "2x" },
  { value: "ultra", label: "3x" },
] as const

// ============================================================================
// Helper
// ============================================================================

function getPixelRatioFromQuality(quality: ExportQuality): number {
  switch (quality) {
    case "standard":
      return 1
    case "high":
      return 2
    case "ultra":
      return 3
    default:
      return 2
  }
}

function getQualityFromPixelRatio(pixelRatio: number): ExportQuality {
  if (pixelRatio <= 1) return "standard"
  if (pixelRatio <= 2) return "high"
  return "ultra"
}

// ============================================================================
// Main Component
// ============================================================================

export interface ExportControlsProps {
  readonly settings: ExportSettings
  readonly onChange: (config: Partial<ExportSettings>) => void
}

export const ExportControls = memo(function ExportControls({
  settings,
  onChange,
}: ExportControlsProps) {
  const handleFormatChange = useCallback(
    (format: ExportFormat) => {
      onChange({ format })
    },
    [onChange],
  )

  const handleQualityChange = useCallback(
    (quality: ExportQuality) => {
      onChange({
        quality,
        pixelRatio: getPixelRatioFromQuality(quality),
      })
    },
    [onChange],
  )

  const handlePixelRatioChange = useCallback(
    (pixelRatio: number) => {
      onChange({
        pixelRatio,
        quality: getQualityFromPixelRatio(pixelRatio),
      })
    },
    [onChange],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Format */}
      <SegmentedControl
        label="Format"
        options={FORMAT_OPTIONS}
        value={settings.format}
        onChange={handleFormatChange}
        size="sm"
      />

      {/* Quality preset */}
      <SegmentedControl
        label="Resolution"
        options={QUALITY_OPTIONS}
        value={settings.quality}
        onChange={handleQualityChange}
        size="sm"
      />

      {/* Pixel ratio slider for fine control */}
      <Slider
        label="Pixel Ratio"
        value={settings.pixelRatio}
        min={1}
        max={4}
        step={0.5}
        onChange={handlePixelRatioChange}
        formatValue={v => `${v}x`}
      />

      {/* Info text */}
      <div
        className="text-xs rounded-lg px-3 py-2"
        style={{
          background: "var(--color-surface2)",
          color: "var(--color-text3)",
        }}
      >
        <p>Higher pixel ratios produce sharper images but larger file sizes.</p>
        {settings.format === "jpeg" && <p className="mt-1">JPEG does not support transparency.</p>}
      </div>
    </div>
  )
})
