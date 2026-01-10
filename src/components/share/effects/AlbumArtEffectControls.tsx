"use client"

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleDashed } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"
import { ColorPicker, Slider } from "../designer/controls"
import type { EffectSettings, GradientDirection } from "./index"

// ============================================================================
// Direction Button Component
// ============================================================================

interface DirectionButtonProps {
  readonly direction: GradientDirection
  readonly isSelected: boolean
  readonly onClick: () => void
}

const DirectionButton = memo(function DirectionButton({
  direction,
  isSelected,
  onClick,
}: DirectionButtonProps) {
  const icons: Record<GradientDirection, React.ElementType> = {
    top: ArrowUp,
    bottom: ArrowDown,
    left: ArrowLeft,
    right: ArrowRight,
    radial: CircleDashed,
  }

  const Icon = icons[direction]
  const labels: Record<GradientDirection, string> = {
    top: "From top",
    bottom: "From bottom",
    left: "From left",
    right: "From right",
    radial: "Radial",
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="w-8 h-8 rounded-md flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        background: isSelected ? "var(--color-accent)" : "var(--color-surface3)",
        color: isSelected ? "#fff" : "var(--color-text2)",
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={labels[direction]}
      aria-pressed={isSelected}
    >
      <Icon size={18} weight="bold" />
    </motion.button>
  )
})

// ============================================================================
// Direction Selector Component
// ============================================================================

interface DirectionSelectorProps {
  readonly value: GradientDirection
  readonly onChange: (direction: GradientDirection) => void
}

const DirectionSelector = memo(function DirectionSelector({
  value,
  onChange,
}: DirectionSelectorProps) {
  const directions: GradientDirection[] = ["top", "bottom", "left", "right", "radial"]

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
        Direction
      </span>
      <div className="flex gap-1.5">
        {directions.map(dir => (
          <DirectionButton
            key={dir}
            direction={dir}
            isSelected={value === dir}
            onClick={() => onChange(dir)}
          />
        ))}
      </div>
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export interface AlbumArtEffectControlsProps {
  readonly effectType: string
  readonly settings: EffectSettings
  readonly onSettingChange: <K extends keyof EffectSettings>(
    setting: K,
    value: EffectSettings[K],
  ) => void
}

export const AlbumArtEffectControls = memo(function AlbumArtEffectControls({
  effectType,
  settings,
  onSettingChange,
}: AlbumArtEffectControlsProps) {
  // -------------------------------------------------------------------------
  // Vignette Handlers
  // -------------------------------------------------------------------------

  const handleVignetteStrengthChange = useCallback(
    (value: number) => {
      onSettingChange("vignetteStrength", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Blur Handlers
  // -------------------------------------------------------------------------

  const handleBlurAmountChange = useCallback(
    (value: number) => {
      onSettingChange("blurAmount", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Darken Handlers
  // -------------------------------------------------------------------------

  const handleDarkenAmountChange = useCallback(
    (value: number) => {
      onSettingChange("darkenAmount", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Desaturate Handlers
  // -------------------------------------------------------------------------

  const handleDesaturateAmountChange = useCallback(
    (value: number) => {
      onSettingChange("desaturateAmount", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Tint Handlers
  // -------------------------------------------------------------------------

  const handleTintColorChange = useCallback(
    (color: string) => {
      onSettingChange("tintColor", color)
    },
    [onSettingChange],
  )

  const handleTintIntensityChange = useCallback(
    (value: number) => {
      onSettingChange("tintIntensity", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Gradient Handlers
  // -------------------------------------------------------------------------

  const handleGradientDirectionChange = useCallback(
    (direction: GradientDirection) => {
      onSettingChange("gradientDirection", direction)
    },
    [onSettingChange],
  )

  const handleGradientColorChange = useCallback(
    (color: string) => {
      onSettingChange("gradientColor", color)
    },
    [onSettingChange],
  )

  const handleGradientOpacityChange = useCallback(
    (value: number) => {
      onSettingChange("gradientOpacity", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Duotone Handlers
  // -------------------------------------------------------------------------

  const handleDuotoneShadowChange = useCallback(
    (color: string) => {
      onSettingChange("duotoneShadow", color)
    },
    [onSettingChange],
  )

  const handleDuotoneHighlightChange = useCallback(
    (color: string) => {
      onSettingChange("duotoneHighlight", color)
    },
    [onSettingChange],
  )

  const handleDuotoneContrastChange = useCallback(
    (value: number) => {
      onSettingChange("duotoneContrast", value)
    },
    [onSettingChange],
  )

  // -------------------------------------------------------------------------
  // Render Controls Based on Effect Type
  // -------------------------------------------------------------------------

  switch (effectType) {
    case "none":
      return null

    case "vignette":
      return (
        <div className="flex flex-col gap-3">
          <Slider
            label="Strength"
            value={settings.vignetteStrength}
            min={0}
            max={100}
            step={1}
            onChange={handleVignetteStrengthChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    case "blur":
      return (
        <div className="flex flex-col gap-3">
          <Slider
            label="Amount"
            value={settings.blurAmount}
            min={0}
            max={30}
            step={1}
            onChange={handleBlurAmountChange}
            formatValue={v => `${v}px`}
          />
        </div>
      )

    case "darken":
      return (
        <div className="flex flex-col gap-3">
          <Slider
            label="Amount"
            value={settings.darkenAmount}
            min={0}
            max={80}
            step={1}
            onChange={handleDarkenAmountChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    case "desaturate":
      return (
        <div className="flex flex-col gap-3">
          <Slider
            label="Amount"
            value={settings.desaturateAmount}
            min={0}
            max={100}
            step={1}
            onChange={handleDesaturateAmountChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    case "tint":
      return (
        <div className="flex flex-col gap-3">
          <ColorPicker label="Color" value={settings.tintColor} onChange={handleTintColorChange} />
          <Slider
            label="Intensity"
            value={settings.tintIntensity}
            min={0}
            max={100}
            step={1}
            onChange={handleTintIntensityChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    case "gradient":
      return (
        <div className="flex flex-col gap-3">
          <DirectionSelector
            value={settings.gradientDirection}
            onChange={handleGradientDirectionChange}
          />
          <ColorPicker
            label="Color"
            value={settings.gradientColor}
            onChange={handleGradientColorChange}
          />
          <Slider
            label="Opacity"
            value={settings.gradientOpacity}
            min={0}
            max={80}
            step={1}
            onChange={handleGradientOpacityChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    case "duotone":
      return (
        <div className="flex flex-col gap-3">
          <ColorPicker
            label="Shadow color"
            value={settings.duotoneShadow}
            onChange={handleDuotoneShadowChange}
          />
          <ColorPicker
            label="Highlight color"
            value={settings.duotoneHighlight}
            onChange={handleDuotoneHighlightChange}
          />
          <Slider
            label="Contrast"
            value={settings.duotoneContrast}
            min={0}
            max={100}
            step={1}
            onChange={handleDuotoneContrastChange}
            formatValue={v => `${v}%`}
          />
        </div>
      )

    default:
      return null
  }
})
