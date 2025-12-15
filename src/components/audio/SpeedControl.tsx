"use client"

import { springs } from "@/animations"
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "@/constants"
import { usePlayerControls } from "@/core"
import { Minus, Plus } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback, useState } from "react"

export interface SpeedControlProps {
  readonly className?: string
}

const STEP = 0.05

export const SpeedControl = memo(function SpeedControl({ className = "" }: SpeedControlProps) {
  const { setScrollSpeed, getScrollSpeed } = usePlayerControls()
  const [speed, setSpeed] = useState(getScrollSpeed)

  const handleSpeedChange = useCallback(
    (delta: number) => {
      const newSpeed = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, speed + delta))
      const rounded = Math.round(newSpeed * 100) / 100
      setSpeed(rounded)
      setScrollSpeed(rounded)
    },
    [speed, setScrollSpeed],
  )

  const handleDecrement = useCallback(() => handleSpeedChange(-STEP), [handleSpeedChange])
  const handleIncrement = useCallback(() => handleSpeedChange(STEP), [handleSpeedChange])

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <motion.button
        type="button"
        onClick={handleDecrement}
        disabled={speed <= MIN_SCROLL_SPEED}
        className="p-1 rounded text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
        whileTap={{ scale: 0.9 }}
        transition={springs.snap}
        aria-label="Decrease speed"
      >
        <Minus size={14} weight="bold" />
      </motion.button>
      <span className="text-xs font-medium text-neutral-300 tabular-nums w-9 text-center">
        {speed.toFixed(2)}x
      </span>
      <motion.button
        type="button"
        onClick={handleIncrement}
        disabled={speed >= MAX_SCROLL_SPEED}
        className="p-1 rounded text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
        whileTap={{ scale: 0.9 }}
        transition={springs.snap}
        aria-label="Increase speed"
      >
        <Plus size={14} weight="bold" />
      </motion.button>
    </div>
  )
})
