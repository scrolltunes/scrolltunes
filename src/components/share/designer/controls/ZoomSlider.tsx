"use client"

import { Minus, Plus } from "@phosphor-icons/react"
import { memo, useCallback, useId } from "react"

export interface ZoomSliderProps {
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
}

const MIN_SCALE = 1
const MAX_SCALE = 3
const STEP = 0.1
const BUTTON_STEP = 0.1

/**
 * Zoom slider control with plus/minus buttons at ends.
 * Displays zoom percentage and allows adjustment from 100% to 300%.
 */
export const ZoomSlider = memo(function ZoomSlider({
  value,
  min = MIN_SCALE,
  max = MAX_SCALE,
  step = STEP,
  onChange,
  disabled = false,
}: ZoomSliderProps) {
  const id = useId()

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value))
    },
    [onChange],
  )

  const handleDecrement = useCallback(() => {
    const newValue = Math.max(min, value - BUTTON_STEP)
    onChange(Math.round(newValue * 100) / 100)
  }, [min, value, onChange])

  const handleIncrement = useCallback(() => {
    const newValue = Math.min(max, value + BUTTON_STEP)
    onChange(Math.round(newValue * 100) / 100)
  }, [max, value, onChange])

  const displayValue = `${Math.round(value * 100)}%`
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
          Zoom
        </label>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text3)" }}>
          {displayValue}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--color-surface3)" }}
          aria-label="Decrease zoom"
        >
          <Minus size={14} weight="bold" style={{ color: "var(--color-text2)" }} />
        </button>
        <div className="relative flex h-5 flex-1 items-center">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleSliderChange}
            disabled={disabled}
            className="zoom-slider-input h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${percentage}%, var(--color-surface3) ${percentage}%, var(--color-surface3) 100%)`,
            }}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={displayValue}
          />
        </div>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--color-surface3)" }}
          aria-label="Increase zoom"
        >
          <Plus size={14} weight="bold" style={{ color: "var(--color-text2)" }} />
        </button>
      </div>
      <style jsx>{`
        .zoom-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s ease;
        }
        .zoom-slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        .zoom-slider-input::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }
        .zoom-slider-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .zoom-slider-input:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
        }
        .zoom-slider-input:disabled::-moz-range-thumb {
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
})
