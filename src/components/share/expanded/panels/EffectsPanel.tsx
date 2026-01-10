"use client"

import { memo } from "react"
import { EffectsControls, ExportControls } from "../../designer/controls"
import type {
  BorderConfig,
  EffectsConfig,
  ExportSettings,
  ShadowConfig,
  VignetteConfig,
} from "../../designer/types"
import type { EffectSettings, EffectType } from "../../effects"

// ============================================================================
// Types
// ============================================================================

export interface EffectsPanelProps {
  readonly effects: EffectsConfig
  readonly exportSettings: ExportSettings
  readonly onShadowChange: (config: Partial<ShadowConfig>) => void
  readonly onBorderChange: (config: Partial<BorderConfig>) => void
  readonly onVignetteChange: (config: Partial<VignetteConfig>) => void
  readonly onExportSettingsChange: (config: Partial<ExportSettings>) => void
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

// ============================================================================
// Component
// ============================================================================

/**
 * Effects panel for expanded mode.
 * Combines EffectsControls and ExportControls with consistent panel styling.
 */
export const EffectsPanel = memo(function EffectsPanel({
  effects,
  exportSettings,
  onShadowChange,
  onBorderChange,
  onVignetteChange,
  onExportSettingsChange,
  isAlbumArtBackground,
  albumArt,
  albumArtEffect,
  albumArtEffectSettings,
  onAlbumArtEffectChange,
  onAlbumArtEffectSettingChange,
}: EffectsPanelProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <EffectsControls
        effects={effects}
        onShadowChange={onShadowChange}
        onBorderChange={onBorderChange}
        onVignetteChange={onVignetteChange}
        {...(isAlbumArtBackground !== undefined && { isAlbumArtBackground })}
        {...(albumArt !== undefined && { albumArt })}
        {...(albumArtEffect !== undefined && { albumArtEffect })}
        {...(albumArtEffectSettings !== undefined && { albumArtEffectSettings })}
        {...(onAlbumArtEffectChange !== undefined && { onAlbumArtEffectChange })}
        {...(onAlbumArtEffectSettingChange !== undefined && { onAlbumArtEffectSettingChange })}
      />
      <div className="pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        <ExportControls settings={exportSettings} onChange={onExportSettingsChange} />
      </div>
    </div>
  )
})
