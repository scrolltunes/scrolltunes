"use client"

import { Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback, useId, useState } from "react"

// Common color presets for the designer
const COLOR_PRESETS = [
  "#ffffff",
  "#f5f5f5",
  "#e0e0e0",
  "#9e9e9e",
  "#616161",
  "#212121",
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const

export interface ColorPickerProps {
  readonly label?: string
  readonly value: string
  readonly onChange: (color: string) => void
  readonly presets?: readonly string[]
  readonly showInput?: boolean
  readonly disabled?: boolean
}

export const ColorPicker = memo(function ColorPicker({
  label,
  value,
  onChange,
  presets = COLOR_PRESETS,
  showInput = true,
  disabled = false,
}: ColorPickerProps) {
  const id = useId()
  const [inputValue, setInputValue] = useState(value)

  const handlePresetClick = useCallback(
    (color: string) => {
      if (!disabled) {
        onChange(color)
        setInputValue(color)
      }
    },
    [onChange, disabled],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setInputValue(newValue)

      // Validate hex color format
      if (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(newValue)) {
        onChange(newValue)
      }
    },
    [onChange],
  )

  const handleInputBlur = useCallback(() => {
    // Reset to current value if invalid
    if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(inputValue)) {
      setInputValue(value)
    }
  }, [inputValue, value])

  // Determine if a color is light (for checkmark visibility)
  const isLightColor = (color: string): boolean => {
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16)
    const g = Number.parseInt(hex.substring(2, 4), 16)
    const b = Number.parseInt(hex.substring(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-medium"
          style={{ color: "var(--color-text2)" }}
        >
          {label}
        </label>
      )}

      {/* Color swatches */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(color => {
          const isSelected = value.toLowerCase() === color.toLowerCase()
          const isLight = isLightColor(color)

          return (
            <motion.button
              key={color}
              type="button"
              onClick={() => handlePresetClick(color)}
              disabled={disabled}
              className="relative w-6 h-6 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: color,
                boxShadow: isSelected
                  ? "0 0 0 2px var(--color-accent)"
                  : "inset 0 0 0 1px rgba(0,0,0,0.1)",
              }}
              whileHover={{ scale: disabled ? 1 : 1.1 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              aria-label={`Select color ${color}`}
              aria-pressed={isSelected}
            >
              {isSelected && (
                <Check
                  size={14}
                  weight="bold"
                  className="absolute inset-0 m-auto"
                  style={{ color: isLight ? "#000" : "#fff" }}
                />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Hex input */}
      {showInput && (
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-md flex-shrink-0"
            style={{
              background: value,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
            }}
          />
          <input
            id={id}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled}
            placeholder="#000000"
            className="flex-1 px-2 py-1.5 rounded-md text-xs font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--color-surface2)",
              color: "var(--color-text1)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Hex color value"
          />
        </div>
      )}
    </div>
  )
})
