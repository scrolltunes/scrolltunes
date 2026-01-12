"use client"

import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { motion, useReducedMotion } from "motion/react"
import { memo, useCallback } from "react"

import { useHaptic, useIsMobile } from "@/hooks"

export interface PageNavigationArrowsProps {
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly hasPrev: boolean
  readonly hasNext: boolean
  readonly className?: string
}

/**
 * Navigation arrows for page-based navigation in Score Book mode
 *
 * - Desktop: always visible, 48px icons, subtle background on hover
 * - Mobile: semi-transparent (50% opacity), smaller (32px), overlay on edges
 * - Respects reduced motion preferences
 * - Provides haptic feedback on tap
 */
export const PageNavigationArrows = memo(function PageNavigationArrows({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  className = "",
}: PageNavigationArrowsProps) {
  const isMobile = useIsMobile()
  const prefersReducedMotion = useReducedMotion()
  const { haptic } = useHaptic()

  const handlePrev = useCallback(() => {
    if (!hasPrev) return
    haptic("light")
    onPrev()
  }, [hasPrev, haptic, onPrev])

  const handleNext = useCallback(() => {
    if (!hasNext) return
    haptic("light")
    onNext()
  }, [hasNext, haptic, onNext])

  // Icon and button sizes based on device
  const iconSize = isMobile ? 32 : 48
  const buttonSize = isMobile ? "w-12 h-12" : "w-14 h-14"

  // Animation config - disable scale animations for reduced motion
  const hoverScale = prefersReducedMotion ? 1 : 1.1
  const tapScale = prefersReducedMotion ? 1 : 0.9
  const transition = prefersReducedMotion
    ? { duration: 0.15 }
    : { type: "spring", stiffness: 400, damping: 25 }

  // Base button styles
  const baseButtonStyles = `
    ${buttonSize}
    rounded-full
    flex items-center justify-center
    transition-colors
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    focus-visible:ring-offset-transparent focus-visible:ring-white/30
  `

  // Mobile: semi-transparent overlay
  // Desktop: subtle background on hover
  const enabledStyles = isMobile
    ? "bg-black/30 text-white/50 hover:bg-black/40 hover:text-white/70"
    : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/90"

  const disabledStyles = "opacity-30 pointer-events-none cursor-default"

  return (
    <div
      className={`absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none ${className}`}
      aria-label="Page navigation"
    >
      {/* Previous page button */}
      {hasPrev ? (
        <motion.button
          type="button"
          className={`${baseButtonStyles} ${enabledStyles} pointer-events-auto ml-2`}
          onClick={handlePrev}
          whileHover={{ scale: hoverScale }}
          whileTap={{ scale: tapScale }}
          transition={transition}
          aria-label="Previous page"
        >
          <CaretLeft size={iconSize} weight="bold" />
        </motion.button>
      ) : (
        <button
          type="button"
          className={`${baseButtonStyles} ${disabledStyles} ml-2`}
          disabled
          aria-label="Previous page"
          aria-disabled="true"
        >
          <CaretLeft size={iconSize} weight="bold" />
        </button>
      )}

      {/* Next page button */}
      {hasNext ? (
        <motion.button
          type="button"
          className={`${baseButtonStyles} ${enabledStyles} pointer-events-auto mr-2`}
          onClick={handleNext}
          whileHover={{ scale: hoverScale }}
          whileTap={{ scale: tapScale }}
          transition={transition}
          aria-label="Next page"
        >
          <CaretRight size={iconSize} weight="bold" />
        </motion.button>
      ) : (
        <button
          type="button"
          className={`${baseButtonStyles} ${disabledStyles} mr-2`}
          disabled
          aria-label="Next page"
          aria-disabled="true"
        >
          <CaretRight size={iconSize} weight="bold" />
        </button>
      )}
    </div>
  )
})
