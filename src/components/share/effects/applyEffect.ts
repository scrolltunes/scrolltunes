/**
 * Effect Application Utility
 *
 * Generates CSS styles for visual effects applied to album art backgrounds.
 * Returns styles that should be applied via overlay elements or CSS filters.
 */

import type { EffectSettings, EffectType } from "./index"

// ============================================================================
// Types
// ============================================================================

export interface EffectStyles {
  /**
   * CSS filter string to apply directly to the image element
   * e.g., "blur(8px) brightness(0.7)"
   */
  readonly filter?: string

  /**
   * Overlay element styles (for effects that require a separate div)
   * e.g., vignette radial gradient, color tints
   */
  readonly overlay?: React.CSSProperties

  /**
   * Secondary overlay for effects that need multiple layers
   * e.g., duotone with gradient maps
   */
  readonly secondaryOverlay?: React.CSSProperties
}

// ============================================================================
// Apply Effect
// ============================================================================

/**
 * Generate CSS styles for a given effect type and settings
 *
 * @param effect - The type of effect to apply
 * @param settings - The effect settings containing parameters
 * @returns EffectStyles object with filter and overlay properties
 */
export function applyEffect(effect: EffectType, settings: EffectSettings): EffectStyles {
  switch (effect) {
    case "none":
      return {}

    case "vignette":
      return applyVignette(settings.vignetteStrength)

    case "blur":
      return applyBlur(settings.blurAmount)

    case "darken":
      return applyDarken(settings.darkenAmount)

    case "desaturate":
      return applyDesaturate(settings.desaturateAmount)

    case "tint":
      return applyTint(settings.tintColor, settings.tintIntensity)

    case "gradient":
      return applyGradient(
        settings.gradientDirection,
        settings.gradientColor,
        settings.gradientOpacity,
      )

    case "duotone":
      return applyDuotone(
        settings.duotoneShadow,
        settings.duotoneHighlight,
        settings.duotoneContrast,
      )

    default: {
      // Exhaustive check
      const _exhaustive: never = effect
      return _exhaustive
    }
  }
}

// ============================================================================
// Individual Effect Implementations
// ============================================================================

/**
 * Vignette: Darkened edges with clear center
 * Uses a radial gradient overlay
 */
function applyVignette(strength: number): EffectStyles {
  // Convert strength (0-100) to opacity (0-1)
  const opacity = strength / 100

  return {
    overlay: {
      position: "absolute",
      inset: 0,
      background: `radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(0,0,0,${opacity}) 100%)`,
      pointerEvents: "none",
    },
  }
}

/**
 * Blur: Uniform gaussian blur
 * Uses CSS filter: blur()
 */
function applyBlur(amount: number): EffectStyles {
  if (amount <= 0) return {}

  return {
    filter: `blur(${amount}px)`,
  }
}

/**
 * Darken: Reduce overall brightness
 * Uses CSS filter: brightness()
 */
function applyDarken(amount: number): EffectStyles {
  if (amount <= 0) return {}

  // Convert amount (0-80) to brightness (1.0-0.2)
  // amount=0 -> brightness=1 (no change)
  // amount=80 -> brightness=0.2 (very dark)
  const brightness = 1 - amount / 100

  return {
    filter: `brightness(${brightness})`,
  }
}

/**
 * Desaturate: Convert to grayscale
 * Uses CSS filter: grayscale()
 */
function applyDesaturate(amount: number): EffectStyles {
  if (amount <= 0) return {}

  // Convert amount (0-100) to grayscale percentage
  return {
    filter: `grayscale(${amount}%)`,
  }
}

/**
 * Tint: Single color overlay with blend mode
 * Uses a color overlay div with mix-blend-mode
 */
function applyTint(color: string, intensity: number): EffectStyles {
  if (intensity <= 0) return {}

  // Convert intensity (0-100) to opacity
  const opacity = intensity / 100

  return {
    overlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: color,
      opacity,
      mixBlendMode: "color",
      pointerEvents: "none",
    },
  }
}

/**
 * Gradient: Semi-transparent directional gradient overlay
 * Supports linear gradients (top/bottom/left/right) and radial
 */
function applyGradient(
  direction: "top" | "bottom" | "left" | "right" | "radial",
  color: string,
  opacity: number,
): EffectStyles {
  if (opacity <= 0) return {}

  // Convert opacity (0-80) to actual CSS opacity
  const cssOpacity = opacity / 100

  // Generate gradient based on direction
  let gradient: string

  switch (direction) {
    case "top":
      gradient = `linear-gradient(to bottom, ${color} 0%, transparent 100%)`
      break
    case "bottom":
      gradient = `linear-gradient(to top, ${color} 0%, transparent 100%)`
      break
    case "left":
      gradient = `linear-gradient(to right, ${color} 0%, transparent 100%)`
      break
    case "right":
      gradient = `linear-gradient(to left, ${color} 0%, transparent 100%)`
      break
    case "radial":
      gradient = `radial-gradient(ellipse at center, transparent 0%, ${color} 100%)`
      break
  }

  return {
    overlay: {
      position: "absolute",
      inset: 0,
      background: gradient,
      opacity: cssOpacity,
      pointerEvents: "none",
    },
  }
}

/**
 * Duotone: Two-color luminosity mapping
 * Uses CSS filters to convert to grayscale, then applies color via sepia + hue-rotate
 * or uses SVG filter for more accurate mapping
 */
function applyDuotone(shadow: string, highlight: string, contrast: number): EffectStyles {
  // Parse hex colors to RGB
  const shadowRgb = hexToRgb(shadow)
  const highlightRgb = hexToRgb(highlight)

  if (!shadowRgb || !highlightRgb) {
    return {}
  }

  // For duotone, we need:
  // 1. A filter to convert to grayscale with contrast adjustment
  // 2. Overlays to apply the two colors

  // Contrast adjustment (0-100 maps to 0.5-1.5)
  const contrastValue = 0.5 + contrast / 100

  return {
    // First convert to grayscale with contrast
    filter: `grayscale(100%) contrast(${contrastValue})`,
    // Shadow color overlay (dark areas)
    overlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: shadow,
      mixBlendMode: "multiply",
      pointerEvents: "none",
    },
    // Highlight color overlay (light areas)
    secondaryOverlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: highlight,
      mixBlendMode: "screen",
      pointerEvents: "none",
    },
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a hex color string to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, "")

  // Handle 3-digit hex
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map(c => c + c)
          .join("")
      : cleanHex

  if (fullHex.length !== 6) {
    return null
  }

  const r = Number.parseInt(fullHex.slice(0, 2), 16)
  const g = Number.parseInt(fullHex.slice(2, 4), 16)
  const b = Number.parseInt(fullHex.slice(4, 6), 16)

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null
  }

  return { r, g, b }
}
