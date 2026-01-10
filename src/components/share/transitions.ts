// Share experience transition animations
// Defines animation constants and variants for compact ↔ expanded mode transitions
// Reference: specs/share-transitions.md

import type { Transition, Variants } from "motion/react"

// ============================================================================
// Constants
// ============================================================================

/** Duration for compact → expanded transition (ms) */
export const EXPAND_DURATION_MS = 300

/** Duration for expanded → compact transition (ms) */
export const COLLAPSE_DURATION_MS = 250

/** Duration for compact → expanded transition (seconds) */
export const EXPAND_DURATION = EXPAND_DURATION_MS / 1000

/** Duration for expanded → compact transition (seconds) */
export const COLLAPSE_DURATION = COLLAPSE_DURATION_MS / 1000

/** Element stagger delay (seconds) */
export const STAGGER_DELAY = 0.03

// ============================================================================
// Reduced Motion
// ============================================================================

/**
 * Check if user prefers reduced motion
 * Returns true on server or if preference is set
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Get transition config respecting reduced motion preference
 * Returns instant transition if reduced motion is preferred
 */
export function getTransition(expanding: boolean, options?: { staggerIndex?: number }): Transition {
  if (prefersReducedMotion()) {
    return { duration: 0 }
  }

  const baseDuration = expanding ? EXPAND_DURATION : COLLAPSE_DURATION
  const ease = expanding ? "easeOut" : "easeIn"
  const delay = options?.staggerIndex ? options.staggerIndex * STAGGER_DELAY : 0

  return {
    duration: baseDuration,
    ease,
    delay,
  }
}

// ============================================================================
// Transition Presets
// ============================================================================

/** Transition for expanding (compact → expanded) */
export const expandTransition: Transition = {
  duration: EXPAND_DURATION,
  ease: "easeOut",
}

/** Transition for collapsing (expanded → compact) */
export const collapseTransition: Transition = {
  duration: COLLAPSE_DURATION,
  ease: "easeIn",
}

/** Instant transition for reduced motion */
export const instantTransition: Transition = {
  duration: 0,
}

// ============================================================================
// Variants
// ============================================================================

/** Modal container variants for mode transition */
export const modalContainerVariants: Variants = {
  compact: {
    height: "auto",
    maxHeight: "90dvh",
  },
  expanded: {
    height: "100dvh",
    maxHeight: "100dvh",
  },
}

/** Quick controls fade out during expand */
export const quickControlsVariants: Variants = {
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: COLLAPSE_DURATION, ease: "easeIn" },
  },
  hidden: {
    opacity: 0,
    y: -10,
    transition: { duration: EXPAND_DURATION * 0.5, ease: "easeOut" },
  },
}

/** Tab bar fade in during expand */
export const tabBarVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: EXPAND_DURATION * 0.6,
      ease: "easeOut",
      delay: EXPAND_DURATION * 0.3,
    },
  },
}

/** Undo/redo buttons fade in during expand */
export const undoRedoVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: EXPAND_DURATION * 0.5,
      ease: "easeOut",
      delay: EXPAND_DURATION * 0.4,
    },
  },
}

/** Desktop control panel slide in from right */
export const controlPanelVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 40,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: EXPAND_DURATION,
      ease: "easeOut",
    },
  },
}

/** Staggered children container */
export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGGER_DELAY,
      delayChildren: EXPAND_DURATION * 0.2,
    },
  },
}

/** Individual staggered child */
export const staggerChildVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: EXPAND_DURATION * 0.6,
      ease: "easeOut",
    },
  },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create variants with reduced motion support
 * Returns static variants if reduced motion is preferred
 */
export function createReducedMotionVariants(variants: Variants): Variants {
  if (prefersReducedMotion()) {
    const reducedVariants: Variants = {}
    for (const key of Object.keys(variants)) {
      const variant = variants[key]
      if (variant === undefined) continue
      if (typeof variant === "object" && variant !== null) {
        // Keep position/size properties, remove animations
        const { transition, ...rest } = variant as Record<string, unknown>
        reducedVariants[key] = {
          ...rest,
          transition: { duration: 0 },
        }
      } else {
        reducedVariants[key] = variant
      }
    }
    return reducedVariants
  }
  return variants
}

/**
 * Get animation state based on mode
 */
export function getModeAnimationState(mode: "compact" | "expanded"): string {
  return mode === "expanded" ? "visible" : "hidden"
}

/**
 * Calculate modal dimensions for animation
 * Returns CSS classes for the current mode
 */
export function getModalClasses(mode: "compact" | "expanded"): string {
  if (mode === "expanded") {
    return "h-[100dvh] max-h-[100dvh] sm:mx-4 sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-5xl sm:rounded-2xl"
  }
  return "max-h-[90dvh] rounded-t-2xl sm:mx-4 sm:max-w-xl sm:rounded-2xl"
}
