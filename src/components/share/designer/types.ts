/**
 * Share Designer - Type Definitions
 *
 * Complete state interface for the lyrics share card designer.
 * Follows project patterns with readonly modifiers throughout.
 */

import { DEFAULT_EFFECT_SETTINGS, type EffectSettings, type EffectType } from "../effects"

// ============================================================================
// Aspect Ratio Types
// ============================================================================

export type AspectRatioPreset = "1:1" | "9:16" | "16:9" | "4:5"

export interface AspectRatioConfig {
  readonly preset: AspectRatioPreset | "custom"
  readonly customWidth?: number
  readonly customHeight?: number
}

export interface AspectRatioDimensions {
  readonly width: number
  readonly height: number
  readonly ratio: number
}

// ============================================================================
// Background Types
// ============================================================================

export type BackgroundType = "solid" | "gradient" | "albumArt" | "pattern"

export type PatternVariant = "none" | "dots" | "grid" | "waves"

export interface SolidBackground {
  readonly type: "solid"
  readonly color: string
}

export interface GradientBackground {
  readonly type: "gradient"
  readonly gradient: string
  readonly gradientId: string
}

export interface AlbumArtBackground {
  readonly type: "albumArt"
  readonly blur: number
  readonly overlayOpacity: number
  readonly overlayColor: string
}

export interface PatternBackground {
  readonly type: "pattern"
  readonly baseColor: string
  readonly pattern: PatternVariant
  readonly patternSeed: number
}

export type BackgroundConfig =
  | SolidBackground
  | GradientBackground
  | AlbumArtBackground
  | PatternBackground

// ============================================================================
// Typography Types
// ============================================================================

export type FontFamily =
  | "system"
  | "inter"
  | "roboto"
  | "playfair"
  | "merriweather"
  | "montserrat"
  | "bebas"
  | "oswald"
  | "lora"

export type FontWeight = 400 | 500 | 600 | 700 | 800

export type TextAlignment = "left" | "center" | "right"

export interface TypographyConfig {
  readonly fontFamily: FontFamily
  readonly fontSize: number
  readonly fontWeight: FontWeight
  readonly lineHeight: number
  readonly letterSpacing: number
  readonly color: string
  readonly alignment: TextAlignment
  readonly textShadow: boolean
}

// ============================================================================
// Element Configuration Types
// ============================================================================

export interface Position {
  readonly x: number
  readonly y: number
}

export interface BaseElementConfig {
  readonly visible: boolean
  readonly opacity: number
}

export interface AlbumArtElementConfig extends BaseElementConfig {
  readonly size: number
  readonly borderRadius: number
  readonly shape: "square" | "rounded" | "circle"
}

export interface MetadataElementConfig extends BaseElementConfig {
  readonly showTitle: boolean
  readonly showArtist: boolean
  readonly fontSize: number
  readonly color: string
}

export interface LyricsElementConfig extends BaseElementConfig {
  readonly wrapText: boolean
  readonly maxWidth: number | null
}

export interface SpotifyCodeElementConfig extends BaseElementConfig {
  readonly size: number
}

export interface BrandingElementConfig extends BaseElementConfig {
  readonly text: string
  readonly showEmoji: boolean
}

export interface ElementsConfig {
  readonly albumArt: AlbumArtElementConfig
  readonly metadata: MetadataElementConfig
  readonly lyrics: LyricsElementConfig
  readonly spotifyCode: SpotifyCodeElementConfig
  readonly branding: BrandingElementConfig
}

// ============================================================================
// Effects Configuration
// ============================================================================

export interface ShadowConfig {
  readonly enabled: boolean
  readonly blur: number
  readonly spread: number
  readonly offsetY: number
  readonly color: string
}

export interface BorderConfig {
  readonly enabled: boolean
  readonly width: number
  readonly color: string
  readonly radius: number
}

export interface VignetteConfig {
  readonly enabled: boolean
  readonly intensity: number
}

export interface EffectsConfig {
  readonly shadow: ShadowConfig
  readonly border: BorderConfig
  readonly vignette: VignetteConfig
}

// ============================================================================
// Album Art Effect Types (New Effects System)
// ============================================================================

// Re-export from effects module for convenience
export type { EffectSettings, EffectType, GradientDirection } from "../effects"

export interface AlbumArtEffectConfig {
  readonly effect: EffectType
  readonly settings: EffectSettings
}

// ============================================================================
// Lyrics Selection Types
// ============================================================================

export interface LyricLineSelection {
  readonly id: string
  readonly originalText: string
  readonly editedText: string | null
}

export interface LyricsSelectionConfig {
  readonly selectedLines: readonly LyricLineSelection[]
  readonly direction: "ltr" | "rtl"
}

// ============================================================================
// Export Settings
// ============================================================================

export type ExportFormat = "png" | "jpeg" | "webp"

export type ExportQuality = "standard" | "high" | "ultra"

export interface ExportSettings {
  readonly format: ExportFormat
  readonly quality: ExportQuality
  readonly pixelRatio: number
}

// ============================================================================
// Editor State (Transient - Not part of undo/redo)
// ============================================================================

