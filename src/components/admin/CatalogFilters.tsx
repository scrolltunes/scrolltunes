"use client"

import { springs } from "@/animations"
import type { CatalogFilter } from "@/hooks/useAdminCatalog"
import { motion } from "motion/react"

// ============================================================================
// Filter Chip Component
// ============================================================================

interface FilterChipProps {
  label: string
  value: CatalogFilter
  activeFilter: CatalogFilter
  onClick: (filter: CatalogFilter) => void
  count?: number | undefined
  warning?: boolean | undefined
}

function FilterChip({ label, value, activeFilter, onClick, count, warning }: FilterChipProps) {
  const isActive = activeFilter === value

  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap"
      style={
        isActive
          ? warning
            ? { background: "var(--color-warning)", color: "var(--color-background)" }
            : { background: "var(--color-accent)", color: "white" }
          : { background: "var(--color-surface2)", color: "var(--color-text3)" }
      }
    >
      {label}
      {count !== undefined && <span className="ml-1.5 opacity-70">({count})</span>}
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface FilterCount {
  all: number
  missing_bpm: number
  missing_enhancement: number
  missing_spotify: number
}

interface CatalogFiltersProps {
  filter: CatalogFilter
  onFilterChange: (filter: CatalogFilter) => void
  counts?: FilterCount
}

export function CatalogFilters({ filter, onFilterChange, counts }: CatalogFiltersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-hide"
    >
      <FilterChip
        label="All"
        value="all"
        activeFilter={filter}
        onClick={onFilterChange}
        count={counts?.all}
      />
      <FilterChip
        label="Missing BPM"
        value="missing_bpm"
        activeFilter={filter}
        onClick={onFilterChange}
        count={counts?.missing_bpm}
        warning
      />
      <FilterChip
        label="Missing Enhancement"
        value="missing_enhancement"
        activeFilter={filter}
        onClick={onFilterChange}
        count={counts?.missing_enhancement}
      />
      <FilterChip
        label="No Spotify"
        value="missing_spotify"
        activeFilter={filter}
        onClick={onFilterChange}
        count={counts?.missing_spotify}
      />
    </motion.div>
  )
}
