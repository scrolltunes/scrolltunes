// Design tokens for ScrollTunes - Tokyo Night theme (TUI Redesign)
// Single dark theme only

export const theme = {
  colors: {
    // Background layers (Tokyo Night)
    bg: "#1a1b26",
    surface1: "#24283b",
    surface2: "#2f3449",
    surface3: "#3d4259",
    surfaceElevated: "#24283b",

    // Text hierarchy (Tokyo Night)
    textPrimary: "#c0caf5",
    textSecondary: "#a9b1d6",
    textTertiary: "#565f89",
    textMuted: "#565f89",
    textGhost: "#414868",

    // Legacy aliases (for backward compatibility)
    background: "#1a1b26",
    surface: "#24283b",
    elevated: "#2f3449",

    // Accent colors (Tokyo Night)
    accent: "#7aa2f7",
    accentHover: "#8eb5ff",
    accentBright: "#7dcfff",
    accentSoft: "rgba(122, 162, 247, 0.14)",
    accentGlow: "rgba(122, 162, 247, 0.25)",

    // Legacy primary/secondary (for backward compatibility)
    primary: "#7aa2f7",
    secondary: "#bb9af7",

    // Semantic colors (Tokyo Night)
    success: "#9ece6a",
    successSoft: "rgba(158, 206, 106, 0.14)",
    warning: "#e0af68",
    warningSoft: "rgba(224, 175, 104, 0.14)",
    danger: "#f7768e",
    dangerSoft: "rgba(247, 118, 142, 0.14)",

    // Chord display
    chord: "#e0af68",
    chordSoft: "rgba(224, 175, 104, 0.14)",

    // Spotify brand (keep for compliance)
    spotify: "#1db954",
    spotifySoft: "rgba(29, 185, 84, 0.14)",

    // Borders (Tokyo Night)
    border: "#3d4259",
    borderStrong: "#7aa2f7",
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
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },

  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.3)",
    md: "0 4px 12px rgba(0, 0, 0, 0.4)",
    lg: "0 8px 24px rgba(0, 0, 0, 0.5)",
    glow: "0 0 20px rgba(122, 162, 247, 0.15)",
    glowActive: "0 0 30px rgba(122, 162, 247, 0.25)",
    glowChord: "0 0 20px rgba(224, 175, 104, 0.3)",
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
