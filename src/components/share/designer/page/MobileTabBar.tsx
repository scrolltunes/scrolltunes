"use client"

import { Gear, Layout, ShareNetwork } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo } from "react"

type TabId = "templates" | "style" | "export"

interface Tab {
  readonly id: TabId
  readonly label: string
  readonly icon: React.ReactNode
}

const TABS: readonly Tab[] = [
  { id: "templates", label: "Templates", icon: <Layout size={20} weight="bold" /> },
  { id: "style", label: "Style", icon: <Gear size={20} weight="bold" /> },
  { id: "export", label: "Export", icon: <ShareNetwork size={20} weight="bold" /> },
]

interface MobileTabBarProps {
  readonly activeTab: TabId
  readonly onChange: (tab: TabId) => void
}

export const MobileTabBar = memo(function MobileTabBar({ activeTab, onChange }: MobileTabBarProps) {
  return (
    <div
      className="flex h-12 shrink-0"
      style={{ borderBottom: "1px solid var(--color-border)" }}
      role="tablist"
      aria-label="Customization options"
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
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
            style={{
              color: isActive ? "var(--color-accent)" : "var(--color-text3)",
            }}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
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

export type { TabId }