export type EditMode = "select" | "customize" | "text" | "image"

export interface ImageEditState {
  readonly offsetX: number // -100 to 100 (percentage)
  readonly offsetY: number // -100 to 100 (percentage)
  readonly scale: number // 1.0 to 3.0
}

export interface EditorState {
  readonly mode: EditMode
  readonly selectedElementId: string | null
  readonly zoom: number
  readonly isPanning: boolean
  readonly isExporting: boolean
  readonly imageEdit: ImageEditState
}

// ============================================================================
// Complete Designer State
// ============================================================================

export interface ShareDesignerState {
  readonly lyrics: LyricsSelectionConfig
  readonly aspectRatio: AspectRatioConfig
  readonly padding: number
  readonly background: BackgroundConfig
  readonly typography: TypographyConfig
  readonly elements: ElementsConfig
  readonly effects: EffectsConfig
  readonly albumArtEffect: AlbumArtEffectConfig
  readonly exportSettings: ExportSettings
}

export interface ShareDesignerEditorState extends ShareDesignerState {
  readonly editor: EditorState
}

// ============================================================================
// Undo/Redo Types
// ============================================================================

export interface HistoryEntry {
  readonly state: ShareDesignerState
  readonly timestamp: number
  readonly label: string
}

export interface HistoryState {
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]
}

// ============================================================================
// Song Context (Input props)
// ============================================================================

export interface LyricLine {
  readonly id: string
  readonly text: string
}

export interface ShareDesignerSongContext {
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly lines: readonly LyricLine[]
  readonly initialSelectedIds?: readonly string[]
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamily: "system",
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.5,
  letterSpacing: 0,
  color: "#ffffff",
  alignment: "left",
  textShadow: false,
}

export const DEFAULT_SHADOW: ShadowConfig = {
  enabled: true,
  blur: 50,
  spread: 0,
  offsetY: 25,
  color: "rgba(0, 0, 0, 0.5)",
}

export const DEFAULT_BORDER: BorderConfig = {
  enabled: false,
  width: 0,
  color: "rgba(255, 255, 255, 0.2)",
  radius: 24,
}

export const DEFAULT_VIGNETTE: VignetteConfig = {
  enabled: false,
  intensity: 0.3,
}

export const DEFAULT_ALBUM_ART: AlbumArtElementConfig = {
  visible: true,
  opacity: 1,
  size: 48,
  borderRadius: 8,
  shape: "rounded",
}

export const DEFAULT_METADATA: MetadataElementConfig = {
  visible: true,
  opacity: 1,
  showTitle: true,
  showArtist: true,
  fontSize: 14,
  color: "#ffffff",
}

export const DEFAULT_LYRICS: LyricsElementConfig = {
  visible: true,
  opacity: 1,
  wrapText: false,
  maxWidth: null,
}

export const DEFAULT_SPOTIFY_CODE: SpotifyCodeElementConfig = {
  visible: false,
  opacity: 0.8,
  size: 24,
}

export const DEFAULT_BRANDING: BrandingElementConfig = {
  visible: false,
  opacity: 0.5,
  text: "ScrollTunes",
  showEmoji: true,
}

export const DEFAULT_ELEMENTS: ElementsConfig = {
  albumArt: DEFAULT_ALBUM_ART,
  metadata: DEFAULT_METADATA,
  lyrics: DEFAULT_LYRICS,
  spotifyCode: DEFAULT_SPOTIFY_CODE,
  branding: DEFAULT_BRANDING,
}

export const DEFAULT_EFFECTS: EffectsConfig = {
  shadow: DEFAULT_SHADOW,
  border: DEFAULT_BORDER,
  vignette: DEFAULT_VIGNETTE,
}

export const DEFAULT_ALBUM_ART_EFFECT: AlbumArtEffectConfig = {
  effect: "none",
  settings: DEFAULT_EFFECT_SETTINGS,
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: "png",
  quality: "high",
  pixelRatio: 3,
}

export const DEFAULT_IMAGE_EDIT: ImageEditState = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  mode: "select",
  selectedElementId: null,
  zoom: 1,
  isPanning: false,
  isExporting: false,
  imageEdit: DEFAULT_IMAGE_EDIT,
}

export const DEFAULT_ASPECT_RATIO: AspectRatioConfig = {
  preset: "1:1",
}

export const DEFAULT_BACKGROUND: GradientBackground = {
  type: "gradient",
  gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
  gradientId: "indigo-purple",
}

export const DEFAULT_LYRICS_SELECTION: LyricsSelectionConfig = {
  selectedLines: [],
  direction: "ltr",
}

export const DEFAULT_SHARE_DESIGNER_STATE: ShareDesignerState = {
  lyrics: DEFAULT_LYRICS_SELECTION,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  padding: 24,
  background: DEFAULT_BACKGROUND,
  typography: DEFAULT_TYPOGRAPHY,
  elements: DEFAULT_ELEMENTS,
  effects: DEFAULT_EFFECTS,
  albumArtEffect: DEFAULT_ALBUM_ART_EFFECT,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
}
