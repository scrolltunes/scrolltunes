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
    <div className="absolute bottom-2 left-2 right-2 flex justify-center">
      <div
        className="flex items-center gap-1.5 rounded-full px-2 py-1.5"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        {gradientPalette.map(option => {
          const isSelected = selectedGradientId === option.id

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onGradientSelect(option.id, option.gradient)}
              className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
              style={{
                background: option.gradient,
                boxShadow: isSelected ? "0 0 0 2px white" : "inset 0 0 0 1px rgba(255,255,255,0.2)",
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
          className="flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
          style={{
            background: isCustomSelected ? customColor : "rgba(255,255,255,0.1)",
            boxShadow: isCustomSelected
              ? "0 0 0 2px white"
              : "inset 0 0 0 1px rgba(255,255,255,0.2)",
          }}
          aria-label="Choose custom color"
        >
          {!isCustomSelected && <Palette size={14} style={{ color: "rgba(255,255,255,0.7)" }} />}
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
