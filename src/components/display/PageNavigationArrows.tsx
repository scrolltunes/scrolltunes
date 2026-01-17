"use client"

import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { memo, useCallback } from "react"

import { useHaptic, useIsMobile } from "@/hooks"

export interface PageNavigationArrowsProps {
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly hasPrev: boolean
  readonly hasNext: boolean
  readonly className?: string
  readonly visible?: boolean
  readonly isRTL?: boolean
}

/**
 * Navigation arrows for page-based navigation in Score Book mode
 *
 * - Desktop: always visible, subtle background on hover
 * - Mobile: hidden by default, shown on tap with fade animation
 * - Respects reduced motion preferences
 * - Provides haptic feedback on tap
 */
export const PageNavigationArrows = memo(function PageNavigationArrows({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  className = "",
  visible = true,
  isRTL = false,
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

  // Icon and button sizes - smaller and more subtle
  const iconSize = isMobile ? 24 : 32
  const buttonSize = isMobile ? "w-10 h-10" : "w-12 h-12"

  // Animation config - disable scale animations for reduced motion
  const hoverScale = prefersReducedMotion ? 1 : 1.05
  const tapScale = prefersReducedMotion ? 1 : 0.95
  const transition = prefersReducedMotion
    ? { duration: 0.15 }
    : { type: "spring", stiffness: 400, damping: 25 }

  // Base button styles - very minimal
  const baseButtonStyles = `
    ${buttonSize}
    rounded-full
    flex items-center justify-center
    transition-all duration-200
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    focus-visible:ring-offset-transparent focus-visible:ring-white/20
  `

  // Styling - more visible on mobile when shown
  const enabledStyles = isMobile
    ? "bg-black/40 text-white/70 active:bg-black/50 active:text-white/90"
    : "bg-transparent text-white/30 hover:bg-white/5 hover:text-white/60"

  const leftAction = isRTL ? "next" : "prev"
  const rightAction = isRTL ? "prev" : "next"

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none ${className}`}
          aria-label="Page navigation"
        >
          {/* Left navigation button */}
          {leftAction === "prev" ? (
            hasPrev ? (
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
              <div className={`${buttonSize} ml-2`} />
            )
          ) : hasNext ? (
            <motion.button
              type="button"
              className={`${baseButtonStyles} ${enabledStyles} pointer-events-auto ml-2`}
              onClick={handleNext}
              whileHover={{ scale: hoverScale }}
              whileTap={{ scale: tapScale }}
              transition={transition}
              aria-label="Next page"
            >
              <CaretLeft size={iconSize} weight="bold" />
            </motion.button>
          ) : (
            <div className={`${buttonSize} ml-2`} />
          )}

          {/* Right navigation button */}
          {rightAction === "next" ? (
            hasNext ? (
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
              <div className={`${buttonSize} mr-2`} />
            )
          ) : hasPrev ? (
            <motion.button
              type="button"
              className={`${baseButtonStyles} ${enabledStyles} pointer-events-auto mr-2`}
              onClick={handlePrev}
              whileHover={{ scale: hoverScale }}
              whileTap={{ scale: tapScale }}
              transition={transition}
              aria-label="Previous page"
            >
              <CaretRight size={iconSize} weight="bold" />
            </motion.button>
          ) : (
            <div className={`${buttonSize} mr-2`} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
})
