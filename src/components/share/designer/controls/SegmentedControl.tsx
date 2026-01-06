"use client"

import { motion } from "motion/react"
import { memo, type ReactNode, useId } from "react"

export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly icon?: ReactNode
}

export interface SegmentedControlProps<T extends string> {
  readonly label?: string
  readonly options: readonly SegmentedOption<T>[]
  readonly value: T
  readonly onChange: (value: T) => void
  readonly size?: "sm" | "md"
  readonly disabled?: boolean
}

function SegmentedControlInner<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
}: SegmentedControlProps<T>) {
  const groupId = useId()

  const sizeStyles = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span
          className="text-xs font-medium"
          style={{ color: "var(--color-text2)" }}
        >
          {label}
        </span>
      )}
      <div
        className="inline-flex rounded-lg p-0.5"
        style={{ background: "var(--color-surface2)" }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map(option => {
          const isSelected = option.value === value
          const optionId = `${groupId}-${option.value}`

          return (
            <button
              key={option.value}
              id={optionId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`
                relative flex items-center justify-center gap-1.5
                ${sizeStyles[size]}
                rounded-md font-medium
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                focus-visible:ring-offset-transparent
                disabled:cursor-not-allowed disabled:opacity-50
              `}
              style={{
                color: isSelected ? "white" : "var(--color-text3)",
                minWidth: size === "sm" ? 32 : 40,
              }}
            >
              {isSelected && (
                <motion.div
                  layoutId={`${groupId}-bg`}
                  className="absolute inset-0 rounded-md"
                  style={{ background: "var(--color-accent)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1">
                {option.icon}
                {option.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const SegmentedControl = memo(SegmentedControlInner) as typeof SegmentedControlInner
