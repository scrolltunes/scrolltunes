"use client"

import { type HTMLMotionProps, motion } from "motion/react"
import { forwardRef } from "react"

type ButtonVariant = "default" | "secondary" | "outline" | "ghost"
type ButtonSize = "sm" | "default" | "lg"

type ButtonProps = Omit<HTMLMotionProps<"button">, "ref"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

const baseStyles = [
  "inline-flex items-center justify-center gap-2",
  "font-mono font-medium tracking-wide",
  "rounded-full",
  "transition-all duration-150 ease-out",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
  "disabled:pointer-events-none disabled:opacity-50",
  "select-none",
].join(" ")

const variantStyles: Record<ButtonVariant, string> = {
  default: [
    "bg-[var(--accent-primary)] text-[var(--bg-primary)]",
    "hover:bg-[var(--accent-primary)]/90 hover:shadow-[0_0_30px_rgba(122,162,247,0.5),0_0_60px_rgba(122,162,247,0.2)]",
    "active:bg-[var(--accent-primary)]/80 active:shadow-[0_0_15px_rgba(122,162,247,0.4)]",
    "border border-[var(--accent-primary)]/50",
  ].join(" "),

  secondary: [
    "bg-[var(--bg-tertiary)] text-[var(--fg-primary)]",
    "hover:bg-[var(--bg-highlight)] hover:text-[var(--accent-tertiary)] hover:shadow-[0_0_20px_rgba(125,207,255,0.3)]",
    "active:bg-[var(--bg-secondary)]",
    "border border-[var(--border-default)]",
    "hover:border-[var(--accent-tertiary)]/50",
  ].join(" "),

  outline: [
    "bg-transparent text-[var(--accent-primary)]",
    "border-2 border-[var(--accent-primary)]/60",
    "hover:bg-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)] hover:shadow-[0_0_25px_rgba(122,162,247,0.3)]",
    "active:bg-[var(--accent-primary)]/20",
  ].join(" "),

  ghost: [
    "bg-transparent text-[var(--fg-secondary)]",
    "hover:bg-[var(--bg-tertiary)] hover:text-[var(--fg-primary)]",
    "active:bg-[var(--bg-highlight)]",
    "border border-transparent",
    "hover:border-[var(--border-muted)]",
  ].join(" "),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  default: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", fullWidth = false, disabled, ...props }, ref) => {
    const classes = [
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      fullWidth ? "w-full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={disabled}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        {...props}
      />
    )
  },
)

Button.displayName = "Button"

export { Button }
export type { ButtonProps, ButtonVariant, ButtonSize }
