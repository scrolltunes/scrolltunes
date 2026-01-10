"use client"

import { Gear, Layout, MagicWand, Sliders, Sparkle } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo } from "react"

// ============================================================================
// Types
// ============================================================================

export type ControlTabId = "templates" | "layout" | "style" | "elements" | "effects"

interface Tab {
  readonly id: ControlTabId
  readonly label: string
  readonly icon: React.ReactNode
}

const TABS: readonly Tab[] = [
  { id: "templates", label: "Templates", icon: <Layout size={20} weight="bold" /> },
  { id: "layout", label: "Layout", icon: <Sliders size={20} weight="bold" /> },
  { id: "style", label: "Style", icon: <MagicWand size={20} weight="bold" /> },
  { id: "elements", label: "Elements", icon: <Gear size={20} weight="bold" /> },
  { id: "effects", label: "Effects", icon: <Sparkle size={20} weight="bold" /> },
]

// ============================================================================
// ControlTabs Component
// ============================================================================

export interface ControlTabsProps {
  readonly activeTab: ControlTabId
  readonly onChange: (tab: ControlTabId) => void
}

/**
 * Tab navigation component for mobile expanded mode.
 * Displays five tabs (Templates, Layout, Style, Elements, Effects) with
 * horizontal scrolling on narrow screens and animated selection indicator.
 */
export const ControlTabs = memo(function ControlTabs({ activeTab, onChange }: ControlTabsProps) {
  return (
    <div
      className="flex h-12 shrink-0 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--color-border)" }}
      role="tablist"
      aria-label="Studio options"
    >
      {TABS.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-4 transition-colors"
            style={{
              color: isActive ? "var(--color-accent)" : "var(--color-text3)",
            }}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
            {isActive && (
              <motion.div
                layoutId="expanded-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--color-accent)" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
})

export { TABS as CONTROL_TABS }
