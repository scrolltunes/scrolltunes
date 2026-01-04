// Design tokens for ScrollTunes - Studio Pro Dark theme
// Reference: src/design/prototypes and src/design/ux-design-spec.md

export const theme = {
  colors: {
    // Background layers (darkest to lightest)
    bg: "#070A12",
    surface1: "#0C1220",
    surface2: "#111A2C",
    surface3: "#151F33",
    surfaceElevated: "#1A2540",

    // Text hierarchy
    textPrimary: "#F3F5F7",
    textSecondary: "rgba(243, 245, 247, 0.72)",
    textTertiary: "rgba(243, 245, 247, 0.46)",
    textMuted: "rgba(243, 245, 247, 0.28)",
    textGhost: "rgba(243, 245, 247, 0.12)",

    // Legacy aliases (for backward compatibility)
    background: "#070A12",
    surface: "#0C1220",
    elevated: "#111A2C",

    // Accent colors
    accent: "#5B6CFF",
    accentHover: "#6F7DFF",
    accentBright: "#818CF8",
    accentSoft: "rgba(91, 108, 255, 0.14)",
    accentGlow: "rgba(91, 108, 255, 0.25)",

    // Legacy primary/secondary (for backward compatibility)
    primary: "#5B6CFF",
    secondary: "#8B5CF6",

    // Semantic colors
    success: "#22C55E",
    successSoft: "rgba(34, 197, 94, 0.14)",
    warning: "#FBBF24",
    warningSoft: "rgba(251, 191, 36, 0.14)",
    danger: "#FB7185",
    dangerSoft: "rgba(251, 113, 133, 0.14)",

    // Chord display
    chord: "#FBBF24",
    chordSoft: "rgba(251, 191, 36, 0.14)",

    // Spotify brand
    spotify: "#1DB954",
    spotifySoft: "rgba(29, 185, 84, 0.14)",

    // Borders
    border: "rgba(255, 255, 255, 0.10)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
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

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 9999,
  },

  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    md: "0 4px 12px rgba(0, 0, 0, 0.4)",
    lg: "0 8px 24px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(91, 108, 255, 0.15)",
    glowActive: "0 0 30px rgba(91, 108, 255, 0.25)",
    glowChord: "0 0 20px rgba(251, 191, 36, 0.3)",
  },

  // Typography tokens for lyrics display
  lyrics: {
    fontSizeBase: 24,
    fontSizeActive: 28,
    fontSizeTablet: 28,
    fontSizeActiveTablet: 34,
    lineHeight: 1.35,
    fontWeightPast: 500,
    fontWeightUpcoming: 500,
    fontWeightNext: 600,
    fontWeightActive: 800,
  },
} as const

// Type exports for use in components
export type ThemeColors = typeof theme.colors
export type ThemeSpacing = typeof theme.spacing
export type ThemeRadius = typeof theme.radius
export type ThemeShadow = typeof theme.shadow
