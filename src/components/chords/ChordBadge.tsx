"use client"

import { motion } from "motion/react"
import { memo } from "react"

export interface ChordBadgeProps {
  readonly chord: string
  readonly isActive?: boolean
  readonly size?: "sm" | "md"
  readonly onClick?: () => void
}

type ChordType = "major" | "minor" | "seventh" | "other"

function getChordType(chord: string): ChordType {
  const suffix = chord.replace(/^[A-G][#b]?/, "")
  if (suffix.startsWith("m") && !suffix.startsWith("maj")) return "minor"
  if (suffix.includes("7")) return "seventh"
  if (suffix === "" || suffix.startsWith("maj")) return "major"
  return "other"
}

const sizeConfig = {
  sm: "px-1 text-sm",
  md: "px-2.5 py-1 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center",
} as const

const colorConfig: Record<ChordType, { base: string; active: string }> = {
  major: {
    base: "text-amber-400",
    active: "text-amber-300",
  },
  minor: {
    base: "text-amber-400",
    active: "text-amber-300",
  },
  seventh: {
    base: "text-amber-400",
    active: "text-amber-300",
  },
  other: {
    base: "text-amber-400",
    active: "text-amber-300",
  },
}

export const ChordBadge = memo(function ChordBadge({
  chord,
  isActive = false,
  size = "sm",
  onClick,
}: ChordBadgeProps) {
  const chordType = getChordType(chord)
  const colors = colorConfig[chordType]
  const sizeClasses = sizeConfig[size]
  const colorClasses = isActive ? colors.active : colors.base

  const baseClassName = `inline-flex items-center justify-center font-black transition-colors ${sizeClasses} ${colorClasses}`
  const animateProps = {
    animate: isActive ? { scale: 1.05 } : { scale: 1 },
    transition: { type: "spring" as const, stiffness: 400, damping: 20 },
  }

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={`${baseClassName} cursor-pointer hover:brightness-110 max-w-[80px] truncate`}
        aria-label={`Select chord ${chord}`}
        title={chord}
        whileTap={{ scale: 0.95 }}
        {...animateProps}
      >
        {chord}
      </motion.button>
    )
  }

  return (
    <motion.span
      className={`${baseClassName} max-w-[80px] truncate`}
      title={chord}
      {...animateProps}
    >
      {chord}
    </motion.span>
  )
})
