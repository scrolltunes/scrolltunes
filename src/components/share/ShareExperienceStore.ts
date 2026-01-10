"use client"

import { detectLyricsDirection } from "@/lib"
import { type GradientOption, buildGradientPalette, extractDominantColor } from "@/lib/colors"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"
import { type Template, getTemplateById } from "./designer/templates"
import {
  type AlbumArtEffectConfig,
  type AspectRatioConfig,
  type BackgroundConfig,
  DEFAULT_EDITOR_STATE,
  DEFAULT_IMAGE_EDIT,
  DEFAULT_SHARE_DESIGNER_STATE,
  DEFAULT_TYPOGRAPHY,
  type EditMode,
  type EditorState,
  type EffectsConfig,
  type ElementsConfig,
  type ExportSettings,
  type GradientBackground,
  type HistoryEntry,
  type HistoryState,
  type ImageEditState,
  type LyricLineSelection,
  type LyricsSelectionConfig,
  type PatternBackground,
  type ShadowConfig,
  type ShareDesignerSongContext,
  type ShareDesignerState,
  type TypographyConfig,
} from "./designer/types"
import type { EffectSettings, EffectType } from "./effects"

// ============================================================================
// Types
// ============================================================================

export type ShareExperienceMode = "compact" | "expanded"
export type ShareExperienceStep = "select" | "customize"

/**
 * Quick preset types for one-click styling.
 * Presets are album-aware and adapt to the song's album art colors.
 */
export type QuickPreset = "clean" | "vibrant" | "dark" | "vintage"

/**
 * Pattern variants for compact mode.
 * Extends the base PatternVariant with "albumArt" option for full-bleed album art backgrounds.
 * In compact mode, patterns (dots/grid/waves) are overlays on gradient backgrounds,
 * while "albumArt" switches to album art as the background.
 */
export type CompactPatternVariant = "none" | "dots" | "grid" | "waves" | "albumArt"

export interface ShareExperienceEditorState extends ShareDesignerState {
  readonly editor: EditorState
  readonly experienceMode: ShareExperienceMode
  readonly experienceStep: ShareExperienceStep
  readonly activePreset: QuickPreset | null
  readonly compactPattern: CompactPatternVariant
  readonly compactPatternSeed: number
  readonly gradientPalette: readonly GradientOption[]
  // Selected color state (persists across pattern changes)
  readonly selectedGradientId: string | null
  readonly isCustomColor: boolean
  readonly customColor: string
}

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_SIZE = 50
const COALESCE_THRESHOLD_MS = 500

// ============================================================================
// Tagged Events (Effect.ts pattern)
// ============================================================================

// --- Experience Mode Events (no history) ---

export class SetExperienceMode extends Data.TaggedClass("SetExperienceMode")<{
  readonly mode: ShareExperienceMode
}> {}

export class SetExperienceStep extends Data.TaggedClass("SetExperienceStep")<{
  readonly step: ShareExperienceStep
}> {}

// --- Quick Preset Events ---

export class SetActivePreset extends Data.TaggedClass("SetActivePreset")<{
  readonly preset: QuickPreset | null
}> {}

export class ApplyQuickPreset extends Data.TaggedClass("ApplyQuickPreset")<{
  readonly preset: QuickPreset
}> {}

// --- Compact Pattern Events ---

export class SetCompactPattern extends Data.TaggedClass("SetCompactPattern")<{
  readonly pattern: CompactPatternVariant
}> {}

export class RegenerateCompactPatternSeed extends Data.TaggedClass(
  "RegenerateCompactPatternSeed",
)<object> {}

// --- State Events (with undo history) ---

export class ApplyTemplate extends Data.TaggedClass("ApplyTemplate")<{
  readonly templateId: string
}> {}

export class SetAspectRatio extends Data.TaggedClass("SetAspectRatio")<{
  readonly config: AspectRatioConfig
}> {}

export class SetPadding extends Data.TaggedClass("SetPadding")<{
  readonly padding: number
}> {}

export class SetBackground extends Data.TaggedClass("SetBackground")<{
  readonly config: BackgroundConfig
}> {}

export class SetTypography extends Data.TaggedClass("SetTypography")<{
  readonly config: Partial<TypographyConfig>
}> {}

export class SetElementConfig extends Data.TaggedClass("SetElementConfig")<{
  readonly element: keyof ElementsConfig
  readonly config: Partial<ElementsConfig[keyof ElementsConfig]>
}> {}

export class SetEffects extends Data.TaggedClass("SetEffects")<{
  readonly config: Partial<EffectsConfig>
}> {}

export class SetSelectedLines extends Data.TaggedClass("SetSelectedLines")<{
  readonly lineIds: readonly string[]
}> {}

export class UpdateLineText extends Data.TaggedClass("UpdateLineText")<{
  readonly lineId: string
  readonly text: string
}> {}

export class ResetLineText extends Data.TaggedClass("ResetLineText")<{
  readonly lineId: string
}> {}

export class ResetAllLineText extends Data.TaggedClass("ResetAllLineText")<object> {}

export class SetExportSettings extends Data.TaggedClass("SetExportSettings")<{
  readonly config: Partial<ExportSettings>
}> {}

