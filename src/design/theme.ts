/**
 * ScrollTunes Design System - Studio Pro Dark Theme
 */

// Generated from tokens.json - keep in sync
export const theme = {
  colors: {
    // Backgrounds
    bg: "#070A12",
    surface1: "#0C1220",
    surface2: "#111A2C",
    surface3: "#151F33",
    surfaceElevated: "#1A2540",

    // Text hierarchy
    text: "#F3F5F7",
    text2: "rgba(243, 245, 247, 0.72)",
    text3: "rgba(243, 245, 247, 0.46)",
    textMuted: "rgba(243, 245, 247, 0.28)",

    // Primary accent
    accent: "#5B6CFF",
    accentHover: "#6F7DFF",
    accentSoft: "rgba(91, 108, 255, 0.14)",
    accentGlow: "rgba(91, 108, 255, 0.25)",

    // Semantic colors
    success: "#22C55E",
    successSoft: "rgba(34, 197, 94, 0.14)",
    warning: "#FBBF24",
    warningSoft: "rgba(251, 191, 36, 0.14)",
    danger: "#FB7185",
    dangerSoft: "rgba(251, 113, 133, 0.14)",

    // Special
    chord: "#FBBF24",
    chordSoft: "rgba(251, 191, 36, 0.14)",

    // Borders
    border: "rgba(255, 255, 255, 0.10)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    borderFocus: "rgba(91, 108, 255, 0.50)",
  },

  shadows: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    md: "0 4px 12px rgba(0, 0, 0, 0.4)",
    lg: "0 8px 24px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(91, 108, 255, 0.15)",
    glowActive: "0 0 30px rgba(91, 108, 255, 0.25)",
  },

  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 9999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    "2xl": 48,
    "3xl": 64,
  },

  typography: {
    fontFamily: {
      ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      "2xl": 24,
      "3xl": 30,
      "4xl": 36,
      "5xl": 48,
      "6xl": 60,
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    },
    lineHeight: {
      tight: 1.2,
      snug: 1.3,
      normal: 1.5,
      relaxed: 1.625,
    },
    letterSpacing: {
      tight: "-0.02em",
      normal: "0",
      wide: "0.03em",
      wider: "0.05em",
    },
  },

  animation: {
    duration: {
      instant: 0,
      fast: 150,
      normal: 250,
      slow: 400,
      slower: 600,
    },
    easing: {
      default: "cubic-bezier(0.4, 0, 0.2, 1)",
      in: "cubic-bezier(0.4, 0, 1, 1)",
      out: "cubic-bezier(0, 0, 0.2, 1)",
      inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
  },

  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
  },

  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    overlay: 30,
    modal: 40,
    popover: 50,
    tooltip: 60,
  },

  // Performance-specific settings
  performance: {
    /** Where the active lyric line should be positioned (0-1, from top) */
    lyricsFocusPosition: 0.15,
    /** Opacity of the reading rail background */
    readingRailOpacity: 0.08,
    /** Auto-hide controls after this many ms */
    controlAutoHideMs: 3000,
    /** Minimum touch target size in px */
    touchTargetMin: 44,
    /** Primary button size in px */
    primaryButtonSize: 56,
  },
} as const

// Type exports
export type ThemeColors = typeof theme.colors
export type ThemeSpacing = typeof theme.spacing
export type ThemeRadius = typeof theme.radius

// CSS custom properties generator
export function generateCSSVariables(): string {
  const lines: string[] = []

  // Colors
  for (const [key, value] of Object.entries(theme.colors)) {
    lines.push(`--color-${key}: ${value};`)
  }

  // Shadows
  for (const [key, value] of Object.entries(theme.shadows)) {
    lines.push(`--shadow-${key}: ${value};`)
  }

  // Radius
  for (const [key, value] of Object.entries(theme.radius)) {
    lines.push(`--radius-${key}: ${value}px;`)
  }

  // Spacing
  for (const [key, value] of Object.entries(theme.spacing)) {
    lines.push(`--spacing-${key}: ${value}px;`)
  }

  return lines.join("\n  ")
}

// Spring animations for Motion
export const springs = {
  // Default spring for general animations
  default: {
    type: "spring" as const,
    stiffness: 180,
    damping: 25,
    mass: 0.8,
  },

  // Spotlight effect for active lyric line
  spotlight: {
    type: "spring" as const,
    stiffness: 300,
    damping: 22,
    mass: 0.6,
  },

  // Subtle background transitions
  ambient: {
    type: "spring" as const,
    stiffness: 80,
    damping: 20,
    mass: 1.2,
  },

  // Quick micro-interactions
  micro: {
    type: "spring" as const,
    stiffness: 500,
    damping: 35,
  },

  // Smooth scroll animation
  scroll: {
    type: "spring" as const,
    stiffness: 200,
    damping: 28,
    mass: 0.5,
  },

  // Bouncy spring for completion/success
  bouncy: {
    type: "spring" as const,
    bounce: 0.3,
    visualDuration: 0.5,
  },

  // Quick snap for UI elements
  snap: {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
  },
}

// Timing-based animations
export const timing = {
  fade: {
    duration: 0.2,
    ease: "easeOut" as const,
  },
  fadeIn: {
    duration: 0.25,
    ease: [0.4, 0, 0.2, 1] as const,
  },
  pulse: {
    duration: 1.5,
    repeat: Number.POSITIVE_INFINITY,
    ease: "easeInOut" as const,
  },
  karaokeSweep: {
    ease: "linear" as const,
  },
}
