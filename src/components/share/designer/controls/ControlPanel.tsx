"use client"

import {
  CaretDown,
  Export,
  Layout,
  MagicWand,
  PaintBrush,
  Palette,
  Sparkle,
  TextT,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, type ReactNode, useCallback, useState } from "react"

export type ControlSection = "templates" | "layout" | "background" | "typography" | "elements" | "effects" | "export"

interface SectionConfig {
  readonly id: ControlSection
  readonly label: string
  readonly icon: ReactNode
}

const SECTIONS: readonly SectionConfig[] = [
  { id: "templates", label: "Templates", icon: <Sparkle size={16} /> },
  { id: "layout", label: "Layout", icon: <Layout size={16} /> },
  { id: "background", label: "Background", icon: <Palette size={16} /> },
  { id: "typography", label: "Typography", icon: <TextT size={16} /> },
  { id: "elements", label: "Elements", icon: <PaintBrush size={16} /> },
  { id: "effects", label: "Effects", icon: <MagicWand size={16} /> },
  { id: "export", label: "Export", icon: <Export size={16} /> },
] as const

export interface ControlPanelProps {
  readonly children: Partial<Record<ControlSection, ReactNode>>
  readonly defaultExpanded?: ControlSection
}

export const ControlPanel = memo(function ControlPanel({
  children,
  defaultExpanded = "templates",
}: ControlPanelProps) {
  const [expandedSection, setExpandedSection] = useState<ControlSection | null>(
    defaultExpanded,
  )

  const toggleSection = useCallback((section: ControlSection) => {
    setExpandedSection(prev => (prev === section ? null : section))
  }, [])

  return (
    <div className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
      {SECTIONS.map(section => {
        const isExpanded = expandedSection === section.id
        const content = children[section.id]

        // Skip sections without content
        if (!content) return null

        return (
          <div key={section.id} className="flex flex-col">
            {/* Section Header */}
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{
                color: isExpanded ? "var(--color-text1)" : "var(--color-text2)",
                background: isExpanded ? "var(--color-surface1)" : "transparent",
              }}
              aria-expanded={isExpanded}
              aria-controls={`section-${section.id}`}
            >
              <div className="flex items-center gap-2">
                <span
                  style={{
                    color: isExpanded
                      ? "var(--color-accent)"
                      : "var(--color-text3)",
                  }}
                >
                  {section.icon}
                </span>
                <span className="text-sm font-medium">{section.label}</span>
              </div>
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                style={{ color: "var(--color-text3)" }}
              >
                <CaretDown size={14} />
              </motion.span>
            </button>

            {/* Section Content */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  id={`section-${section.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div
                    className="px-4 py-3"
                    style={{ background: "var(--color-surface1)" }}
                  >
                    {content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
})

// ============================================================================
// Section Component - For wrapping individual control sections
// ============================================================================

export interface ControlSectionProps {
  readonly children: ReactNode
}

export const ControlSectionContent = memo(function ControlSectionContent({
  children,
}: ControlSectionProps) {
  return <div className="flex flex-col gap-4">{children}</div>
})
