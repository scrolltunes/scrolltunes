"use client"

import { memo, useCallback } from "react"
import {
  AlbumArtEffectControls,
  EffectSelector,
  type EffectSettings,
  type EffectType,
} from "../../effects"
import type { BorderConfig, EffectsConfig, ShadowConfig, VignetteConfig } from "../types"
import { ColorPicker } from "./ColorPicker"
import { Slider } from "./Slider"

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
    <div className="flex items-center justify-between">
      <span id={id} className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 cursor-pointer"
        style={{
          background: checked ? "var(--color-accent)" : "var(--color-surface3)",
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  )
})

// ============================================================================
// Effect Section Component
// ============================================================================

interface EffectSectionProps {
  readonly title: string
  readonly enabled: boolean
  readonly onToggle: (enabled: boolean) => void
  readonly children: React.ReactNode
}

const EffectSection = memo(function EffectSection({
  title,
  enabled,
  onToggle,
  children,
}: EffectSectionProps) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-3"
      style={{ background: "var(--color-surface2)" }}
    >
      <ToggleSwitch label={title} checked={enabled} onChange={onToggle} />
      {enabled && (
        <div
          className="flex flex-col gap-3 pt-2"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {children}
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export interface EffectsControlsProps {
  readonly effects: EffectsConfig
  readonly onShadowChange: (config: Partial<ShadowConfig>) => void
  readonly onBorderChange: (config: Partial<BorderConfig>) => void
  readonly onVignetteChange: (config: Partial<VignetteConfig>) => void
  // Album art effect props (only used when album art background is selected)
  readonly isAlbumArtBackground?: boolean
  readonly albumArt?: string | null
  readonly albumArtEffect?: EffectType
  readonly albumArtEffectSettings?: EffectSettings
  readonly onAlbumArtEffectChange?: (effect: EffectType) => void
  readonly onAlbumArtEffectSettingChange?: <K extends keyof EffectSettings>(
    setting: K,
    value: EffectSettings[K],
  ) => void
}

export const EffectsControls = memo(function EffectsControls({
  effects,
  onShadowChange,
  onBorderChange,
  onVignetteChange,
  isAlbumArtBackground,
  albumArt,
  albumArtEffect,
  albumArtEffectSettings,
  onAlbumArtEffectChange,
  onAlbumArtEffectSettingChange,
}: EffectsControlsProps) {
  // -------------------------------------------------------------------------
  // Shadow Handlers
  // -------------------------------------------------------------------------

  const handleShadowToggle = useCallback(
    (enabled: boolean) => {
      onShadowChange({ enabled })
    },
    [onShadowChange],
  )

  // -------------------------------------------------------------------------
  // Border Handlers
  // -------------------------------------------------------------------------

  const handleBorderToggle = useCallback(
    (enabled: boolean) => {
      onBorderChange({ enabled })
    },
    [onBorderChange],
  )

  // -------------------------------------------------------------------------
  // Vignette Handlers
  // -------------------------------------------------------------------------

  const handleVignetteToggle = useCallback(
    (enabled: boolean) => {
      onVignetteChange({ enabled })
    },
    [onVignetteChange],
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Album Art Effects - shown when album art background is selected */}
      {isAlbumArtBackground &&
        albumArtEffect !== undefined &&
        albumArtEffectSettings !== undefined &&
        onAlbumArtEffectChange !== undefined &&
        onAlbumArtEffectSettingChange !== undefined && (
          <div
            className="rounded-lg p-3 flex flex-col gap-3"
            style={{ background: "var(--color-surface2)" }}
          >
            <EffectSelector
              value={albumArtEffect}
              onChange={onAlbumArtEffectChange}
              albumArt={albumArt ?? null}
            />
            <AlbumArtEffectControls
              effectType={albumArtEffect}
              settings={albumArtEffectSettings}
              onSettingChange={onAlbumArtEffectSettingChange}
            />
          </div>
        )}

      {/* Shadow */}
      <EffectSection title="Shadow" enabled={effects.shadow.enabled} onToggle={handleShadowToggle}>
        <Slider
          label="Blur"
          value={effects.shadow.blur}
          min={0}
          max={100}
          step={1}
          onChange={blur => onShadowChange({ blur })}
          formatValue={v => `${v}px`}
        />
        <Slider
          label="Spread"
          value={effects.shadow.spread}
          min={0}
          max={50}
          step={1}
          onChange={spread => onShadowChange({ spread })}
          formatValue={v => `${v}px`}
        />
        <Slider
          label="Offset Y"
          value={effects.shadow.offsetY}
          min={0}
          max={50}
          step={1}
          onChange={offsetY => onShadowChange({ offsetY })}
          formatValue={v => `${v}px`}
        />
        <ColorPicker
          label="Color"
          value={effects.shadow.color}
          onChange={color => onShadowChange({ color })}
          presets={[
            "rgba(0, 0, 0, 0.5)",
            "rgba(0, 0, 0, 0.3)",
            "rgba(0, 0, 0, 0.7)",
            "rgba(0, 0, 50, 0.4)",
            "rgba(50, 0, 50, 0.3)",
          ]}
        />
      </EffectSection>

      {/* Border */}
      <EffectSection title="Border" enabled={effects.border.enabled} onToggle={handleBorderToggle}>
        <Slider
          label="Width"
          value={effects.border.width}
          min={1}
          max={10}
          step={1}
          onChange={width => onBorderChange({ width })}
          formatValue={v => `${v}px`}
        />
        <Slider
          label="Radius"
          value={effects.border.radius}
          min={0}
          max={48}
          step={2}
          onChange={radius => onBorderChange({ radius })}
          formatValue={v => `${v}px`}
        />
        <ColorPicker
          label="Color"
          value={effects.border.color}
          onChange={color => onBorderChange({ color })}
          presets={[
            "rgba(255, 255, 255, 0.2)",
            "rgba(255, 255, 255, 0.1)",
            "rgba(255, 255, 255, 0.4)",
            "rgba(0, 0, 0, 0.2)",
            "#ffffff",
          ]}
        />
      </EffectSection>

      {/* Vignette - hide when album art background is selected (use album art effects instead) */}
      {!isAlbumArtBackground && (
        <EffectSection
          title="Vignette"
          enabled={effects.vignette.enabled}
          onToggle={handleVignetteToggle}
        >
          <Slider
            label="Intensity"
            value={effects.vignette.intensity}
            min={0.1}
            max={0.8}
            step={0.05}
            onChange={intensity => onVignetteChange({ intensity })}
            formatValue={v => `${Math.round(v * 100)}%`}
          />
        </EffectSection>
      )}
    </div>
  )
})