export class RegeneratePatternSeed extends Data.TaggedClass("RegeneratePatternSeed")<object> {}

export class SetAlbumArtEffect extends Data.TaggedClass("SetAlbumArtEffect")<{
  readonly effect: EffectType
}> {}

export class SetAlbumArtEffectSetting extends Data.TaggedClass("SetAlbumArtEffectSetting")<{
  readonly setting: keyof EffectSettings
  readonly value: EffectSettings[keyof EffectSettings]
}> {}

// --- Editor Events (no history) ---

export class SetEditMode extends Data.TaggedClass("SetEditMode")<{
  readonly mode: EditMode
}> {}

export class SetSelectedElement extends Data.TaggedClass("SetSelectedElement")<{
  readonly elementId: string | null
}> {}

export class SetZoom extends Data.TaggedClass("SetZoom")<{
  readonly zoom: number
}> {}

export class SetIsExporting extends Data.TaggedClass("SetIsExporting")<{
  readonly isExporting: boolean
}> {}

export class SetIsPanning extends Data.TaggedClass("SetIsPanning")<{
  readonly isPanning: boolean
}> {}

export class SetImageOffset extends Data.TaggedClass("SetImageOffset")<{
  readonly offsetX: number
  readonly offsetY: number
}> {}

export class SetImageScale extends Data.TaggedClass("SetImageScale")<{
  readonly scale: number
}> {}

export class ResetImagePosition extends Data.TaggedClass("ResetImagePosition")<object> {}

// --- History Events ---

export class Undo extends Data.TaggedClass("Undo")<object> {}
export class Redo extends Data.TaggedClass("Redo")<object> {}
export class ResetHistory extends Data.TaggedClass("ResetHistory")<object> {}

// --- Lifecycle Events ---

export class InitializeBackground extends Data.TaggedClass("InitializeBackground")<object> {}
export class ResetStore extends Data.TaggedClass("ResetStore")<object> {}

// --- Event Union Type ---

export type ShareExperienceEvent =
  | SetExperienceMode
  | SetExperienceStep
  | SetActivePreset
  | ApplyQuickPreset
  | SetCompactPattern
  | RegenerateCompactPatternSeed
  | ApplyTemplate
  | SetAspectRatio
  | SetPadding
  | SetBackground
  | SetTypography
  | SetElementConfig
  | SetEffects
  | SetSelectedLines
  | UpdateLineText
  | ResetLineText
  | ResetAllLineText
  | SetExportSettings
  | RegeneratePatternSeed
  | SetAlbumArtEffect
  | SetAlbumArtEffectSetting
  | SetEditMode
  | SetSelectedElement
  | SetZoom
  | SetIsExporting
  | SetIsPanning
  | SetImageOffset
  | SetImageScale
  | ResetImagePosition
  | Undo
  | Redo
  | ResetHistory
  | InitializeBackground
  | ResetStore

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultState(context: ShareDesignerSongContext): ShareDesignerState {
  const selectedLines: readonly LyricLineSelection[] = (context.initialSelectedIds ?? [])
    .map(id => {
      const line = context.lines.find(l => l.id === id)
      if (!line) return null
      const selection: LyricLineSelection = {
        id: line.id,
        originalText: line.text,
        editedText: null,
      }
      return selection
    })
    .filter((line): line is LyricLineSelection => line !== null)

  const direction = detectLyricsDirection(context.lines)

  return {
    ...DEFAULT_SHARE_DESIGNER_STATE,
    lyrics: {
      selectedLines,
      direction,
    },
    typography: {
      ...DEFAULT_TYPOGRAPHY,
      alignment: direction === "rtl" ? "right" : "left",
    },
  }
}

