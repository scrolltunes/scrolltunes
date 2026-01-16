"use client"

import { type HTMLMotionProps, motion } from "motion/react"
import { forwardRef } from "react"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost"
type ButtonSize = "sm" | "default" | "lg"

type ButtonProps = Omit<HTMLMotionProps<"button">, "ref"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

const baseStyles =
  "inline-flex items-center justify-center font-mono rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:pointer-events-none disabled:opacity-50"

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-[var(--accent-primary)] text-white hover:shadow-[0_0_20px_rgba(122,162,247,0.4)]",
  secondary:
    "bg-[var(--accent-secondary)] text-white hover:shadow-[0_0_20px_rgba(187,154,247,0.4)]",
  outline:
    "border border-[var(--accent-primary)] bg-transparent text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10",
  ghost: "bg-transparent text-[var(--fg-secondary)] hover:bg-[var(--bg-tertiary)]",
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  default: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", disabled, ...props }, ref) => {
    const classes = [baseStyles, variantStyles[variant], sizeStyles[size], className]
      .filter(Boolean)
      .join(" ")

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={disabled}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
        {...props}
      />
    )
  },
)

Button.displayName = "Button"

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }
