"use client"

import { springs } from "@/animations"
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "@/constants"
import { usePlayerControls } from "@/core"
import { Gauge } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback, useState } from "react"

export interface TempoControlProps {
  readonly className?: string
  readonly compact?: boolean
  readonly onTempoChange?: (tempo: number) => void
}

interface PresetButton {
  readonly label: string
  readonly value: number
}

const presets: readonly PresetButton[] = [
  { label: "Slower", value: 0.75 },
  { label: "Original", value: 1.0 },
  { label: "Faster", value: 1.25 },
  { label: "1.5x", value: 1.5 },
]

export const TempoControl = memo(function TempoControl({
  className = "",
  compact = false,
  onTempoChange,
}: TempoControlProps) {
  const { setScrollSpeed, getScrollSpeed } = usePlayerControls()
  const [tempo, setTempo] = useState(getScrollSpeed)

  const handleTempoChange = useCallback(
    (newTempo: number) => {
      const clampedTempo = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, newTempo))
      setTempo(clampedTempo)
      setScrollSpeed(clampedTempo)
      onTempoChange?.(clampedTempo)
    },
    [setScrollSpeed, onTempoChange],
  )

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleTempoChange(Number.parseFloat(e.target.value))
    },
    [handleTempoChange],
  )

  const handlePresetClick = useCallback(
    (value: number) => {
      handleTempoChange(value)
    },
    [handleTempoChange],
  )

  const isActivePreset = (value: number) => Math.abs(tempo - value) < 0.01

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Gauge size={18} weight="fill" className="text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200 tabular-nums w-10">
          {tempo.toFixed(2)}x
        </span>
        <input
          type="range"
          min={MIN_SCROLL_SPEED}
          max={MAX_SCROLL_SPEED}
          step={0.05}
          value={tempo}
          onChange={handleSliderChange}
          className="w-20 h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-indigo-500
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-indigo-500
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-pointer"
          aria-label="Scroll speed"
        />
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-4 p-4 bg-neutral-950 rounded-xl ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge size={24} weight="fill" className="text-indigo-400" />
          <span className="text-sm font-medium text-neutral-300">Scroll Speed</span>
        </div>
        <span className="text-lg font-semibold text-neutral-100 tabular-nums">
          {tempo.toFixed(2)}x
        </span>
      </div>

      <input
        type="range"
        min={MIN_SCROLL_SPEED}
        max={MAX_SCROLL_SPEED}
        step={0.05}
        value={tempo}
        onChange={handleSliderChange}
        className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-indigo-500
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-webkit-slider-thumb]:active:scale-95
          [&::-moz-range-thumb]:w-5
          [&::-moz-range-thumb]:h-5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-indigo-500
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:cursor-pointer"
        aria-label="Scroll speed"
      />

      <div className="flex gap-2">
        {presets.map(preset => (
          <motion.button
            key={preset.label}
            type="button"
            onClick={() => handlePresetClick(preset.value)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              ${
                isActivePreset(preset.value)
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            whileTap={{ scale: 0.95 }}
            transition={springs.snap}
            aria-label={`Set speed to ${preset.value}x`}
            aria-pressed={isActivePreset(preset.value)}
          >
            {preset.label}
          </motion.button>
        ))}
      </div>
    </div>
  )
})
