// Animation configuration for ScrollTunes
// Reference: src/design/prototypes and src/design/ux-design-spec.md

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
  // Lyric highlight animation - snappy but smooth
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
  // Gentle spring for ambient/background elements
  gentle: {
    type: "spring" as const,
    stiffness: 120,
    damping: 20,
    mass: 1.2,
  },
  // Modal/overlay entrance
  modal: {
    type: "spring" as const,
    stiffness: 300,
    damping: 28,
    mass: 0.9,
  },
  // Card hover/press feedback
  cardPress: {
    type: "spring" as const,
    stiffness: 500,
    damping: 30,
  },
  // Page flip animation for Score Book mode (instant, slideshow-style)
  pageFlip: {
    type: "tween" as const,
    duration: 0.08,
    ease: "easeOut" as const,
  },
}

// Timing-based animations (non-spring)
export const timing = {
  fade: {
    duration: 0.2,
    ease: "easeOut" as const,
  },
  fadeSlow: {
    duration: 0.4,
    ease: "easeInOut" as const,
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
  // Auto-hide controls delay
  autoHide: {
    duration: 0.3,
    ease: "easeOut" as const,
    delay: 3,
  },
  // Ambient orb floating animation
  ambientFloat: {
    duration: 20,
    repeat: Number.POSITIVE_INFINITY,
    ease: "linear" as const,
  },
}

// Color values for animations (using Studio Pro Dark theme tokens)
export const colors = {
  highlight: "rgba(91, 108, 255, 0.3)", // accent color
  activeGlow: "rgba(91, 108, 255, 0.5)",
  accentSoft: "rgba(91, 108, 255, 0.14)",
  success: "rgba(34, 197, 94, 0.5)",
  error: "rgba(251, 113, 133, 0.5)", // danger color
  chord: "rgba(251, 191, 36, 0.5)", // chord/warning color
  chordGlow: "rgba(251, 191, 36, 0.3)",
}

// Variant presets for common motion patterns
export const variants = {
  // Fade in from bottom (for modals, cards)
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  // Scale fade (for buttons, badges)
  scaleFade: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  // Slide up (for bottom sheets, search modal)
  slideUp: {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit: { y: "100%" },
  },
  // Stagger children (for lists)
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },
  // Lyric line states
  lyricLine: {
    past: { opacity: 0.4, scale: 1, y: 0 },
    active: { opacity: 1, scale: 1.02, y: 0 },
    upcoming: { opacity: 0.7, scale: 1, y: 0 },
  },
  // Page flip animation for Score Book mode
  pageFlip: {
    enter: { opacity: 0, x: "100%" },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: "-100%" },
  },
}

// Type exports
export type SpringPreset = keyof typeof springs
export type TimingPreset = keyof typeof timing
export type VariantPreset = keyof typeof variants
