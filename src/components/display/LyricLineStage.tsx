"use client"

import { memo } from "react"

export type LineRole = "current" | "next" | "context"

export interface LyricLineStageProps {
  readonly id: string
  readonly text: string
  readonly role: LineRole
  readonly onClick?: () => void
  readonly fontSize?: number
  readonly isSelecting?: boolean
  readonly isSelected?: boolean
  readonly onSelect?: () => void
  readonly innerRef?: (el: HTMLButtonElement | null) => void
}

const roleStyles: Record<LineRole, { weight: number; opacity: number; scale: number }> = {
  current: { weight: 800, opacity: 1, scale: 1 },
  next: { weight: 650, opacity: 0.82, scale: 0.85 },
  context: { weight: 550, opacity: 0.48, scale: 0.7 },
}

export const LyricLineStage = memo(function LyricLineStage({
  id,
  text,
  role,
  onClick,
  fontSize = 32,
  isSelecting = false,
  isSelected = false,
  onSelect,
  innerRef,
}: LyricLineStageProps) {
  const styles = roleStyles[role]
  const actualFontSize = fontSize * styles.scale

  if (!text.trim()) {
    return (
      <div
        className="py-4 text-center"
        style={{ color: "var(--stage-text3)", fontSize: actualFontSize }}
        aria-hidden="true"
      >
        ♪
      </div>
    )
  }

  const isCurrent = role === "current"
  const handleClick = isSelecting ? onSelect : onClick

  return (
    <button
      ref={innerRef}
      type="button"
      onClick={handleClick}
      className="relative w-full text-center px-6 py-4 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-bg)] transition-opacity duration-200"
      style={{ opacity: styles.opacity }}
      aria-current={isCurrent ? "true" : undefined}
      aria-pressed={isSelecting ? isSelected : undefined}
      aria-label={text}
      data-line-id={id}
      data-role={role}
    >
      {/* Selection highlight */}
      {isSelected && (
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: "color-mix(in srgb, var(--stage-accent) 20%, transparent)",
            border: "2px solid var(--stage-accent)",
          }}
        />
      )}

      {/* Reading rail for current line (only when not selecting) */}
      {isCurrent && !isSelecting && (
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: "color-mix(in srgb, var(--stage-accent) 12%, transparent)",
            border: "1px solid var(--stage-border-strong)",
          }}
        />
      )}

      <span
        className="relative z-10 block leading-relaxed"
        style={{
          fontSize: actualFontSize,
          fontWeight: styles.weight,
          color: isCurrent ? "var(--stage-text)" : "var(--stage-text2)",
        }}
      >
        {text}
      </span>
    </button>
  )
})
