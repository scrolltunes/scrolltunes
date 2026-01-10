"use client"

import { memo, useCallback } from "react"
import type { CompactPatternVariant } from "../ShareExperienceStore"
import type { EffectsConfig, ElementsConfig } from "../designer/types"
import {
  AlbumArtEffectControls,
  EffectSelector,
  type EffectSettings,
  type EffectType,
} from "../effects"

// ============================================================================
// Types
// ============================================================================

interface PatternOption {
  readonly id: CompactPatternVariant
  readonly label: string
  readonly requiresAlbumArt?: boolean
}

const PATTERN_OPTIONS: readonly PatternOption[] = [
  { id: "none", label: "None" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "waves", label: "Waves" },
  { id: "albumArt", label: "Album", requiresAlbumArt: true },
]

// ============================================================================
// Toggle Switch Component
// ============================================================================

interface ToggleSwitchProps {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

const ToggleSwitch = memo(function ToggleSwitch({ label, checked, onChange }: ToggleSwitchProps) {
  const id = `toggle-${label.toLowerCase().replace(/\s+/g, "-")}`

  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only"
          aria-labelledby={id}
        />
        <div
          className="h-6 w-11 rounded-full transition-colors"
          style={{
            background: checked ? "var(--color-accent)" : "var(--color-surface3)",
          }}
        />
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </div>
      <span id={id} className="text-sm" style={{ color: "var(--color-text2)" }}>
        {label}
      </span>
    </label>
  )
})

// ============================================================================
// Pattern Selector Component
// ============================================================================

interface PatternSelectorProps {
  readonly value: CompactPatternVariant
  readonly onChange: (pattern: CompactPatternVariant) => void
  readonly hasAlbumArt: boolean
}

const PatternSelector = memo(function PatternSelector({
  value,
  onChange,
  hasAlbumArt,
}: PatternSelectorProps) {
  const availableOptions = PATTERN_OPTIONS.filter(option => !option.requiresAlbumArt || hasAlbumArt)

  return (
    <div>
      <p className="mb-2 text-sm" style={{ color: "var(--color-text3)" }}>
        Pattern
      </p>
      <div className="flex flex-wrap gap-2">
        {availableOptions.map(option => {
          const isSelected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110"
              style={{
                background: isSelected ? "var(--color-accent)" : "var(--color-surface2)",
                color: isSelected ? "white" : "var(--color-text2)",
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
})

// ============================================================================
// Main QuickControls Component
// ============================================================================

export interface QuickControlsProps {
  // Pattern state
  readonly compactPattern: CompactPatternVariant
  readonly onPatternChange: (pattern: CompactPatternVariant) => void
  readonly hasAlbumArt: boolean
  // Album art effect state (for album pattern)
  readonly albumArt?: string | null
  readonly effectType: EffectType
  readonly effectSettings: EffectSettings
  readonly onEffectTypeChange: (effect: EffectType) => void
  readonly onEffectSettingChange: <K extends keyof EffectSettings>(
    setting: K,
    value: EffectSettings[K],
  ) => void
  // Toggles state
  readonly effects: EffectsConfig
  readonly elements: ElementsConfig
  readonly onShadowToggle: (enabled: boolean) => void
  readonly onSpotifyCodeToggle: (visible: boolean) => void
  readonly onBrandingToggle: (visible: boolean) => void
  // Optional: Spotify ID to determine if Spotify code toggle should be shown
  readonly spotifyId?: string | null
}

export const QuickControls = memo(function QuickControls({
  compactPattern,
  onPatternChange,
  hasAlbumArt,
  albumArt,
  effectType,
  effectSettings,
  onEffectTypeChange,
  onEffectSettingChange,
  effects,
  elements,
  onShadowToggle,
  onSpotifyCodeToggle,
  onBrandingToggle,
  spotifyId,
}: QuickControlsProps) {
  const isAlbumPattern = compactPattern === "albumArt"
  const showEffectControls = isAlbumPattern && hasAlbumArt

  const handleShadowChange = useCallback(
    (checked: boolean) => {
      onShadowToggle(checked)
    },
    [onShadowToggle],
  )

  const handleSpotifyCodeChange = useCallback(
    (checked: boolean) => {
      onSpotifyCodeToggle(checked)
    },
    [onSpotifyCodeToggle],
  )

  const handleBrandingChange = useCallback(
    (checked: boolean) => {
      onBrandingToggle(checked)
    },
    [onBrandingToggle],
  )

  return (
    <div className="space-y-4">
      {/* Pattern Selector */}
      <PatternSelector
        value={compactPattern}
        onChange={onPatternChange}
        hasAlbumArt={hasAlbumArt}
      />

      {/* Album Art Effect Controls (shown only when Album pattern is selected) */}
      {showEffectControls && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--color-text3)" }}>
            Effect
          </p>
          <EffectSelector value={effectType} onChange={onEffectTypeChange} albumArt={albumArt ?? null} />
          <AlbumArtEffectControls
            effectType={effectType}
            settings={effectSettings}
            onSettingChange={onEffectSettingChange}
          />
        </div>
      )}

      {/* Toggle Controls */}
      <div className="space-y-3">
        <ToggleSwitch
          label="Drop shadow"
          checked={effects.shadow.enabled}
          onChange={handleShadowChange}
        />

        {spotifyId && (
          <ToggleSwitch
            label="Spotify code"
            checked={elements.spotifyCode.visible}
            onChange={handleSpotifyCodeChange}
          />
        )}

        <ToggleSwitch
          label="Support us"
          checked={elements.branding.visible}
          onChange={handleBrandingChange}
        />
      </div>
    </div>
  )
})
