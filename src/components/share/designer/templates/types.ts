/**
 * Template System - Type Definitions
 *
 * Templates define partial state overrides for non-destructive application.
 */

import type {
  AlbumArtElementConfig,
  AspectRatioConfig,
  BorderConfig,
  BrandingElementConfig,
  LyricsElementConfig,
  MetadataElementConfig,
  PatternVariant,
  ShadowConfig,
  SpotifyCodeElementConfig,
  TextAlignment,
  VignetteConfig,
} from "../types"

// ============================================================================
// Template Categories
// ============================================================================

export type TemplateCategory = "minimal" | "bold" | "vintage" | "artistic"

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  "minimal",
  "bold",
  "vintage",
  "artistic",
] as const

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  minimal: "Minimal",
  bold: "Bold",
  vintage: "Vintage",
  artistic: "Artistic",
}

// ============================================================================
// Template Background Types
// ============================================================================

export interface TemplateSolidBackground {
  readonly type: "solid"
  readonly color: string
}

export interface TemplateGradientBackground {
  readonly type: "gradient"
  readonly gradient: string
  readonly gradientId: string
}

export interface TemplateAlbumArtBackground {
  readonly type: "albumArt"
  readonly blur: number
  readonly overlayOpacity: number
  readonly overlayColor: string
}

export interface TemplatePatternBackground {
  readonly type: "pattern"
  readonly baseColor: string
  readonly pattern: PatternVariant
}

export type TemplateBackground =
  | TemplateSolidBackground
  | TemplateGradientBackground
  | TemplateAlbumArtBackground
  | TemplatePatternBackground

// ============================================================================
// Template Typography
// ============================================================================

export interface TemplateTypography {
  readonly fontSize?: number
  readonly fontWeight?: 400 | 500 | 600 | 700 | 800
  readonly lineHeight?: number
  readonly letterSpacing?: number
  readonly color?: string
  readonly alignment?: TextAlignment
  readonly textShadow?: boolean
}

// ============================================================================
// Template Elements (Partial configs)
// ============================================================================

export interface TemplateElements {
  readonly albumArt?: Partial<AlbumArtElementConfig>
  readonly metadata?: Partial<MetadataElementConfig>
  readonly lyrics?: Partial<LyricsElementConfig>
  readonly spotifyCode?: Partial<SpotifyCodeElementConfig>
  readonly branding?: Partial<BrandingElementConfig>
}

// ============================================================================
// Template Effects (Partial configs)
// ============================================================================

export interface TemplateEffects {
  readonly shadow?: Partial<ShadowConfig>
  readonly border?: Partial<BorderConfig>
  readonly vignette?: Partial<VignetteConfig>
}

// ============================================================================
// Template Definition
// ============================================================================

export interface Template {
  readonly id: string
  readonly name: string
  readonly category: TemplateCategory
  readonly description: string
  readonly isAnimated: boolean

  // Layout
  readonly aspectRatio?: AspectRatioConfig
  readonly padding?: number

  // Visual configuration (all partial for non-destructive merge)
  readonly background: TemplateBackground
  readonly typography: TemplateTypography
  readonly elements: TemplateElements
  readonly effects: TemplateEffects

  // Preview customization
  readonly previewColors?: {
    readonly primary: string
    readonly secondary: string
    readonly accent?: string
  }
}

// ============================================================================
// Template Preview Props
// ============================================================================

export interface TemplatePreviewProps {
  readonly template: Template
  readonly albumArt?: string | null
}
