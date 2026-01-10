"use client"

import { motion } from "motion/react"
import { type ReactNode, forwardRef } from "react"

export interface GlassCardProps {
  readonly children: ReactNode
  readonly className?: string
  readonly variant?: "default" | "elevated" | "subtle"
  readonly interactive?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { children, className = "", variant = "default", interactive = false },
  ref,
) {
  const variantStyles = {
    default: {
      background: "var(--color-surface1)",
      border: "1px solid var(--color-border)",
    },
    elevated: {
      background: "var(--color-surface-elevated)",
      border: "1px solid var(--color-border-strong)",
      boxShadow: "var(--shadow-md)",
    },
    subtle: {
      background: "rgba(12, 18, 32, 0.5)",
      border: "1px solid var(--color-border)",
      backdropFilter: "blur(12px)",
    },
  }

  const style = variantStyles[variant]

  if (interactive) {
    return (
      <motion.div
        ref={ref}
        className={`rounded-2xl cursor-pointer ${className}`}
        style={style}
        whileHover={{ scale: 1.02, borderColor: "var(--color-accent)" }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div ref={ref} className={`rounded-2xl ${className}`} style={style}>
      {children}
    </div>
  )
})

export default GlassCard
