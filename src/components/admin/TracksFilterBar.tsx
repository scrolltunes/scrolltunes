"use client"

import { springs } from "@/animations"
import { motion } from "motion/react"

export type TracksFilter = "all" | "missing_spotify" | "has_spotify" | "in_catalog" | "missing_bpm"

interface FilterChipProps {
  label: string
  value: TracksFilter
  activeFilter: TracksFilter
  onClick: (filter: TracksFilter) => void
}

function FilterChip({ label, value, activeFilter, onClick }: FilterChipProps) {
  const isActive = activeFilter === value

  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="px-3 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap"
      style={
        isActive
          ? { background: "var(--color-accent)", color: "white" }
          : { background: "var(--color-surface2)", color: "var(--color-text3)" }
      }
    >
      {label}
    </button>
  )
}

interface TracksFilterBarProps {
  filter: TracksFilter
  onFilterChange: (filter: TracksFilter) => void
}

export function TracksFilterBar({ filter, onFilterChange }: TracksFilterBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.default}
      className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-hide"
    >
      <FilterChip label="All" value="all" activeFilter={filter} onClick={onFilterChange} />
      <FilterChip
        label="Missing Spotify"
        value="missing_spotify"
        activeFilter={filter}
        onClick={onFilterChange}
      />
      <FilterChip
        label="Has Spotify"
        value="has_spotify"
        activeFilter={filter}
        onClick={onFilterChange}
      />
      <FilterChip
        label="In Catalog"
        value="in_catalog"
        activeFilter={filter}
        onClick={onFilterChange}
      />
      <FilterChip
        label="Missing BPM"
        value="missing_bpm"
        activeFilter={filter}
        onClick={onFilterChange}
      />
    </motion.div>
  )
}
