"use client"

import type { GradientOption } from "@/lib/colors"
import { memo } from "react"
import { BackgroundControls, TypographyControls } from "../../designer/controls"
import type { BackgroundConfig, TypographyConfig } from "../../designer/types"

// ============================================================================
// Types
// ============================================================================

export interface StylePanelProps {
  readonly background: BackgroundConfig
  readonly typography: TypographyConfig
  readonly gradientPalette: readonly GradientOption[]
  readonly hasAlbumArt: boolean
  readonly onBackgroundChange: (config: BackgroundConfig) => void
  readonly onTypographyChange: (config: Partial<TypographyConfig>) => void
  readonly onRegeneratePattern?: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Style panel for expanded mode.
 * Combines BackgroundControls and TypographyControls with consistent panel styling.
 */
export const StylePanel = memo(function StylePanel({
  background,
  typography,
  gradientPalette,
  hasAlbumArt,
  onBackgroundChange,
  onTypographyChange,
  onRegeneratePattern,
}: StylePanelProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <BackgroundControls
        background={background}
        gradientPalette={gradientPalette}
        hasAlbumArt={hasAlbumArt}
        onBackgroundChange={onBackgroundChange}
        {...(onRegeneratePattern !== undefined && { onRegeneratePattern })}
      />
      <div className="pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        <TypographyControls typography={typography} onTypographyChange={onTypographyChange} />
      </div>
    </div>
  )
})
