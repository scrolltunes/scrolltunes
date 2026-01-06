"use client"

import { TextAlignCenter, TextAlignLeft, TextAlignRight } from "@phosphor-icons/react"
import { memo, useCallback } from "react"
import type { FontWeight, TextAlignment, TypographyConfig } from "../types"
import { ColorPicker } from "./ColorPicker"
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl"
import { Slider } from "./Slider"

const FONT_WEIGHT_OPTIONS: readonly SegmentedOption<string>[] = [
  { value: "400", label: "Light" },
  { value: "500", label: "Regular" },
  { value: "600", label: "Medium" },
  { value: "700", label: "Bold" },
] as const

const TEXT_ALIGNMENT_OPTIONS: readonly SegmentedOption<TextAlignment>[] = [
  { value: "left", label: "", icon: <TextAlignLeft size={16} /> },
  { value: "center", label: "", icon: <TextAlignCenter size={16} /> },
  { value: "right", label: "", icon: <TextAlignRight size={16} /> },
] as const

export interface TypographyControlsProps {
  readonly typography: TypographyConfig
  readonly onTypographyChange: (config: Partial<TypographyConfig>) => void
}

export const TypographyControls = memo(function TypographyControls({
  typography,
  onTypographyChange,
}: TypographyControlsProps) {
  const handleFontSizeChange = useCallback(
    (fontSize: number) => {
      onTypographyChange({ fontSize })
    },
    [onTypographyChange],
  )

  const handleFontWeightChange = useCallback(
    (value: string) => {
      onTypographyChange({ fontWeight: Number(value) as FontWeight })
    },
    [onTypographyChange],
  )

  const handleColorChange = useCallback(
    (color: string) => {
      onTypographyChange({ color })
    },
    [onTypographyChange],
  )

  const handleAlignmentChange = useCallback(
    (alignment: TextAlignment) => {
      onTypographyChange({ alignment })
    },
    [onTypographyChange],
  )

  const handleLineHeightChange = useCallback(
    (lineHeight: number) => {
      onTypographyChange({ lineHeight })
    },
    [onTypographyChange],
  )

  const handleTextShadowChange = useCallback(
    (enabled: boolean) => {
      onTypographyChange({ textShadow: enabled })
    },
    [onTypographyChange],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Font Size */}
      <Slider
        label="Font Size"
        value={typography.fontSize}
        min={14}
        max={32}
        step={1}
        onChange={handleFontSizeChange}
        formatValue={v => `${v}px`}
      />

      {/* Font Weight */}
      <SegmentedControl
        label="Weight"
        options={FONT_WEIGHT_OPTIONS}
        value={typography.fontWeight.toString()}
        onChange={handleFontWeightChange}
        size="sm"
      />

      {/* Text Color */}
      <ColorPicker
        label="Text Color"
        value={typography.color}
        onChange={handleColorChange}
      />

      {/* Text Alignment */}
      <SegmentedControl
        label="Alignment"
        options={TEXT_ALIGNMENT_OPTIONS}
        value={typography.alignment}
        onChange={handleAlignmentChange}
        size="sm"
      />

      {/* Line Height */}
      <Slider
        label="Line Height"
        value={typography.lineHeight}
        min={1.2}
        max={2.0}
        step={0.1}
        onChange={handleLineHeightChange}
        formatValue={v => v.toFixed(1)}
      />

      {/* Text Shadow Toggle */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--color-text2)" }}
        >
          Text Shadow
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={typography.textShadow}
          onClick={() => handleTextShadowChange(!typography.textShadow)}
          className="relative w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
          style={{
            background: typography.textShadow
              ? "var(--color-accent)"
              : "var(--color-surface3)",
          }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{
              transform: typography.textShadow ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </button>
      </div>
    </div>
  )
})
