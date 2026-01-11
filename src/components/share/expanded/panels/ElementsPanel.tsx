"use client"

import { memo } from "react"
import { ElementsControls } from "../../designer/controls"
import type { ElementsConfig } from "../../designer/types"

// ============================================================================
// Types
// ============================================================================

type ElementKey = keyof ElementsConfig

export interface ElementsPanelProps {
  readonly elements: ElementsConfig
  readonly hasAlbumArt: boolean
  readonly hasSpotifyId: boolean
  readonly onElementChange: <K extends ElementKey>(
    element: K,
    config: Partial<ElementsConfig[K]>,
  ) => void
  readonly onToggleVisibility: (element: ElementKey) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Elements panel for expanded mode.
 * Wraps ElementsControls with consistent panel styling.
 */
export const ElementsPanel = memo(function ElementsPanel({
  elements,
  hasAlbumArt,
  hasSpotifyId,
  onElementChange,
  onToggleVisibility,
}: ElementsPanelProps) {
  return (
    <div className="w-full">
      <ElementsControls
        elements={elements}
        hasAlbumArt={hasAlbumArt}
        hasSpotifyId={hasSpotifyId}
        onElementChange={onElementChange}
        onToggleVisibility={onToggleVisibility}
      />
    </div>
  )
})
