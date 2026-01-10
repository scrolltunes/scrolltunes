"use client"

import { detectLyricsDirection } from "@/lib"
import { type GradientOption, buildGradientPalette, extractDominantColor } from "@/lib/colors"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"
import { type Template, getTemplateById } from "./templates"
import {
  type AspectRatioConfig,
  type BackgroundConfig,
  DEFAULT_EDITOR_STATE,
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
  type LyricLineSelection,
  type LyricsSelectionConfig,
  type PatternBackground,
  type ShareDesignerEditorState,
  type ShareDesignerSongContext,
  type ShareDesignerState,
  type TypographyConfig,
} from "./types"

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_SIZE = 50
const COALESCE_THRESHOLD_MS = 500

// ============================================================================
// Tagged Events (Effect.ts pattern)
// ============================================================================

// --- State Events (with undo history) ---

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

export class ApplyTemplate extends Data.TaggedClass("ApplyTemplate")<{
  readonly templateId: string
}> {}

export class RegeneratePatternSeed extends Data.TaggedClass("RegeneratePatternSeed")<object> {}

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

// --- History Events ---

export class Undo extends Data.TaggedClass("Undo")<object> {}
export class Redo extends Data.TaggedClass("Redo")<object> {}
export class ResetHistory extends Data.TaggedClass("ResetHistory")<object> {}

// --- Lifecycle Events ---

export class InitializeBackground extends Data.TaggedClass("InitializeBackground")<object> {}
export class ResetStore extends Data.TaggedClass("ResetStore")<object> {}

// --- Event Union Type ---

export type ShareDesignerEvent =
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
  | ApplyTemplate
  | RegeneratePatternSeed
  | SetEditMode
  | SetSelectedElement
  | SetZoom
  | SetIsExporting
  | SetIsPanning
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
// ShareDesignerStore Class
// ============================================================================

export class ShareDesignerStore {
  private listeners = new Set<() => void>()
  private state: ShareDesignerState
  private editor: EditorState = DEFAULT_EDITOR_STATE
  private history: HistoryState = { past: [], future: [] }
  private lastChangeTimestamp = 0
  private context: ShareDesignerSongContext
  private gradientPalette: readonly GradientOption[] = []
  private currentTemplateId: string | null = null
  private cachedSnapshot: ShareDesignerEditorState | null = null

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

  getSnapshot = (): ShareDesignerEditorState => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = {
        ...this.state,
        editor: this.editor,
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
  readonly dispatch = (event: ShareDesignerEvent): Effect.Effect<void> => {
    // Capture this for use in generators
    const store = this

    switch (event._tag) {
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
        })

      case "SetTypography":
        return Effect.sync(() => {
          store.updateState(
            { typography: { ...store.state.typography, ...event.config } },
            "Change typography",
          )
          store.currentTemplateId = null
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
        })

      case "SetEffects":
        return Effect.sync(() => {
          store.updateState(
            { effects: { ...store.state.effects, ...event.config } },
            "Change effects",
          )
          store.currentTemplateId = null
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

      case "ApplyTemplate":
        return store.handleApplyTemplate(event.templateId)

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
          store.currentTemplateId = null
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
        lyrics: this.state.lyrics,
        exportSettings: this.state.exportSettings,
      }

      this.updateState(newState, `Apply ${template.name} template`)
      this.currentTemplateId = templateId
    })
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
        store.updateState(
          {
            background: {
              type: "gradient",
              gradient: first.gradient,
              gradientId: first.id,
            },
          },
          "Initialize background",
          { skipHistory: true },
        )
      }
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

  // -------------------------------------------------------------------------
  // Convenience Methods (wrap dispatch)
  // -------------------------------------------------------------------------

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
    Effect.runSync(this.dispatch(new SetBackground({ config: { type: "solid", color } })))
  }

  setGradient(gradientId: string, gradient: string): void {
    const bg: GradientBackground = { type: "gradient", gradientId, gradient }
    Effect.runSync(this.dispatch(new SetBackground({ config: bg })))
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

  undo(): void {
    Effect.runSync(this.dispatch(new Undo({})))
  }

  redo(): void {
    Effect.runSync(this.dispatch(new Redo({})))
  }

  resetHistory(): void {
    Effect.runSync(this.dispatch(new ResetHistory({})))
  }

  applyTemplate(templateId: string): void {
    Effect.runSync(this.dispatch(new ApplyTemplate({ templateId })))
  }

  clearTemplateId(): void {
    this.currentTemplateId = null
  }

  reset(): void {
    Effect.runPromise(this.dispatch(new ResetStore({})))
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createShareDesignerStore(context: ShareDesignerSongContext): ShareDesignerStore {
  return new ShareDesignerStore(context)
}

// ============================================================================
// React Hooks
// ============================================================================

export function useShareDesignerState(store: ShareDesignerStore): ShareDesignerEditorState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useShareDesignerBackground(store: ShareDesignerStore): BackgroundConfig {
  const state = useShareDesignerState(store)
  return state.background
}

export function useShareDesignerTypography(store: ShareDesignerStore): TypographyConfig {
  const state = useShareDesignerState(store)
  return state.typography
}

export function useShareDesignerElements(store: ShareDesignerStore): ElementsConfig {
  const state = useShareDesignerState(store)
  return state.elements
}

export function useShareDesignerEffects(store: ShareDesignerStore): EffectsConfig {
  const state = useShareDesignerState(store)
  return state.effects
}

export function useShareDesignerLyrics(store: ShareDesignerStore): LyricsSelectionConfig {
  const state = useShareDesignerState(store)
  return state.lyrics
}

export function useShareDesignerEditor(store: ShareDesignerStore): EditorState {
  const state = useShareDesignerState(store)
  return state.editor
}

export function useShareDesignerHistory(store: ShareDesignerStore): {
  canUndo: boolean
  canRedo: boolean
  pastCount: number
  futureCount: number
} {
  useShareDesignerState(store)
  const info = store.getHistoryInfo()
  return {
    canUndo: store.canUndo(),
    canRedo: store.canRedo(),
    pastCount: info.pastCount,
    futureCount: info.futureCount,
  }
}

export function useShareDesignerAspectRatio(store: ShareDesignerStore): AspectRatioConfig {
  const state = useShareDesignerState(store)
  return state.aspectRatio
}

export function useShareDesignerExportSettings(store: ShareDesignerStore): ExportSettings {
  const state = useShareDesignerState(store)
  return state.exportSettings
}

export function useShareDesignerTemplateId(store: ShareDesignerStore): string | null {
  useShareDesignerState(store)
  return store.getCurrentTemplateId()
}
