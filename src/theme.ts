// Design tokens for ScrollTunes
// Tokyo Night backgrounds with optimized colors for contrast

export const theme = {
  colors: {
    // Background layers (Tokyo Night)
    bg: "#1a1b26",
    surface1: "#24283b",
    surface2: "#2f3449",
    surface3: "#3d4259",
    surfaceElevated: "#24283b",

    // Text hierarchy - optimized for Tokyo Night
    textPrimary: "#F3F5F7",
    textSecondary: "rgba(243, 245, 247, 0.78)",
    textTertiary: "rgba(243, 245, 247, 0.55)",
    textMuted: "rgba(243, 245, 247, 0.38)",
    textGhost: "rgba(243, 245, 247, 0.15)",

    // Legacy aliases (for backward compatibility)
    background: "#1a1b26",
    surface: "#24283b",
    elevated: "#2f3449",

    // Accent colors - brighter for contrast
    accent: "#7c8aff",
    accentHover: "#929eff",
    accentBright: "#a5b0ff",
    accentSoft: "#262a42",
    accentGlow: "rgba(124, 138, 255, 0.3)",

    // Legacy primary/secondary (for backward compatibility)
    primary: "#7c8aff",
    secondary: "#a78bfa",

    // Semantic colors - optimized for dark bg
    success: "#4ade80",
    successSoft: "#1a3a28",
    warning: "#fbbf24",
    warningSoft: "#3d3422",
    danger: "#f43f5e",
    dangerSoft: "#3b2329",

    // Chord display
    chord: "#fbbf24",
    chordSoft: "#3d3422",

    // Spotify brand
    spotify: "#1ed760",
    spotifySoft: "#1f3329",

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
    sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
    md: "0 4px 12px rgba(0, 0, 0, 0.5)",
    lg: "0 8px 24px rgba(0, 0, 0, 0.6)",
    glow: "0 0 20px rgba(124, 138, 255, 0.2)",
    glowActive: "0 0 30px rgba(124, 138, 255, 0.35)",
    glowChord: "0 0 20px rgba(251, 191, 36, 0.35)",
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
