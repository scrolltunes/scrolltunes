"use client"

import { springs } from "@/animations"
import { ArrowRight, Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useMemo } from "react"
import type { LyricLine } from "../types"

interface LineSelectionViewProps {
  readonly lines: readonly LyricLine[]
  readonly selectedIds: ReadonlySet<string>
  readonly onToggle: (id: string) => void
  readonly onContinue: () => void
  readonly isRTL: boolean
}

export const LineSelectionView = memo(function LineSelectionView({
  lines,
  selectedIds,
  onToggle,
  onContinue,
  isRTL,
}: LineSelectionViewProps) {
  const selectableLines = useMemo(
    () => lines.filter(line => line.text.trim() !== "" && line.text.trim() !== "♪"),
    [lines],
  )

  const selectedCount = selectedIds.size

  return (
    <div className="flex h-full flex-col">
      {/* Instruction */}
      <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="text-sm" style={{ color: "var(--color-text3)" }}>
          Tap lines to include in your card
        </p>
      </div>

      {/* Line list */}
      <div
        className="flex-1 overflow-y-auto p-4"
        dir={isRTL ? "rtl" : undefined}
      >
        <div className="space-y-1">
          {selectableLines.map(line => {
            const isSelected = selectedIds.has(line.id)
            return (
              <button
                key={line.id}
                type="button"
                onClick={() => onToggle(line.id)}
                dir={isRTL ? "rtl" : undefined}
                className={`relative w-full rounded-lg px-3 py-2.5 transition-colors ${
                  isRTL ? "text-right" : "text-left"
                }`}
                style={{
                  background: isSelected ? "var(--color-accent-soft)" : "transparent",
                  color: isSelected ? "var(--color-text)" : "var(--color-text2)",
                }}
              >
                <div className="flex w-full items-start gap-3">
                  <div
                    className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors"
                    style={{
                      borderColor: isSelected ? "var(--color-accent)" : "var(--color-border)",
                      background: isSelected ? "var(--color-accent)" : "transparent",
                    }}
                  >
                    {isSelected && <Check size={12} weight="bold" style={{ color: "white" }} />}
                  </div>
                  <span className="text-sm leading-relaxed">{line.text}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Continue button */}
      <div
        className="shrink-0 p-4 pb-safe"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <motion.button
          type="button"
          onClick={onContinue}
          disabled={selectedCount === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--color-accent)", color: "white" }}
          whileTap={{ scale: 0.98 }}
          transition={springs.cardPress}
        >
          Continue
          <ArrowRight size={20} weight="bold" />
        </motion.button>
        {selectedCount > 0 && (
          <p className="mt-2 text-center text-xs" style={{ color: "var(--color-text3)" }}>
            {selectedCount} {selectedCount === 1 ? "line" : "lines"} selected
          </p>
        )}
      </div>
    </div>
  )
})
