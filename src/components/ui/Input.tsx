"use client"

import { forwardRef } from "react"

type InputSize = "sm" | "default" | "lg"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  inputSize?: InputSize
}

const sizeStyles: Record<InputSize, string> = {
  sm: "h-8 px-2 text-sm",
  default: "h-10 px-3 text-sm",
  lg: "h-12 px-4 text-base",
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, inputSize = "default", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-")

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm text-[var(--fg-primary)]">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`
            w-full rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-default)]
            text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]
            outline-none transition-all duration-200
            focus:border-[var(--border-active)] focus:shadow-[0_0_0_2px_rgba(122,162,247,0.15)]
            disabled:cursor-not-allowed disabled:opacity-50
            ${error ? "border-[var(--status-error)] focus:border-[var(--status-error)] focus:shadow-[0_0_0_2px_rgba(247,118,142,0.15)]" : ""}
            ${sizeStyles[inputSize]}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-sm text-[var(--status-error)]">{error}</p>}
      </div>
    )
  },
)

Input.displayName = "Input"
