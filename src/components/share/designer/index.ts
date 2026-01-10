// Types
export type {
  AspectRatioPreset,
  AspectRatioConfig,
  AspectRatioDimensions,
  BackgroundType,
  PatternVariant,
  SolidBackground,
  GradientBackground,
  AlbumArtBackground,
  PatternBackground,
  BackgroundConfig,
  FontFamily,
  FontWeight,
  TextAlignment,
  TypographyConfig,
  Position,
  BaseElementConfig,
  AlbumArtElementConfig,
  MetadataElementConfig,
  LyricsElementConfig,
  SpotifyCodeElementConfig,
  BrandingElementConfig,
  ElementsConfig,
  ShadowConfig,
  BorderConfig,
  VignetteConfig,
  EffectsConfig,
  LyricLineSelection,
  LyricsSelectionConfig,
  ExportFormat,
  ExportQuality,
  ExportSettings,
  EditMode,
  EditorState,
  ShareDesignerState,
  ShareDesignerEditorState,
  HistoryEntry,
  HistoryState,
  LyricLine,
  ShareDesignerSongContext,
} from "./types"

// Default values
export {
  DEFAULT_TYPOGRAPHY,
  DEFAULT_SHADOW,
  DEFAULT_BORDER,
  DEFAULT_VIGNETTE,
  DEFAULT_ALBUM_ART,
  DEFAULT_METADATA,
  DEFAULT_LYRICS,
  DEFAULT_SPOTIFY_CODE,
  DEFAULT_BRANDING,
  DEFAULT_ELEMENTS,
  DEFAULT_EFFECTS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_EDITOR_STATE,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_BACKGROUND,
  DEFAULT_LYRICS_SELECTION,
  DEFAULT_SHARE_DESIGNER_STATE,
} from "./types"

// Store
export {
  ShareDesignerStore,
  createShareDesignerStore,
  useShareDesignerState,
  useShareDesignerBackground,
  useShareDesignerTypography,
  useShareDesignerElements,
  useShareDesignerEffects,
  useShareDesignerLyrics,
  useShareDesignerEditor,
  useShareDesignerHistory,
  useShareDesignerAspectRatio,
  useShareDesignerExportSettings,
  useShareDesignerTemplateId,
} from "./ShareDesignerStore"

// Tagged Events (Effect.ts pattern)
export type { ShareDesignerEvent } from "./ShareDesignerStore"

export {
  // State Events
  SetAspectRatio,
  SetPadding,
  SetBackground,
  SetTypography,
  SetElementConfig,
  SetEffects,
  SetSelectedLines,
  UpdateLineText,
  ResetLineText,
  ResetAllLineText,
  SetExportSettings,
  ApplyTemplate,
  RegeneratePatternSeed,
  // Editor Events
  SetEditMode,
  SetSelectedElement,
  SetZoom,
  SetIsExporting,
  SetIsPanning,
  // History Events
  Undo,
  Redo,
  ResetHistory,
  // Lifecycle Events
  InitializeBackground,
  ResetStore,
} from "./ShareDesignerStore"

// Templates
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
} from "./templates"

export {
  ALL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
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
  getTemplateById,
  getTemplatesByCategory,
  getDefaultTemplate,
  templateExists,
} from "./templates"

// Components
export { TemplateCard, type TemplateCardProps } from "./TemplateCard"
export { TemplateGallery, type TemplateGalleryProps } from "./TemplateGallery"
export { ShareDesignerPreview, type ShareDesignerPreviewProps } from "./ShareDesignerPreview"
export { ShareDesigner, type ShareDesignerProps } from "./ShareDesigner"
export { ShareDesignerPage, type ShareDesignerPageProps } from "./ShareDesignerPage"

// Page Components
export {
  BottomSheet,
  CustomizeView,
  ExportActionBar,
  LineSelectionView,
  MobileTabBar,
  type TabId,
  PreviewCanvas,
  ShareDesignerHeader,
  type ExportActions,
} from "./page"

// Hooks
export {
  useShareExport,
  type UseShareExportOptions,
  type UseShareExportResult,
} from "./useShareExport"

// Controls
export {
  // Primitives
  Slider,
  type SliderProps,
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
  ColorPicker,
  type ColorPickerProps,
  // Controls
  LayoutControls,
  type LayoutControlsProps,
  BackgroundControls,
  type BackgroundControlsProps,
  TypographyControls,
  type TypographyControlsProps,
  ElementsControls,
  type ElementsControlsProps,
  EffectsControls,
  type EffectsControlsProps,
  ExportControls,
  type ExportControlsProps,
  // Panel
  ControlPanel,
  ControlSectionContent,
  type ControlPanelProps,
  type ControlSection,
  type ControlSectionProps,
} from "./controls"
