"use client"

import { Minus, Plus } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface TransposeControlProps {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
}

export const TransposeControl = memo(function TransposeControl({
  value,
  onChange,
  disabled,
}: TransposeControlProps) {
  const canDecrease = value > -12
  const canIncrease = value < 12

  const displayValue = value === 0 ? "0" : value > 0 ? `+${value}` : `${value}`

  const handleDecrease = useCallback(() => {
    if (canDecrease) onChange(value - 1)
  }, [value, onChange, canDecrease])

  const handleIncrease = useCallback(() => {
    if (canIncrease) onChange(value + 1)
  }, [value, onChange, canIncrease])

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-neutral-400">Transpose:</span>
      <motion.button
        type="button"
        onClick={handleDecrease}
        disabled={disabled || !canDecrease}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Transpose down"
        whileTap={{ scale: 0.9 }}
      >
        <Minus size={18} className="text-neutral-200" />
      </motion.button>

      <span className="w-10 text-center text-base font-mono font-medium text-neutral-100">
        {displayValue}
      </span>

      <motion.button
        type="button"
        onClick={handleIncrease}
        disabled={disabled || !canIncrease}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Transpose up"
        whileTap={{ scale: 0.9 }}
      >
        <Plus size={18} className="text-neutral-200" />
      </motion.button>
    </div>
  )
})
