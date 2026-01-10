"use client"

import { memo, useCallback, useId } from "react"

export interface SliderProps {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step?: number
  readonly onChange: (value: number) => void
  readonly formatValue?: (value: number) => string
  readonly disabled?: boolean
}

export const Slider = memo(function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  disabled = false,
}: SliderProps) {
  const id = useId()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value))
    },
    [onChange],
  )

  const displayValue = formatValue ? formatValue(value) : value.toString()
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
          {label}
        </label>
        <span className="text-xs tabular-nums" style={{ color: "var(--color-text3)" }}>
          {displayValue}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="slider-input w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${percentage}%, var(--color-surface3) ${percentage}%, var(--color-surface3) 100%)`,
          }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={displayValue}
        />
      </div>
      <style jsx>{`
        .slider-input::-webkit-slider-thumb {
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
        .slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }
        .slider-input::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }
        .slider-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .slider-input:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
        }
        .slider-input:disabled::-moz-range-thumb {
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
})
