"use client"

import { motion } from "motion/react"
import { memo, useMemo } from "react"

export interface ChordBadgeProps {
  readonly chord: string
  readonly isActive?: boolean
  readonly size?: "sm" | "md"
  readonly onClick?: () => void
}

const sizeConfig = {
  sm: "px-1 text-sm",
  md: "px-2.5 py-1 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center",
} as const

export const ChordBadge = memo(function ChordBadge({
  chord,
  isActive = false,
  size = "sm",
  onClick,
}: ChordBadgeProps) {
  const sizeClasses = sizeConfig[size]

  const colorStyle = useMemo(
    () =>
      isActive
        ? { color: "var(--color-bg)", background: "var(--color-chord)" }
        : { color: "var(--color-chord)" },
    [isActive],
  )

  const baseClassName = `inline-flex items-center justify-center font-black transition-all ${sizeClasses} ${isActive ? "rounded px-1.5" : ""}`
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
        style={colorStyle}
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
      style={colorStyle}
      title={chord}
      {...animateProps}
    >
      {chord}
    </motion.span>
  )
})
