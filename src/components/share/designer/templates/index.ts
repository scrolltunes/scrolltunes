/**
 * Template System - Exports
 */

// Types
export type {
  Template,
  TemplateCategory,
  TemplateBackground,
  TemplateSolidBackground,
  TemplateGradientBackground,
  TemplateAlbumArtBackground,
  TemplatePatternBackground,
  TemplateTypography,
  TemplateElements,
  TemplateEffects,
  TemplatePreviewProps,
} from "./types"

export { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS } from "./types"

// Presets
export {
  ALL_TEMPLATES,
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
} from "./presets"

// ============================================================================
// Helper Functions
// ============================================================================

import { ALL_TEMPLATES } from "./presets"
import type { Template, TemplateCategory } from "./types"

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): Template | undefined {
  return ALL_TEMPLATES.find(t => t.id === id)
}

/**
 * Get all templates in a specific category
 */
export function getTemplatesByCategory(category: TemplateCategory): readonly Template[] {
  return ALL_TEMPLATES.filter(t => t.category === category)
}

/**
 * Get the default template
 */
export function getDefaultTemplate(): Template {
  const template = ALL_TEMPLATES[0]
  if (!template) {
    throw new Error("No templates available")
  }
  return template
}

/**
 * Check if a template exists
 */
export function templateExists(id: string): boolean {
  return ALL_TEMPLATES.some(t => t.id === id)
}
