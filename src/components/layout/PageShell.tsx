"use client"

import type { ReactNode } from "react"

interface PageShellProps {
  children: ReactNode
  className?: string
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full"
  ambient?: boolean
  padding?: boolean
}

export function PageShell({
  children,
  className = "",
  maxWidth = "lg",
  ambient = false,
  padding = true,
}: PageShellProps) {
  const maxWidthClasses = {
    sm: "max-w-xl",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
    full: "max-w-full",
  }

  return (
    <main
      className={`
        min-h-screen
        ${ambient ? "ambient-bg" : ""}
        ${padding ? "px-4 py-6 pb-12" : ""}
        ${className}
      `}
    >
      <div className={`mx-auto ${maxWidthClasses[maxWidth]}`}>{children}</div>
    </main>
  )
}
