"use client"

import { memo, useMemo, useState } from "react"
import { TemplateCard } from "./TemplateCard"
import {
  ALL_TEMPLATES,
  getTemplatesByCategory,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "./templates"

export interface TemplateGalleryProps {
  readonly selectedTemplateId: string | null
  readonly onSelect: (templateId: string) => void
  readonly showCategoryFilter?: boolean
}

export const TemplateGallery = memo(function TemplateGallery({
  selectedTemplateId,
  onSelect,
  showCategoryFilter = true,
}: TemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all")

  const filteredTemplates = useMemo(() => {
    if (activeCategory === "all") {
      return ALL_TEMPLATES
    }
    return getTemplatesByCategory(activeCategory)
  }, [activeCategory])

  return (
    <div className="w-full">
      {/* Category filter tabs */}
      {showCategoryFilter && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <CategoryTab
            label="All"
            isActive={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
          />
          {TEMPLATE_CATEGORIES.map(category => (
            <CategoryTab
              key={category}
              label={TEMPLATE_CATEGORY_LABELS[category]}
              isActive={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            />
          ))}
        </div>
      )}

      {/* Template grid - horizontal scroll on mobile, wrap on desktop */}
      <div className="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-x-visible">
        {filteredTemplates.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            onSelect={() => onSelect(template.id)}
          />
        ))}
      </div>

      {/* Template name display */}
      {selectedTemplateId && (
        <div className="mt-2 text-center">
          <span className="text-xs" style={{ color: "var(--color-text3)" }}>
            {ALL_TEMPLATES.find(t => t.id === selectedTemplateId)?.name ?? "Custom"}
          </span>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Category Tab Component
// ============================================================================

interface CategoryTabProps {
  readonly label: string
  readonly isActive: boolean
  readonly onClick: () => void
}

const CategoryTab = memo(function CategoryTab({ label, isActive, onClick }: CategoryTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: isActive ? "var(--color-accent)" : "var(--color-surface2)",
        color: isActive ? "white" : "var(--color-text2)",
      }}
    >
      {label}
    </button>
  )
})
