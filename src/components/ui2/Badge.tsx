"use client"

import type { ReactNode } from "react"

type BadgeVariant = "default" | "success" | "warning" | "error" | "accent"

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  showStatusDot?: boolean
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--bg-tertiary)] text-[var(--fg-secondary)]",
  success: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  error: "bg-[var(--status-error-soft)] text-[var(--status-error)]",
  accent:
    "bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-primary)]",
}

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--fg-secondary)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  error: "bg-[var(--status-error)]",
  accent: "bg-[var(--accent-primary)]",
}

export function Badge({
  children,
  variant = "default",
  showStatusDot = false,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-xs uppercase tracking-wide ${variantStyles[variant]} ${className}`}
    >
      {showStatusDot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />}
      {children}
    </span>
  )
}
