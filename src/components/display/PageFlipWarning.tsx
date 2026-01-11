"use client"

import { springs, timing } from "@/animations"
import { AnimatePresence, motion } from "motion/react"
import { memo } from "react"

export interface PageFlipWarningProps {
  readonly visible: boolean
  readonly onTap?: () => void
}

/**
 * Banner warning when page flip is imminent in Score Book mode
 *
 * Displays "Next page ready" with gentle pulse animation
 * Positioned at bottom of lyrics area with semi-transparent background
 */
export const PageFlipWarning = memo(function PageFlipWarning({
  visible,
  onTap,
}: PageFlipWarningProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(var(--color-accent-rgb, 91, 108, 255), 0.15)",
            color: "var(--color-accent, #5b6cff)",
            border: "1px solid rgba(var(--color-accent-rgb, 91, 108, 255), 0.3)",
          }}
          onClick={onTap}
          initial={{ opacity: 0, y: 20, x: "-50%" }}
          animate={{
            opacity: [0.7, 1, 0.7],
            y: 0,
            x: "-50%",
          }}
          exit={{ opacity: 0, y: 20, x: "-50%" }}
          transition={{
            opacity: {
              duration: timing.pulse.duration,
              repeat: timing.pulse.repeat,
              ease: timing.pulse.ease,
            },
            y: springs.default,
            x: { duration: 0 },
          }}
          aria-label="Next page ready, tap to flip"
        >
          Next page ready
        </motion.button>
      )}
    </AnimatePresence>
  )
})
