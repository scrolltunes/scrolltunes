"use client"

import { memo, useCallback } from "react"
import type { QuickPreset } from "../ShareExperienceStore"

// ============================================================================
// Types
// ============================================================================

interface PresetOption {
  readonly id: QuickPreset
  readonly label: string
  readonly description: string
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  { id: "clean", label: "Clean", description: "Light, minimal, airy" },
  { id: "vibrant", label: "Vibrant", description: "Bold, colorful" },
  { id: "dark", label: "Dark", description: "Moody, dramatic" },
  { id: "vintage", label: "Vintage", description: "Nostalgic, film-like" },
]

// ============================================================================
// Props
// ============================================================================

export interface QuickStylePresetsProps {
  readonly activePreset: QuickPreset | null
  readonly onPresetSelect: (preset: QuickPreset) => void
}

// ============================================================================
// Component
// ============================================================================

export const QuickStylePresets = memo(function QuickStylePresets({
  activePreset,
  onPresetSelect,
}: QuickStylePresetsProps) {
  const handlePresetClick = useCallback(
    (preset: QuickPreset) => {
      onPresetSelect(preset)
    },
    [onPresetSelect],
  )

  return (
    <div>
      <p className="mb-2 text-sm" style={{ color: "var(--color-text3)" }}>
        Quick Styles
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESET_OPTIONS.map(option => {
          const isSelected = activePreset === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handlePresetClick(option.id)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110"
              style={{
                background: isSelected ? "var(--color-accent)" : "var(--color-surface2)",
                color: isSelected ? "white" : "var(--color-text2)",
              }}
              aria-label={`${option.label} preset: ${option.description}`}
              aria-pressed={isSelected}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})
