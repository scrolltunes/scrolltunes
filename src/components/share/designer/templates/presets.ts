/**
 * Template Presets
 *
 * 10 curated templates for the Share Lyrics Designer.
 * Each template defines partial state overrides for non-destructive application.
 */

import type { Template } from "./types"

// ============================================================================
// Minimal Templates
// ============================================================================

export const TEMPLATE_MINIMAL: Template = {
  id: "minimal",
  name: "Minimal",
  category: "minimal",
  description: "Clean and simple with small album art",
  isAnimated: false,
  padding: 24,
  background: {
    type: "gradient",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    gradientId: "minimal-dark",
  },
  typography: {
    fontSize: 18,
    fontWeight: 600,
    alignment: "left",
    color: "#ffffff",
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 48,
      borderRadius: 8,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 14,
    },
    lyrics: {
      wrapText: false,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 40,
      offsetY: 20,
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#1a1a2e",
    secondary: "#16213e",
  },
}

export const TEMPLATE_CENTERED: Template = {
  id: "centered",
  name: "Centered",
  category: "minimal",
  description: "Center-aligned text without album art",
  isAnimated: false,
  padding: 32,
  background: {
    type: "gradient",
    gradient: "linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%)",
    gradientId: "centered-dark",
  },
  typography: {
    fontSize: 20,
    fontWeight: 600,
    alignment: "center",
    color: "#ffffff",
    lineHeight: 1.6,
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: false,
    },
    metadata: {
      visible: true,
      fontSize: 14,
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 50,
      offsetY: 25,
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#0f0f23",
    secondary: "#1a1a3e",
  },
}

export const TEMPLATE_LINES: Template = {
  id: "lines",
  name: "Lines",
  category: "minimal",
  description: "Horizontal line accents",
  isAnimated: false,
  padding: 28,
  background: {
    type: "gradient",
    gradient: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
    gradientId: "lines-dark",
  },
  typography: {
    fontSize: 18,
    fontWeight: 500,
    alignment: "left",
    color: "#e6edf3",
    lineHeight: 1.7,
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 40,
      borderRadius: 4,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 13,
      color: "#8b949e",
    },
    lyrics: {
      wrapText: false,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 30,
      offsetY: 15,
      color: "rgba(0, 0, 0, 0.4)",
    },
    border: {
      enabled: true,
      width: 1,
      color: "rgba(255, 255, 255, 0.1)",
      radius: 16,
    },
  },
  previewColors: {
    primary: "#0d1117",
    secondary: "#161b22",
    accent: "#8b949e",
  },
}

// ============================================================================
// Bold Templates
// ============================================================================

export const TEMPLATE_BOLD: Template = {
  id: "bold",
  name: "Bold",
  category: "bold",
  description: "Large text with high contrast",
  isAnimated: false,
  padding: 28,
  aspectRatio: { preset: "1:1" },
  background: {
    type: "gradient",
    gradient: "linear-gradient(135deg, #000000 0%, #1a1a1a 100%)",
    gradientId: "bold-black",
  },
  typography: {
    fontSize: 24,
    fontWeight: 700,
    alignment: "left",
    color: "#ffffff",
    lineHeight: 1.4,
    textShadow: true,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 56,
      borderRadius: 8,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 14,
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 60,
      offsetY: 30,
      color: "rgba(0, 0, 0, 0.6)",
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#000000",
    secondary: "#1a1a1a",
  },
}

export const TEMPLATE_SIDEBAR: Template = {
  id: "sidebar",
  name: "Sidebar",
  category: "bold",
  description: "Album art on side with lyrics filling space",
  isAnimated: false,
  padding: 24,
  aspectRatio: { preset: "16:9" },
  background: {
    type: "gradient",
    gradient: "linear-gradient(90deg, #1e1e2e 0%, #2d2d44 100%)",
    gradientId: "sidebar-purple",
  },
  typography: {
    fontSize: 22,
    fontWeight: 600,
    alignment: "left",
    color: "#ffffff",
    lineHeight: 1.5,
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 80,
      borderRadius: 12,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 15,
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 50,
      offsetY: 25,
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#1e1e2e",
    secondary: "#2d2d44",
  },
}

// ============================================================================
// Vintage Templates
// ============================================================================

export const TEMPLATE_POLAROID: Template = {
  id: "polaroid",
  name: "Polaroid",
  category: "vintage",
  description: "Classic photo frame style",
  isAnimated: false,
  padding: 20,
  aspectRatio: { preset: "4:5" },
  background: {
    type: "solid",
    color: "#fefefe",
  },
  typography: {
    fontSize: 16,
    fontWeight: 500,
    alignment: "center",
    color: "#333333",
    lineHeight: 1.6,
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 96,
      borderRadius: 0,
      shape: "square",
    },
    metadata: {
      visible: true,
      fontSize: 14,
      color: "#666666",
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 20,
      spread: 0,
      offsetY: 10,
      color: "rgba(0, 0, 0, 0.15)",
    },
    border: {
      enabled: true,
      width: 1,
      color: "#e5e5e5",
      radius: 4,
    },
  },
  previewColors: {
    primary: "#fefefe",
    secondary: "#f5f5f5",
    accent: "#333333",
  },
}

