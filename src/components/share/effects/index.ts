/**
 * Effects System - Type Definitions and Defaults
 *
 * Defines visual effects that can be applied to album art backgrounds
 * in the share card designer.
 */

import type { Icon } from "@phosphor-icons/react"
import { CircleHalf, Drop, Gradient, Moon, Palette, SunDim, Textbox } from "@phosphor-icons/react"

// ============================================================================
// Effect Types
// ============================================================================

export type EffectType =
  | "none"
  | "vignette"
  | "blur"
  | "darken"
  | "desaturate"
  | "tint"
  | "gradient"
  | "duotone"

export type GradientDirection = "top" | "bottom" | "left" | "right" | "radial"

// ============================================================================
// Effect Settings Interface
// ============================================================================

export interface EffectSettings {
  // Vignette
  readonly vignetteStrength: number // 0-100

  // Blur
  readonly blurAmount: number // 0-30

  // Darken
  readonly darkenAmount: number // 0-80

  // Desaturate
  readonly desaturateAmount: number // 0-100

  // Tint
  readonly tintColor: string // hex color
  readonly tintIntensity: number // 0-100

  // Gradient Overlay
  readonly gradientDirection: GradientDirection
  readonly gradientColor: string // hex color
  readonly gradientOpacity: number // 0-80

  // Duotone
  readonly duotoneShadow: string // hex color
  readonly duotoneHighlight: string // hex color
  readonly duotoneContrast: number // 0-100
}

// ============================================================================
// Default Effect Settings
// ============================================================================

export const DEFAULT_EFFECT_SETTINGS: EffectSettings = {
  // Vignette
  vignetteStrength: 40,

  // Blur
  blurAmount: 8,

  // Darken
  darkenAmount: 30,

  // Desaturate
  desaturateAmount: 100,

  // Tint
  tintColor: "#4f46e5",
  tintIntensity: 30,

  // Gradient Overlay
  gradientDirection: "bottom",
  gradientColor: "#000000",
  gradientOpacity: 50,

  // Duotone
  duotoneShadow: "#1e1b4b",
  duotoneHighlight: "#c4b5fd",
  duotoneContrast: 50,
}

// ============================================================================
// Effect Definition
// ============================================================================

export interface EffectDefinition {
  readonly id: EffectType
  readonly name: string
  readonly description: string
  readonly icon: Icon
}

// ============================================================================
// Effect Definitions Array
// ============================================================================

export const EFFECT_DEFINITIONS: readonly EffectDefinition[] = [
  {
    id: "none",
    name: "None",
    description: "No effect applied",
    icon: Textbox,
  },
  {
    id: "vignette",
    name: "Vignette",
    description: "Darkened edges with clear center",
    icon: CircleHalf,
  },
  {
    id: "blur",
    name: "Blur",
    description: "Soft gaussian blur",
    icon: Drop,
  },
  {
    id: "darken",
    name: "Darken",
    description: "Reduce overall brightness",
    icon: Moon,
  },
  {
    id: "desaturate",
    name: "Desaturate",
    description: "Convert to grayscale",
    icon: SunDim,
  },
  {
    id: "tint",
    name: "Tint",
    description: "Single color overlay",
    icon: Palette,
  },
  {
    id: "gradient",
    name: "Gradient",
    description: "Directional gradient overlay",
    icon: Gradient,
  },
  {
    id: "duotone",
    name: "Duotone",
    description: "Two-color luminosity mapping",
    icon: CircleHalf,
  },
] as const

// ============================================================================
// Helper Functions
// ============================================================================

export function getEffectDefinition(id: EffectType): EffectDefinition | undefined {
  return EFFECT_DEFINITIONS.find(def => def.id === id)
}

export function getEffectName(id: EffectType): string {
  return getEffectDefinition(id)?.name ?? "Unknown"
}

// ============================================================================
// Re-exports
// ============================================================================

export { applyEffect, type EffectStyles } from "./applyEffect"
export { EffectSelector, type EffectSelectorProps } from "./EffectSelector"
export { EffectThumbnail, type EffectThumbnailProps } from "./EffectThumbnail"
export {
  AlbumArtEffectControls,
  type AlbumArtEffectControlsProps,
} from "./AlbumArtEffectControls"