function statesAreEqual(a: ShareDesignerState, b: ShareDesignerState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function buildBackgroundFromTemplate(template: Template): BackgroundConfig {
  const bg = template.background

  switch (bg.type) {
    case "solid":
      return { type: "solid", color: bg.color }

    case "gradient":
      return {
        type: "gradient",
        gradient: bg.gradient,
        gradientId: bg.gradientId,
      }

    case "albumArt":
      return {
        type: "albumArt",
        blur: bg.blur,
        overlayOpacity: bg.overlayOpacity,
        overlayColor: bg.overlayColor,
      }

    case "pattern":
      return {
        type: "pattern",
        baseColor: bg.baseColor,
        pattern: bg.pattern,
        patternSeed: Date.now(),
      }
  }
}

// ============================================================================
// ShareExperienceStore Class
// ============================================================================

export class ShareExperienceStore {
  private listeners = new Set<() => void>()
  private state: ShareDesignerState
  private editor: EditorState = DEFAULT_EDITOR_STATE
  private experienceMode: ShareExperienceMode = "compact"
  private experienceStep: ShareExperienceStep = "select"
  private activePreset: QuickPreset | null = null
  private compactPattern: CompactPatternVariant = "none"
  private compactPatternSeed: number = Date.now()
  private history: HistoryState = { past: [], future: [] }
  private lastChangeTimestamp = 0
  private context: ShareDesignerSongContext
  private gradientPalette: readonly GradientOption[] = []
  private currentTemplateId: string | null = null
  private cachedSnapshot: ShareExperienceEditorState | null = null
  // The user's selected gradient - persists across all pattern changes
  private selectedGradient: GradientBackground | null = null
  // Custom color for the color picker
  private customColor = "#4f46e5"
  // Whether using custom color (true) or gradient (false)
  private isCustomColor = false

  constructor(context: ShareDesignerSongContext) {
    this.context = context
    this.state = createDefaultState(context)
    // Run initialization effect
    Effect.runPromise(this.dispatch(new InitializeBackground({})))
  }

  // -------------------------------------------------------------------------
  // Observable Pattern
  // -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ShareExperienceEditorState => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = {
        ...this.state,
        editor: this.editor,
        experienceMode: this.experienceMode,
        experienceStep: this.experienceStep,
        activePreset: this.activePreset,
        compactPattern: this.compactPattern,
        compactPatternSeed: this.compactPatternSeed,
        gradientPalette: this.gradientPalette,
        selectedGradientId: this.isCustomColor ? null : (this.selectedGradient?.gradientId ?? null),
        isCustomColor: this.isCustomColor,
        customColor: this.customColor,
      }
    }
    return this.cachedSnapshot
  }

  private notify(): void {
    // Invalidate cached snapshot so getSnapshot returns fresh data
    this.cachedSnapshot = null
    for (const listener of this.listeners) {
      listener()
    }
  }

  // -------------------------------------------------------------------------
  // Effect-based Event Dispatch
  // -------------------------------------------------------------------------

  /**
   * Dispatch an event to the store.
   * Returns an Effect that can be composed or run.
   */
  readonly dispatch = (event: ShareExperienceEvent): Effect.Effect<void> => {
    // Capture this for use in generators
    const store = this

    switch (event._tag) {
      // --- Experience Mode Events ---
      case "SetExperienceMode":
        return Effect.sync(() => {
          store.experienceMode = event.mode
          store.notify()
        })

      case "SetExperienceStep":
        return Effect.sync(() => {
          store.experienceStep = event.step
          store.notify()
        })

      // --- Quick Preset Events ---
      case "SetActivePreset":
        return Effect.sync(() => {
          store.activePreset = event.preset
          store.notify()
        })

      case "ApplyQuickPreset":
        return store.handleApplyQuickPreset(event.preset)

      // --- Compact Pattern Events ---
      case "SetCompactPattern":
        return Effect.sync(() => {
          // Delegate to convenience method which has the full logic
          store.setCompactPattern(event.pattern)
        })

      case "RegenerateCompactPatternSeed":
        return Effect.sync(() => {
          store.compactPatternSeed = Date.now()
          store.notify()
        })

      // --- Template Events ---
      case "ApplyTemplate":
        return store.handleApplyTemplate(event.templateId)

      // --- State Events ---
      case "SetAspectRatio":
        return Effect.sync(() => {
          store.updateState({ aspectRatio: event.config }, "Change aspect ratio")
        })

      case "SetPadding":
        return Effect.sync(() => {
          store.updateState(
            { padding: Math.max(16, Math.min(48, event.padding)) },
            "Change padding",
          )
        })

      case "SetBackground":
        return Effect.sync(() => {
          store.updateState({ background: event.config }, "Change background")
          store.currentTemplateId = null
          store.activePreset = null
        })

      case "SetTypography":
        return Effect.sync(() => {
          store.updateState(
            { typography: { ...store.state.typography, ...event.config } },
            "Change typography",
          )
          store.currentTemplateId = null
          store.activePreset = null
        })

      case "SetElementConfig":
        return Effect.sync(() => {
          store.updateState(
            {
              elements: {
                ...store.state.elements,
                [event.element]: {
                  ...store.state.elements[event.element],
                  ...event.config,
                },
              },
            },
            `Update ${event.element}`,
          )
          store.currentTemplateId = null
          store.activePreset = null
        })

      case "SetEffects":
        return Effect.sync(() => {
          store.updateState(
            { effects: { ...store.state.effects, ...event.config } },
            "Change effects",
          )
          store.currentTemplateId = null
          store.activePreset = null
        })

      case "SetSelectedLines":
        return store.handleSetSelectedLines(event.lineIds)

      case "UpdateLineText":
        return store.handleUpdateLineText(event.lineId, event.text)

      case "ResetLineText":
        return store.handleResetLineText(event.lineId)

      case "ResetAllLineText":
        return store.handleResetAllLineText()

      case "SetExportSettings":
        return Effect.sync(() => {
          store.updateState(
            { exportSettings: { ...store.state.exportSettings, ...event.config } },
            "Change export settings",
          )
        })

      case "RegeneratePatternSeed":
        return Effect.sync(() => {
          if (store.state.background.type === "pattern") {
            store.updateState(
              {
                background: {
                  ...store.state.background,
                  patternSeed: Date.now(),
                },
              },
              "Regenerate pattern",
            )
          }
        })

      case "SetAlbumArtEffect":
        return Effect.sync(() => {
          store.updateState(
            {
              albumArtEffect: {
                ...store.state.albumArtEffect,
                effect: event.effect,
              },
            },
            "Change effect",
          )
          store.currentTemplateId = null
          store.activePreset = null
        })

      case "SetAlbumArtEffectSetting":
        return Effect.sync(() => {
          store.updateState(
            {
              albumArtEffect: {
                ...store.state.albumArtEffect,
                settings: {
                  ...store.state.albumArtEffect.settings,
                  [event.setting]: event.value,
                },
              },
            },
            "Change effect setting",
          )
          store.currentTemplateId = null
          store.activePreset = null
        })

      // --- Editor Events (no history) ---
      case "SetEditMode":
        return Effect.sync(() => {
          store.editor = { ...store.editor, mode: event.mode }
          store.notify()
        })

      case "SetSelectedElement":
        return Effect.sync(() => {
          store.editor = { ...store.editor, selectedElementId: event.elementId }
          store.notify()
        })

      case "SetZoom":
        return Effect.sync(() => {
          store.editor = { ...store.editor, zoom: Math.max(0.5, Math.min(2, event.zoom)) }
          store.notify()
        })

      case "SetIsExporting":
        return Effect.sync(() => {
          store.editor = { ...store.editor, isExporting: event.isExporting }
          store.notify()
        })

      case "SetIsPanning":
        return Effect.sync(() => {
          store.editor = { ...store.editor, isPanning: event.isPanning }
          store.notify()
        })

      case "SetImageOffset":
        return Effect.sync(() => {
          const offsetX = Math.max(-100, Math.min(100, event.offsetX))
          const offsetY = Math.max(-100, Math.min(100, event.offsetY))
          store.editor = {
            ...store.editor,
            imageEdit: { ...store.editor.imageEdit, offsetX, offsetY },
          }
          store.notify()
        })

      case "SetImageScale":
        return Effect.sync(() => {
          const scale = Math.max(1, Math.min(3, event.scale))
          store.editor = {
            ...store.editor,
            imageEdit: { ...store.editor.imageEdit, scale },
          }
          store.notify()
        })

      case "ResetImagePosition":
        return Effect.sync(() => {
          store.editor = {
            ...store.editor,
            imageEdit: DEFAULT_IMAGE_EDIT,
          }
          store.notify()
        })

      // --- History Events ---
      case "Undo":
        return Effect.sync(() => {
          store.handleUndo()
        })

      case "Redo":
        return Effect.sync(() => {
          store.handleRedo()
        })

      case "ResetHistory":
        return Effect.sync(() => {
          store.history = { past: [], future: [] }
          store.lastChangeTimestamp = 0
        })

      // --- Lifecycle Events ---
      case "InitializeBackground":
        return store.handleInitializeBackground()

      case "ResetStore":
        return Effect.gen(function* () {
          store.state = createDefaultState(store.context)
          store.editor = DEFAULT_EDITOR_STATE
          store.experienceMode = "compact"
          store.experienceStep = "select"
          store.currentTemplateId = null
          store.activePreset = null
          store.compactPattern = "none"
          store.compactPatternSeed = Date.now()
          store.history = { past: [], future: [] }
          store.lastChangeTimestamp = 0
          yield* store.handleInitializeBackground()
          store.notify()
        })
    }
  }

  // -------------------------------------------------------------------------
  // Event Handlers (Private)
  // -------------------------------------------------------------------------

  private handleSetSelectedLines(lineIds: readonly string[]): Effect.Effect<void> {
    return Effect.sync(() => {
      const selectedLines: readonly LyricLineSelection[] = lineIds
        .map(id => {
          const existing = this.state.lyrics.selectedLines.find(l => l.id === id)
          if (existing) return existing

          const line = this.context.lines.find(l => l.id === id)
          if (!line) return null

          return {
            id: line.id,
            originalText: line.text,
            editedText: null,
          }
        })
        .filter((line): line is LyricLineSelection => line !== null)

      this.updateState({ lyrics: { ...this.state.lyrics, selectedLines } }, "Update selection")
    })
  }

  private handleUpdateLineText(lineId: string, text: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const selectedLines = this.state.lyrics.selectedLines.map(line => {
        if (line.id !== lineId) return line
        const editedText = text === line.originalText ? null : text
        return { ...line, editedText }
      })

      this.updateState({ lyrics: { ...this.state.lyrics, selectedLines } }, "Edit text")
    })
  }

  private handleResetLineText(lineId: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const selectedLines = this.state.lyrics.selectedLines.map(line => {
        if (line.id !== lineId) return line
        return { ...line, editedText: null }
      })

      this.updateState({ lyrics: { ...this.state.lyrics, selectedLines } }, "Reset text")
    })
  }

  private handleResetAllLineText(): Effect.Effect<void> {
    return Effect.sync(() => {
      const selectedLines = this.state.lyrics.selectedLines.map(line => ({
        ...line,
        editedText: null,
      }))

      this.updateState({ lyrics: { ...this.state.lyrics, selectedLines } }, "Reset all text")
    })
  }

  /**
   * Apply a template to the current state.
   */
  private handleApplyTemplate(templateId: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const template = getTemplateById(templateId)
      if (!template) return

      const newState: ShareDesignerState = {
        aspectRatio: template.aspectRatio ?? this.state.aspectRatio,
        padding: template.padding ?? this.state.padding,
        background: buildBackgroundFromTemplate(template),
        typography: {
          ...this.state.typography,
          fontSize: template.typography.fontSize ?? this.state.typography.fontSize,
          fontWeight: template.typography.fontWeight ?? this.state.typography.fontWeight,
          lineHeight: template.typography.lineHeight ?? this.state.typography.lineHeight,
          letterSpacing: template.typography.letterSpacing ?? this.state.typography.letterSpacing,
          color: template.typography.color ?? this.state.typography.color,
          alignment: template.typography.alignment ?? this.state.typography.alignment,
          textShadow: template.typography.textShadow ?? this.state.typography.textShadow,
        },
        elements: {
          albumArt: { ...this.state.elements.albumArt, ...template.elements.albumArt },
          metadata: { ...this.state.elements.metadata, ...template.elements.metadata },
          lyrics: { ...this.state.elements.lyrics, ...template.elements.lyrics },
          spotifyCode: { ...this.state.elements.spotifyCode, ...template.elements.spotifyCode },
          branding: { ...this.state.elements.branding, ...template.elements.branding },
        },
        effects: {
          shadow: { ...this.state.effects.shadow, ...template.effects.shadow },
          border: { ...this.state.effects.border, ...template.effects.border },
          vignette: { ...this.state.effects.vignette, ...template.effects.vignette },
        },
        albumArtEffect: this.state.albumArtEffect,
        lyrics: this.state.lyrics,
        exportSettings: this.state.exportSettings,
      }

      this.updateState(newState, `Apply ${template.name} template`)
      this.currentTemplateId = templateId
      this.activePreset = null
    })
  }

  /**
   * Apply a quick style preset.
   * Presets configure background, effects, and shadow based on album colors.
   */
  private handleApplyQuickPreset(preset: QuickPreset): Effect.Effect<void> {
    return Effect.sync(() => {
      const presetConfig = this.getPresetConfig(preset)

      // Apply all preset settings in one state update
      this.updateState(
        {
          background: presetConfig.background,
          albumArtEffect: presetConfig.albumArtEffect,
          effects: {
            ...this.state.effects,
            shadow: presetConfig.shadow,
          },
        },
        `Apply ${preset} preset`,
      )

      // Set the active preset (don't clear it since this IS a preset application)
      this.activePreset = preset
      this.currentTemplateId = null
    })
  }

  /**
   * Generate preset configuration based on album colors.
   * Returns background, effect, and shadow settings for the preset.
   */
  private getPresetConfig(preset: QuickPreset): {
    background: BackgroundConfig
    albumArtEffect: AlbumArtEffectConfig
    shadow: ShadowConfig
  } {
    // Get album-derived colors from gradient palette
    const palette = this.gradientPalette
    const first = palette[0]
    const vibrant = palette[1] // Usually more saturated
    const muted = palette[4] // Usually more muted

    // Shadow configurations for each preset type
    const softShadow: ShadowConfig = {
      enabled: true,
      blur: 30,
      spread: 0,
      offsetY: 15,
      color: "rgba(0, 0, 0, 0.25)",
    }

    const mediumShadow: ShadowConfig = {
      enabled: true,
      blur: 50,
      spread: 0,
      offsetY: 25,
      color: "rgba(0, 0, 0, 0.5)",
    }

    const strongShadow: ShadowConfig = {
      enabled: true,
      blur: 70,
      spread: 5,
      offsetY: 35,
      color: "rgba(0, 0, 0, 0.7)",
    }

    switch (preset) {
      case "clean":
        // Clean: Light tint from album, no effect, soft shadow
        return {
          background: first
            ? { type: "gradient", gradientId: first.id, gradient: first.gradient }
            : { type: "solid", color: "#f8fafc" },
          albumArtEffect: {
            effect: "none",
            settings: this.state.albumArtEffect.settings,
          },
          shadow: softShadow,
        }

      case "vibrant":
        // Vibrant: Saturated gradient from album, no effect, medium shadow
        return {
          background: vibrant
            ? { type: "gradient", gradientId: vibrant.id, gradient: vibrant.gradient }
            : first
              ? { type: "gradient", gradientId: first.id, gradient: first.gradient }
              : { type: "solid", color: "#4f46e5" },
          albumArtEffect: {
            effect: "none",
            settings: this.state.albumArtEffect.settings,
          },
          shadow: mediumShadow,
        }

      case "dark":
        // Dark: Album art background, darken 60%, strong shadow
        return {
          background: this.context.albumArt
            ? { type: "albumArt", blur: 0, overlayOpacity: 0, overlayColor: "#000000" }
            : { type: "solid", color: "#1e1e2e" },
          albumArtEffect: {
            effect: "darken",
            settings: {
              ...this.state.albumArtEffect.settings,
              darkenAmount: 60,
            },
          },
          shadow: strongShadow,
        }

      case "vintage":
        // Vintage: Muted/warm tint from album, desaturate 40%, soft shadow
        return {
          background: muted
            ? { type: "gradient", gradientId: muted.id, gradient: muted.gradient }
            : first
              ? { type: "gradient", gradientId: first.id, gradient: first.gradient }
              : { type: "solid", color: "#78716c" },
          albumArtEffect: {
            effect: "desaturate",
            settings: {
              ...this.state.albumArtEffect.settings,
              desaturateAmount: 40,
            },
          },
          shadow: softShadow,
        }
    }
  }

  private handleInitializeBackground(): Effect.Effect<void> {
    const store = this

    return Effect.gen(function* () {
      const albumArt = store.context.albumArt

      // Extract dominant color from album art (falls back to null on failure)
      const dominantColor = albumArt
        ? yield* Effect.tryPromise({
            try: () => extractDominantColor(albumArt),
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)))
        : null

      store.gradientPalette = buildGradientPalette(dominantColor)

      const first = store.gradientPalette[0]
      if (first) {
        const gradientBg: GradientBackground = {
          type: "gradient",
          gradient: first.gradient,
          gradientId: first.id,
        }
        // Initialize selected gradient
        store.selectedGradient = gradientBg
        store.isCustomColor = false
        store.updateState({ background: gradientBg }, "Initialize background", {
          skipHistory: true,
        })
      }

      // Always notify to update gradient palette in UI
      store.notify()
    })
  }

  private handleUndo(): void {
    if (this.history.past.length === 0) return

    const past = [...this.history.past]
    const lastEntry = past.pop()

    if (!lastEntry) return

    const futureEntry: HistoryEntry = {
      state: this.state,
      timestamp: Date.now(),
      label: "Undo",
    }

    this.history = {
      past,
      future: [futureEntry, ...this.history.future],
    }

    this.state = lastEntry.state
    this.lastChangeTimestamp = 0
    this.notify()
  }

  private handleRedo(): void {
    if (this.history.future.length === 0) return

    const future = [...this.history.future]
    const nextEntry = future.shift()

    if (!nextEntry) return

    const pastEntry: HistoryEntry = {
      state: this.state,
      timestamp: Date.now(),
      label: "Redo",
    }

    this.history = {
      past: [...this.history.past, pastEntry],
      future,
    }

    this.state = nextEntry.state
    this.lastChangeTimestamp = 0
    this.notify()
  }

  // -------------------------------------------------------------------------
  // State Management with History
  // -------------------------------------------------------------------------

  private updateState(
    partial: Partial<ShareDesignerState>,
    label: string,
    options: { skipHistory?: boolean } = {},
  ): void {
    const newState = { ...this.state, ...partial }

    if (statesAreEqual(this.state, newState)) {
      return
    }

    const now = Date.now()
    const shouldCoalesce = now - this.lastChangeTimestamp < COALESCE_THRESHOLD_MS

    if (!options.skipHistory) {
      if (shouldCoalesce && this.history.past.length > 0) {
        // Coalesce: keep the most recent entry, just update its timestamp
      } else {
        const entry: HistoryEntry = {
          state: this.state,
          timestamp: now,
          label,
        }

        const newPast = [...this.history.past, entry].slice(-MAX_HISTORY_SIZE)
        this.history = {
          past: newPast,
          future: [],
        }
      }
      this.lastChangeTimestamp = now
    }

    this.state = newState
    this.notify()
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getContext(): ShareDesignerSongContext {
    return this.context
  }

  getGradientPalette(): readonly GradientOption[] {
    return this.gradientPalette
  }

  getDisplayText(lineId: string): string {
    const line = this.state.lyrics.selectedLines.find(l => l.id === lineId)
    if (!line) return ""
    return line.editedText ?? line.originalText
  }

  hasTextEdits(): boolean {
    return this.state.lyrics.selectedLines.some(l => l.editedText !== null)
  }

  canUndo(): boolean {
    return this.history.past.length > 0
  }

  canRedo(): boolean {
    return this.history.future.length > 0
  }

  getHistoryInfo(): { pastCount: number; futureCount: number } {
    return {
      pastCount: this.history.past.length,
      futureCount: this.history.future.length,
    }
  }

  getCurrentTemplateId(): string | null {
    return this.currentTemplateId
  }

  getExperienceMode(): ShareExperienceMode {
    return this.experienceMode
  }

  getExperienceStep(): ShareExperienceStep {
    return this.experienceStep
  }

  getActivePreset(): QuickPreset | null {
    return this.activePreset
  }

  getCompactPattern(): CompactPatternVariant {
    return this.compactPattern
  }

  getCompactPatternSeed(): number {
    return this.compactPatternSeed
  }

  getSelectedGradientId(): string | null {
    if (this.isCustomColor) return null
    return this.selectedGradient?.gradientId ?? null
  }

  getIsCustomColor(): boolean {
    return this.isCustomColor
  }

  getCustomColor(): string {
    return this.customColor
  }

  // -------------------------------------------------------------------------
  // Convenience Methods (wrap dispatch)
  // -------------------------------------------------------------------------

  setMode(mode: ShareExperienceMode): void {
    Effect.runSync(this.dispatch(new SetExperienceMode({ mode })))
  }

  setStep(step: ShareExperienceStep): void {
    Effect.runSync(this.dispatch(new SetExperienceStep({ step })))
  }

  setActivePreset(preset: QuickPreset | null): void {
    Effect.runSync(this.dispatch(new SetActivePreset({ preset })))
  }

  applyQuickPreset(preset: QuickPreset): void {
    Effect.runSync(this.dispatch(new ApplyQuickPreset({ preset })))
  }

  setCompactPattern(pattern: CompactPatternVariant): void {
    // If clicking the same pattern (waves), regenerate the seed
    if (pattern === this.compactPattern && pattern === "waves") {
      this.compactPatternSeed = Date.now()
      this.notify()
      return
    }

    this.compactPattern = pattern
    this.activePreset = null

    // Only change background for albumArt mode
    // For none/dots/grid/waves, background stays as gradient (overlay handled by patternOverlay prop)
    if (pattern === "albumArt") {
      this.updateState(
        {
          background: {
            type: "albumArt",
            blur: 0,
            overlayOpacity: 0,
            overlayColor: "#000000",
          },
        },
        "Change pattern",
        { skipHistory: true },
      )
    } else {
      // Just notify - CompactView will compute the effective background
      this.notify()
    }
  }

  regenerateCompactPatternSeed(): void {
    Effect.runSync(this.dispatch(new RegenerateCompactPatternSeed({})))
  }

  applyTemplate(templateId: string): void {
    Effect.runSync(this.dispatch(new ApplyTemplate({ templateId })))
  }

  setAspectRatio(config: AspectRatioConfig): void {
    Effect.runSync(this.dispatch(new SetAspectRatio({ config })))
  }

  setPadding(padding: number): void {
    Effect.runSync(this.dispatch(new SetPadding({ padding })))
  }

  setBackground(config: BackgroundConfig): void {
    Effect.runSync(this.dispatch(new SetBackground({ config })))
  }

  setSolidColor(color: string): void {
    // Save the custom color - this persists across pattern changes
    this.customColor = color
    this.isCustomColor = true
    // CompactView will use this to compute effective background
    this.notify()
  }

  setGradient(gradientId: string, gradient: string): void {
    const bg: GradientBackground = { type: "gradient", gradientId, gradient }
    // Save the selected gradient - this persists across pattern changes
    this.selectedGradient = bg
    this.isCustomColor = false
    // CompactView will use this to compute effective background
    this.notify()
  }

  setAlbumArtBackground(config: Omit<BackgroundConfig & { type: "albumArt" }, "type">): void {
    Effect.runSync(this.dispatch(new SetBackground({ config: { type: "albumArt", ...config } })))
  }

  setPatternBackground(config: Omit<PatternBackground, "type">): void {
    Effect.runSync(this.dispatch(new SetBackground({ config: { type: "pattern", ...config } })))
  }

  regeneratePatternSeed(): void {
    Effect.runSync(this.dispatch(new RegeneratePatternSeed({})))
  }

  setTypography(config: Partial<TypographyConfig>): void {
    Effect.runSync(this.dispatch(new SetTypography({ config })))
  }

  setElementConfig<K extends keyof ElementsConfig>(
    element: K,
    config: Partial<ElementsConfig[K]>,
  ): void {
    Effect.runSync(this.dispatch(new SetElementConfig({ element, config })))
  }

  toggleElementVisibility(element: keyof ElementsConfig): void {
    const current = this.state.elements[element]
    this.setElementConfig(element, {
      visible: !current.visible,
    } as Partial<ElementsConfig[typeof element]>)
  }

  setEffects(config: Partial<EffectsConfig>): void {
    Effect.runSync(this.dispatch(new SetEffects({ config })))
  }

  setShadow(config: Partial<EffectsConfig["shadow"]>): void {
    this.setEffects({ shadow: { ...this.state.effects.shadow, ...config } })
  }

  toggleShadow(): void {
    this.setShadow({ enabled: !this.state.effects.shadow.enabled })
  }

  setBorder(config: Partial<EffectsConfig["border"]>): void {
    this.setEffects({ border: { ...this.state.effects.border, ...config } })
  }

  setVignette(config: Partial<EffectsConfig["vignette"]>): void {
    this.setEffects({ vignette: { ...this.state.effects.vignette, ...config } })
  }

  setAlbumArtEffect(effect: EffectType): void {
    Effect.runSync(this.dispatch(new SetAlbumArtEffect({ effect })))
  }

  setAlbumArtEffectSetting<K extends keyof EffectSettings>(
    setting: K,
    value: EffectSettings[K],
  ): void {
    Effect.runSync(this.dispatch(new SetAlbumArtEffectSetting({ setting, value })))
  }

  setSelectedLines(lineIds: readonly string[]): void {
    Effect.runSync(this.dispatch(new SetSelectedLines({ lineIds })))
  }

  toggleLine(lineId: string): void {
    const isSelected = this.state.lyrics.selectedLines.some(l => l.id === lineId)

    if (isSelected) {
      this.setSelectedLines(
        this.state.lyrics.selectedLines.filter(l => l.id !== lineId).map(l => l.id),
      )
    } else {
      this.setSelectedLines([...this.state.lyrics.selectedLines.map(l => l.id), lineId])
    }
  }

  updateLineText(lineId: string, text: string): void {
    Effect.runSync(this.dispatch(new UpdateLineText({ lineId, text })))
  }

  resetLineText(lineId: string): void {
    Effect.runSync(this.dispatch(new ResetLineText({ lineId })))
  }

  resetAllLineText(): void {
    Effect.runSync(this.dispatch(new ResetAllLineText({})))
  }

  setExportSettings(config: Partial<ExportSettings>): void {
    Effect.runSync(this.dispatch(new SetExportSettings({ config })))
  }

  setEditMode(mode: EditMode): void {
    Effect.runSync(this.dispatch(new SetEditMode({ mode })))
  }

  setSelectedElement(elementId: string | null): void {
    Effect.runSync(this.dispatch(new SetSelectedElement({ elementId })))
  }

  setZoom(zoom: number): void {
    Effect.runSync(this.dispatch(new SetZoom({ zoom })))
  }

  setIsExporting(isExporting: boolean): void {
    Effect.runSync(this.dispatch(new SetIsExporting({ isExporting })))
  }

  setIsPanning(isPanning: boolean): void {
    Effect.runSync(this.dispatch(new SetIsPanning({ isPanning })))
  }

  setImageOffset(offsetX: number, offsetY: number): void {
    Effect.runSync(this.dispatch(new SetImageOffset({ offsetX, offsetY })))
  }

  setImageScale(scale: number): void {
    Effect.runSync(this.dispatch(new SetImageScale({ scale })))
  }

  resetImagePosition(): void {
    Effect.runSync(this.dispatch(new ResetImagePosition({})))
  }

  isImageEditing(): boolean {
    return this.editor.mode === "image"
  }

  undo(): void {
    Effect.runSync(this.dispatch(new Undo({})))
  }

  redo(): void {
    Effect.runSync(this.dispatch(new Redo({})))
  }

  resetHistory(): void {
    Effect.runSync(this.dispatch(new ResetHistory({})))
  }

  reset(): void {
    Effect.runPromise(this.dispatch(new ResetStore({})))
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createShareExperienceStore(
  context: ShareDesignerSongContext,
): ShareExperienceStore {
  return new ShareExperienceStore(context)
}

// ============================================================================
// React Hooks
// ============================================================================

// Stable no-op subscribe for null store case
const noopSubscribe = (): (() => void) => () => {}

export function useShareExperienceState(store: ShareExperienceStore): ShareExperienceEditorState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useShareExperienceMode(store: ShareExperienceStore | null): ShareExperienceMode {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getSnapshot().experienceMode ?? "compact",
    () => store?.getSnapshot().experienceMode ?? "compact",
  )
}

export function useShareExperienceStep(store: ShareExperienceStore | null): ShareExperienceStep {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getSnapshot().experienceStep ?? "select",
    () => store?.getSnapshot().experienceStep ?? "select",
  )
}

