"use client"

import { motion } from "motion/react"
import { forwardRef, type ReactNode } from "react"

export interface IconButtonProps {
  readonly children: ReactNode
  readonly variant?: "default" | "ghost" | "accent"
  readonly size?: "sm" | "md" | "lg"
  readonly label?: string
  readonly className?: string
  readonly disabled?: boolean
  readonly onClick?: () => void
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, variant = "default", size = "md", label, className = "", disabled, onClick },
  ref,
) {
  const sizeStyles = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  }

  const variantStyles = {
    default: {
      background: "var(--color-surface2)",
      color: "var(--color-text2)",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text3)",
    },
    accent: {
      background: "var(--color-accent-soft)",
      color: "var(--color-accent)",
    },
  }

  const style = variantStyles[variant]

  if (disabled) {
    return (
      <button
        ref={ref}
        type="button"
        className={`
          ${sizeStyles[size]}
          rounded-full
          flex items-center justify-center
          transition-colors
          opacity-40 cursor-not-allowed
          focus:outline-none
          ${className}
        `}
        style={style}
        disabled
        aria-label={label}
      >
        {children}
      </button>
    )
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`
        ${sizeStyles[size]}
        rounded-full
        flex items-center justify-center
        transition-colors
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-offset-transparent
        ${className}
      `}
      style={style}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
})

export default IconButton
