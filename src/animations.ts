// Animation configuration for ScrollTunes
// Reference: kitlangton/visual-effect animations.ts

// Default spring for MotionConfig wrapper
export const defaultSpring = {
  type: "spring" as const,
  mass: 1,
  stiffness: 200,
  damping: 2 * Math.sqrt(200), // ≈ 28.28 (critical damping)
  bounce: 0,
}

// Spring presets for different animations
export const springs = {
  // Default spring for general animations
  default: {
    type: "spring" as const,
    stiffness: 180,
    damping: 25,
    mass: 0.8,
  },
  // Bouncy spring for completion/success animations
  bouncy: {
    type: "spring" as const,
    bounce: 0.3,
    visualDuration: 0.5,
  },
  // Smooth scroll animation - responsive feel for mobile touch scrolling
  scroll: {
    type: "spring" as const,
    stiffness: 200,
    damping: 28,
    mass: 0.5,
  },
  // Lyric highlight animation
  lyricHighlight: {
    type: "spring" as const,
    stiffness: 260,
    damping: 18,
  },
  // Quick snap for UI elements
  snap: {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
  },
}

// Timing-based animations (non-spring)
export const timing = {
  fade: {
    duration: 0.2,
    ease: "easeOut" as const,
  },
  scroll: {
    duration: 0.3,
    ease: [0.4, 0, 0.6, 1] as const,
  },
  pulse: {
    duration: 1.5,
    repeat: Number.POSITIVE_INFINITY,
    ease: "easeInOut" as const,
  },
}

// Color values for animations
export const colors = {
  highlight: "rgba(99, 102, 241, 0.3)",
  activeGlow: "rgba(99, 102, 241, 0.5)",
  success: "rgba(34, 197, 94, 0.5)",
  error: "rgba(239, 68, 68, 0.5)",
}
