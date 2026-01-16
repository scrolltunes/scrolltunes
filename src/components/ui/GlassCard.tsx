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
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-primary)",
      backdropFilter: "blur(8px)",
    },
    elevated: {
      background: "var(--bg-secondary)",
      border: "1px solid var(--border-secondary)",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      backdropFilter: "blur(12px)",
    },
    subtle: {
      background: "rgba(26, 27, 38, 0.6)",
      border: "1px solid var(--border-primary)",
      backdropFilter: "blur(12px)",
    },
  }

  const style = variantStyles[variant]

  if (interactive) {
    return (
      <motion.div
        ref={ref}
        className={`rounded-sm cursor-pointer ${className}`}
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
    <div ref={ref} className={`rounded-sm ${className}`} style={style}>
      {children}
    </div>
  )
})

export default GlassCard
