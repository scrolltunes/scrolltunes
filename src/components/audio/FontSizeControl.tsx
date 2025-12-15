"use client"

import { springs } from "@/animations"
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_STEP,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  preferencesStore,
  usePreference,
} from "@/core"
import { Minus, Plus, TextAa } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface FontSizeControlProps {
  readonly className?: string
  readonly compact?: boolean
  readonly onFontSizeChange?: (fontSize: number) => void
}

export const FontSizeControl = memo(function FontSizeControl({
  className = "",
  compact = false,
  onFontSizeChange,
}: FontSizeControlProps) {
  const fontSize = usePreference("fontSize")

  const handleFontSizeChange = useCallback(
    (newSize: number) => {
      const clampedSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, newSize))
      preferencesStore.setFontSize(clampedSize)
      onFontSizeChange?.(clampedSize)
    },
    [onFontSizeChange],
  )

  const handleDecrease = useCallback(() => {
    handleFontSizeChange(fontSize - FONT_SIZE_STEP)
  }, [fontSize, handleFontSizeChange])

  const handleIncrease = useCallback(() => {
    handleFontSizeChange(fontSize + FONT_SIZE_STEP)
  }, [fontSize, handleFontSizeChange])

  const handleReset = useCallback(() => {
    handleFontSizeChange(DEFAULT_FONT_SIZE)
  }, [handleFontSizeChange])

  const isAtMin = fontSize <= MIN_FONT_SIZE
  const isAtMax = fontSize >= MAX_FONT_SIZE
  const isDefault = fontSize === DEFAULT_FONT_SIZE

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <TextAa size={18} weight="fill" className="text-neutral-400" />
        <motion.button
          type="button"
          onClick={handleDecrease}
          disabled={isAtMin}
          className="p-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 
            disabled:opacity-50 disabled:cursor-not-allowed"
          whileTap={{ scale: 0.9 }}
          transition={springs.snap}
          aria-label="Decrease font size"
        >
          <Minus size={14} weight="bold" />
        </motion.button>
        <span className="text-sm font-medium text-neutral-200 tabular-nums w-8 text-center">
          {fontSize}
        </span>
        <motion.button
          type="button"
          onClick={handleIncrease}
          disabled={isAtMax}
          className="p-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 
            disabled:opacity-50 disabled:cursor-not-allowed"
          whileTap={{ scale: 0.9 }}
          transition={springs.snap}
          aria-label="Increase font size"
        >
          <Plus size={14} weight="bold" />
        </motion.button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-4 p-4 bg-neutral-950 rounded-xl ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TextAa size={24} weight="fill" className="text-indigo-400" />
          <span className="text-sm font-medium text-neutral-300">Font Size</span>
        </div>
        <span className="text-lg font-semibold text-neutral-100 tabular-nums">{fontSize}px</span>
      </div>

      <div className="flex items-center gap-3">
        <motion.button
          type="button"
          onClick={handleDecrease}
          disabled={isAtMin}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          whileTap={{ scale: 0.9 }}
          transition={springs.snap}
          aria-label="Decrease font size"
        >
          <Minus size={20} weight="bold" />
        </motion.button>

        <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-150"
            style={{
              width: `${((fontSize - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100}%`,
            }}
          />
        </div>

        <motion.button
          type="button"
          onClick={handleIncrease}
          disabled={isAtMax}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 
            disabled:opacity-50 disabled:cursor-not-allowed
            focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          whileTap={{ scale: 0.9 }}
          transition={springs.snap}
          aria-label="Increase font size"
        >
          <Plus size={20} weight="bold" />
        </motion.button>
      </div>

      <motion.button
        type="button"
        onClick={handleReset}
        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          ${
            isDefault
              ? "bg-indigo-600 text-white"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        whileTap={{ scale: 0.95 }}
        transition={springs.snap}
        aria-label="Reset font size to 24px"
        aria-pressed={isDefault}
      >
        Reset
      </motion.button>
    </div>
  )
})
