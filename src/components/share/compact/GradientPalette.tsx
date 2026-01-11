"use client"

import type { GradientOption } from "@/lib/colors"
import { Palette } from "@phosphor-icons/react"
import { memo, useCallback, useRef } from "react"

// ============================================================================
// Types
// ============================================================================

const CUSTOM_COLOR_ID = "__custom__"

export interface GradientPaletteProps {
  /** Available gradient options (from album color extraction) */
  readonly gradientPalette: readonly GradientOption[]
  /** Currently selected gradient ID or null for custom color */
  readonly selectedGradientId: string | null
  /** Custom color hex value */
  readonly customColor: string
  /** Called when a gradient is selected */
  readonly onGradientSelect: (gradientId: string, gradient: string) => void
  /** Called when custom color changes */
  readonly onCustomColorChange: (color: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Album-derived color palette for quick background selection.
 * Displays gradient swatches extracted from album art plus a custom color picker.
 * Positioned at the bottom of the preview area in compact mode.
 */
export const GradientPalette = memo(function GradientPalette({
  gradientPalette,
  selectedGradientId,
  customColor,
  onGradientSelect,
  onCustomColorChange,
}: GradientPaletteProps) {
  const colorInputRef = useRef<HTMLInputElement>(null)

  const handleCustomColorClick = useCallback(() => {
    colorInputRef.current?.click()
  }, [])

  const handleColorInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCustomColorChange(e.target.value)
    },
    [onCustomColorChange],
  )

  const isCustomSelected = selectedGradientId === CUSTOM_COLOR_ID

  return (
    <div>
      <p className="mb-2 text-sm" style={{ color: "var(--color-text3)" }}>
        Color
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {gradientPalette.map(option => {
          const isSelected = selectedGradientId === option.id

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onGradientSelect(option.id, option.gradient)}
              className="h-8 w-8 rounded-full transition-all hover:scale-110 focus:outline-none"
              style={{
                background: option.gradient,
                boxShadow: isSelected
                  ? "0 0 0 2px var(--color-accent)"
                  : "inset 0 0 0 1px var(--color-border)",
              }}
              aria-label={`Select ${option.id} gradient`}
              aria-pressed={isSelected}
            />
          )
        })}

        {/* Custom color picker button */}
        <button
          type="button"
          onClick={handleCustomColorClick}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 focus:outline-none"
          style={{
            background: isCustomSelected ? customColor : "var(--color-surface2)",
            boxShadow: isCustomSelected
              ? "0 0 0 2px var(--color-accent)"
              : "inset 0 0 0 1px var(--color-border)",
          }}
          aria-label="Choose custom color"
        >
          {!isCustomSelected && <Palette size={16} style={{ color: "var(--color-text3)" }} />}
        </button>

        {/* Hidden color input */}
        <input
          ref={colorInputRef}
          type="color"
          value={customColor}
          onChange={handleColorInputChange}
          className="sr-only"
          aria-label="Custom color picker"
        />
      </div>
    </div>
  )
})

// Export the custom color ID for use by parent components
export { CUSTOM_COLOR_ID }