export function useShareExperienceActivePreset(store: ShareExperienceStore): QuickPreset | null {
  const state = useShareExperienceState(store)
  return state.activePreset
}

export function useShareExperienceCompactPattern(
  store: ShareExperienceStore,
): CompactPatternVariant {
  const state = useShareExperienceState(store)
  return state.compactPattern
}

export function useShareExperienceCompactPatternSeed(store: ShareExperienceStore): number {
  const state = useShareExperienceState(store)
  return state.compactPatternSeed
}

export function useShareExperienceBackground(store: ShareExperienceStore): BackgroundConfig {
  const state = useShareExperienceState(store)
  return state.background
}

export function useShareExperienceTypography(store: ShareExperienceStore): TypographyConfig {
  const state = useShareExperienceState(store)
  return state.typography
}

export function useShareExperienceElements(store: ShareExperienceStore): ElementsConfig {
  const state = useShareExperienceState(store)
  return state.elements
}

export function useShareExperienceEffects(store: ShareExperienceStore): EffectsConfig {
  const state = useShareExperienceState(store)
  return state.effects
}

export function useShareExperienceAlbumArtEffect(
  store: ShareExperienceStore,
): AlbumArtEffectConfig {
  const state = useShareExperienceState(store)
  return state.albumArtEffect
}

export function useShareExperienceLyrics(store: ShareExperienceStore): LyricsSelectionConfig {
  const state = useShareExperienceState(store)
  return state.lyrics
}

export function useShareExperienceEditor(store: ShareExperienceStore): EditorState {
  const state = useShareExperienceState(store)
  return state.editor
}

export function useShareExperienceImageEdit(store: ShareExperienceStore): ImageEditState {
  const state = useShareExperienceState(store)
  return state.editor.imageEdit
}

export function useShareExperienceHistory(store: ShareExperienceStore): {
  canUndo: boolean
  canRedo: boolean
  pastCount: number
  futureCount: number
} {
  useShareExperienceState(store)
  const info = store.getHistoryInfo()
  return {
    canUndo: store.canUndo(),
    canRedo: store.canRedo(),
    pastCount: info.pastCount,
    futureCount: info.futureCount,
  }
}

export function useShareExperienceAspectRatio(store: ShareExperienceStore): AspectRatioConfig {
  const state = useShareExperienceState(store)
  return state.aspectRatio
}

export function useShareExperienceExportSettings(store: ShareExperienceStore): ExportSettings {
  const state = useShareExperienceState(store)
  return state.exportSettings
}