export const TEMPLATE_VINYL: Template = {
  id: "vinyl",
  name: "Vinyl Record",
  category: "vintage",
  description: "Dark with circular album art",
  isAnimated: false,
  padding: 28,
  background: {
    type: "gradient",
    gradient: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
    gradientId: "vinyl-black",
  },
  typography: {
    fontSize: 18,
    fontWeight: 500,
    alignment: "center",
    color: "#e0e0e0",
    lineHeight: 1.6,
    textShadow: false,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 72,
      borderRadius: 100,
      shape: "circle",
    },
    metadata: {
      visible: true,
      fontSize: 14,
      color: "#a0a0a0",
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 40,
      offsetY: 20,
      color: "rgba(0, 0, 0, 0.5)",
    },
    border: {
      enabled: true,
      width: 2,
      color: "rgba(255, 255, 255, 0.1)",
      radius: 20,
    },
  },
  previewColors: {
    primary: "#1a1a1a",
    secondary: "#0a0a0a",
    accent: "#a0a0a0",
  },
}

export const TEMPLATE_RETRO: Template = {
  id: "retro",
  name: "Retro",
  category: "vintage",
  description: "Warm colors with dots pattern",
  isAnimated: false,
  padding: 24,
  background: {
    type: "pattern",
    baseColor: "#2d1b4e",
    pattern: "dots",
  },
  typography: {
    fontSize: 20,
    fontWeight: 600,
    alignment: "left",
    color: "#ffd93d",
    lineHeight: 1.5,
    textShadow: true,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 56,
      borderRadius: 8,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 14,
      color: "#ff6b6b",
    },
    lyrics: {
      wrapText: false,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 50,
      offsetY: 25,
      color: "rgba(0, 0, 0, 0.4)",
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#2d1b4e",
    secondary: "#4a2c7a",
    accent: "#ffd93d",
  },
}

// ============================================================================
// Artistic Templates
// ============================================================================

export const TEMPLATE_GRADIENT: Template = {
  id: "gradient",
  name: "Gradient",
  category: "artistic",
  description: "Vibrant gradient with centered text",
  isAnimated: false,
  padding: 32,
  background: {
    type: "gradient",
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    gradientId: "gradient-purple",
  },
  typography: {
    fontSize: 22,
    fontWeight: 600,
    alignment: "center",
    color: "#ffffff",
    lineHeight: 1.5,
    textShadow: true,
  },
  elements: {
    albumArt: {
      visible: true,
      size: 64,
      borderRadius: 12,
      shape: "rounded",
    },
    metadata: {
      visible: true,
      fontSize: 14,
      color: "rgba(255, 255, 255, 0.9)",
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: true,
      blur: 60,
      offsetY: 30,
      color: "rgba(0, 0, 0, 0.3)",
    },
    border: {
      enabled: false,
    },
  },
  previewColors: {
    primary: "#667eea",
    secondary: "#764ba2",
  },
}

export const TEMPLATE_LARGE_ART: Template = {
  id: "large-art",
  name: "Large Art",
  category: "artistic",
  description: "Big album art with small text overlay",
  isAnimated: false,
  padding: 20,
  aspectRatio: { preset: "1:1" },
  background: {
    type: "albumArt",
    blur: 8,
    overlayOpacity: 0.6,
    overlayColor: "rgba(0, 0, 0, 0.6)",
  },
  typography: {
    fontSize: 18,
    fontWeight: 600,
    alignment: "center",
    color: "#ffffff",
    lineHeight: 1.5,
    textShadow: true,
  },
  elements: {
    albumArt: {
      visible: false,
    },
    metadata: {
      visible: true,
      fontSize: 16,
      color: "rgba(255, 255, 255, 0.9)",
    },
    lyrics: {
      wrapText: true,
    },
    spotifyCode: {
      visible: false,
    },
    branding: {
      visible: false,
    },
  },
  effects: {
    shadow: {
      enabled: false,
    },
    border: {
      enabled: false,
    },
    vignette: {
      enabled: true,
      intensity: 0.4,
    },
  },
  previewColors: {
    primary: "#1a1a2e",
    secondary: "#0f0f1a",
  },
}

// ============================================================================
// All Templates Array
// ============================================================================

export const ALL_TEMPLATES: readonly Template[] = [
  TEMPLATE_MINIMAL,
  TEMPLATE_CENTERED,
  TEMPLATE_LINES,
  TEMPLATE_BOLD,
  TEMPLATE_SIDEBAR,
  TEMPLATE_POLAROID,
  TEMPLATE_VINYL,
  TEMPLATE_RETRO,
  TEMPLATE_GRADIENT,
  TEMPLATE_LARGE_ART,
] as const
