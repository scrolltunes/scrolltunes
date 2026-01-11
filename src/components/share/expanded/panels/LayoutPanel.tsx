"use client"

import { memo } from "react"
import { LayoutControls } from "../../designer/controls"
import type { AspectRatioConfig } from "../../designer/types"

// ============================================================================
// Types
// ============================================================================

export interface LayoutPanelProps {
  readonly aspectRatio: AspectRatioConfig
  readonly padding: number
  readonly onAspectRatioChange: (config: AspectRatioConfig) => void
  readonly onPaddingChange: (padding: number) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Layout panel for expanded mode.
 * Wraps LayoutControls with consistent panel styling.
 */
export const LayoutPanel = memo(function LayoutPanel({
  aspectRatio,
  padding,
  onAspectRatioChange,
  onPaddingChange,
}: LayoutPanelProps) {
  return (
    <div className="w-full">
      <LayoutControls
        aspectRatio={aspectRatio}
        padding={padding}
        onAspectRatioChange={onAspectRatioChange}
        onPaddingChange={onPaddingChange}
      />
    </div>
  )
})
