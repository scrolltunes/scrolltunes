"use client"

import { memo } from "react"
import { TemplateGallery } from "../../designer/TemplateGallery"

// ============================================================================
// Types
// ============================================================================

export interface TemplatesPanelProps {
  readonly selectedTemplateId: string | null
  readonly onSelect: (templateId: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Templates panel for expanded mode.
 * Wraps TemplateGallery with consistent panel styling.
 */
export const TemplatesPanel = memo(function TemplatesPanel({
  selectedTemplateId,
  onSelect,
}: TemplatesPanelProps) {
  return (
    <div className="w-full">
      <TemplateGallery
        selectedTemplateId={selectedTemplateId}
        onSelect={onSelect}
        showCategoryFilter
      />
    </div>
  )
})
