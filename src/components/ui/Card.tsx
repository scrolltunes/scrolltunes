"use client"

import { motion } from "motion/react"
import { type ReactNode, forwardRef } from "react"

export type CardVariant = "default" | "elevated" | "bordered"

export interface CardProps {
  readonly children: ReactNode
  readonly className?: string
  readonly variant?: CardVariant
  readonly interactive?: boolean
  readonly glowOnHover?: boolean
}

function getVariantStyles(variant: CardVariant): {
  background: string
  border: string
  boxShadow?: string
} {
  switch (variant) {
    case "elevated":
      return {
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-md)",
      }
    case "bordered":
      return {
        background: "transparent",
        border: "2px solid var(--fg-muted)",
      }
    default:
      return {
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-default)",
      }
  }
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className = "", variant = "default", interactive = false, glowOnHover = false },
  ref,
) {
  const styles = getVariantStyles(variant)

  if (interactive || glowOnHover) {
    const hoverBoxShadow = glowOnHover
      ? "0 0 30px rgba(122, 162, 247, 0.3), 0 0 60px rgba(122, 162, 247, 0.1)"
      : (styles.boxShadow ?? "none")

    const interactiveClasses = [
      "rounded-sm",
      interactive ? "cursor-pointer" : "",
      glowOnHover ? "hover:border-[var(--accent-primary)]/50" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <motion.div
        ref={ref}
        className={interactiveClasses}
        style={{
          background: styles.background,
          border: styles.border,
          ...(styles.boxShadow ? { boxShadow: styles.boxShadow } : {}),
        }}
        whileHover={{
          scale: interactive ? 1.02 : 1,
          boxShadow: hoverBoxShadow,
        }}
        whileTap={interactive ? { scale: 0.98 } : {}}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div
      ref={ref}
      className={`rounded-sm ${className}`}
      style={{
        background: styles.background,
        border: styles.border,
        ...(styles.boxShadow ? { boxShadow: styles.boxShadow } : {}),
      }}
    >
      {children}
    </div>
  )
})

export interface CardHeaderProps {
  readonly children: ReactNode
  readonly className?: string
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { children, className = "" },
  ref,
) {
  return (
    <div ref={ref} className={`px-4 py-3 border-b border-[var(--border-default)] ${className}`}>
      {children}
    </div>
  )
})

export interface CardContentProps {
  readonly children: ReactNode
  readonly className?: string
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(function CardContent(
  { children, className = "" },
  ref,
) {
  return (
    <div ref={ref} className={`px-4 py-4 ${className}`}>
      {children}
    </div>
  )
})

export interface CardFooterProps {
  readonly children: ReactNode
  readonly className?: string
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { children, className = "" },
  ref,
) {
  return (
    <div ref={ref} className={`px-4 py-3 border-t border-[var(--border-default)] ${className}`}>
      {children}
    </div>
  )
})

export default Card
