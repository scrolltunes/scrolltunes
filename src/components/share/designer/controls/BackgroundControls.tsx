"use client"

import { ArrowsClockwise, CircleHalf, Gradient, Image, Palette } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"
import type { GradientOption } from "@/lib/colors"
import type {
  AlbumArtBackground,
  BackgroundConfig,
  BackgroundType,
  PatternBackground,
  PatternVariant,
} from "../types"
import { ColorPicker } from "./ColorPicker"
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl"
import { Slider } from "./Slider"

const BACKGROUND_TYPE_OPTIONS: readonly SegmentedOption<BackgroundType>[] = [
  { value: "solid", label: "Solid", icon: <Palette size={14} /> },
  { value: "gradient", label: "Gradient", icon: <Gradient size={14} /> },
  { value: "albumArt", label: "Art", icon: <Image size={14} /> },
  { value: "pattern", label: "Pattern", icon: <CircleHalf size={14} /> },
] as const

const PATTERN_OPTIONS: readonly SegmentedOption<PatternVariant>[] = [
  { value: "none", label: "None" },
  { value: "dots", label: "Dots" },
  { value: "grid", label: "Grid" },
  { value: "waves", label: "Waves" },
] as const

export interface BackgroundControlsProps {
  readonly background: BackgroundConfig
  readonly gradientPalette: readonly GradientOption[]
  readonly hasAlbumArt: boolean
  readonly onBackgroundChange: (config: BackgroundConfig) => void
  readonly onRegeneratePattern?: () => void
}

export const BackgroundControls = memo(function BackgroundControls({
  background,
  gradientPalette,
  hasAlbumArt,
  onBackgroundChange,
  onRegeneratePattern,
}: BackgroundControlsProps) {
  const handleTypeChange = useCallback(
    (type: BackgroundType) => {
      switch (type) {
        case "solid":
          onBackgroundChange({
            type: "solid",
            color: "#1a1a2e",
          })
          break
        case "gradient": {
          const first = gradientPalette[0]
          onBackgroundChange({
            type: "gradient",
            gradient: first?.gradient ?? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            gradientId: first?.id ?? "default",
          })
          break
        }
        case "albumArt":
          onBackgroundChange({
            type: "albumArt",
            blur: 20,
            overlayOpacity: 0.6,
            overlayColor: "rgba(0, 0, 0, 0.6)",
          })
          break
        case "pattern":
          onBackgroundChange({
            type: "pattern",
            baseColor: "#1a1a2e",
            pattern: "dots",
            patternSeed: Date.now(),
          })
          break
      }
    },
    [onBackgroundChange, gradientPalette],
  )

  const handleSolidColorChange = useCallback(
    (color: string) => {
      onBackgroundChange({ type: "solid", color })
    },
    [onBackgroundChange],
  )

  const handleGradientSelect = useCallback(
    (option: GradientOption) => {
      onBackgroundChange({
        type: "gradient",
        gradient: option.gradient,
        gradientId: option.id,
      })
    },
    [onBackgroundChange],
  )

  const handleAlbumArtChange = useCallback(
    (updates: Partial<Omit<AlbumArtBackground, "type">>) => {
      if (background.type === "albumArt") {
        onBackgroundChange({
          ...background,
          ...updates,
        })
      }
    },
    [background, onBackgroundChange],
  )

  const handlePatternChange = useCallback(
    (updates: Partial<Omit<PatternBackground, "type">>) => {
      if (background.type === "pattern") {
        onBackgroundChange({
          ...background,
          ...updates,
        })
      }
    },
    [background, onBackgroundChange],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Background Type */}
      <SegmentedControl
        label="Type"
        options={BACKGROUND_TYPE_OPTIONS}
        value={background.type}
        onChange={handleTypeChange}
        size="sm"
      />

      {/* Type-specific controls */}
      {background.type === "solid" && (
        <ColorPicker
          label="Background Color"
          value={background.color}
          onChange={handleSolidColorChange}
        />
      )}

      {background.type === "gradient" && (
        <div className="flex flex-col gap-2">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--color-text2)" }}
          >
            Gradient
          </span>
          <div className="flex flex-wrap gap-2">
            {gradientPalette.map(option => {
              const isSelected = background.gradientId === option.id

              return (
                <motion.button
                  key={option.id}
                  type="button"
                  onClick={() => handleGradientSelect(option)}
                  className="w-10 h-10 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                  style={{
                    background: option.gradient,
                    boxShadow: isSelected
                      ? "0 0 0 2px var(--color-accent)"
                      : "inset 0 0 0 1px rgba(255,255,255,0.1)",
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-pressed={isSelected}
                  aria-label={`Select gradient ${option.id}`}
                />
              )
            })}
          </div>
        </div>
      )}

      {background.type === "albumArt" && (
        <>
          {!hasAlbumArt && (
            <div
              className="px-3 py-2 rounded-lg text-xs"
              style={{
                background: "var(--color-warning-soft)",
                color: "var(--color-warning)",
              }}
            >
              No album art available for this song
            </div>
          )}
          <Slider
            label="Blur"
            value={background.blur}
            min={0}
            max={50}
            step={1}
            onChange={blur => handleAlbumArtChange({ blur })}
            formatValue={v => `${v}px`}
            disabled={!hasAlbumArt}
          />
          <Slider
            label="Overlay Opacity"
            value={background.overlayOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={overlayOpacity => handleAlbumArtChange({ overlayOpacity })}
            formatValue={v => `${Math.round(v * 100)}%`}
            disabled={!hasAlbumArt}
          />
        </>
      )}

      {background.type === "pattern" && (
        <>
          <SegmentedControl
            label="Pattern"
            options={PATTERN_OPTIONS}
            value={background.pattern}
            onChange={pattern => handlePatternChange({ pattern })}
            size="sm"
          />
          <ColorPicker
            label="Base Color"
            value={background.baseColor}
            onChange={baseColor => handlePatternChange({ baseColor })}
          />
          {onRegeneratePattern && (
            <motion.button
              type="button"
              onClick={onRegeneratePattern}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                background: "var(--color-surface2)",
                color: "var(--color-text2)",
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <ArrowsClockwise size={14} />
              Regenerate Pattern
            </motion.button>
          )}
        </>
      )}
    </div>
  )
})
