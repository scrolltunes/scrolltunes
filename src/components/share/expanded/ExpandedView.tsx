"use client"

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  Check,
  Gear,
  Layout,
  MagicWand,
  PencilSimple,
  ShareNetwork,
  Sliders,
  Sparkle,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ImageEditMode } from "../ImageEditMode"
import type { ShareExperienceStore } from "../ShareExperienceStore"
import {
  useShareExperienceAlbumArtEffect,
  useShareExperienceAspectRatio,
  useShareExperienceBackground,
  useShareExperienceEffects,
  useShareExperienceElements,
  useShareExperienceExportSettings,
  useShareExperienceHistory,
  useShareExperienceImageEdit,
  useShareExperienceLyrics,
  useShareExperienceState,
  useShareExperienceTypography,
} from "../ShareExperienceStore"
import { ShareDesignerPreview } from "../designer/ShareDesignerPreview"
import { TemplateGallery } from "../designer/TemplateGallery"
import {
  BackgroundControls,
  ControlPanel,
  ControlSectionContent,
  EffectsControls,
  ElementsControls,
  ExportControls,
  LayoutControls,
  TypographyControls,
  ZoomSlider,
} from "../designer/controls"
import { useShareExport } from "../designer/useShareExport"
import type { EffectSettings, EffectType } from "../effects"

// ============================================================================
// Types
// ============================================================================

export interface ExpandedViewRef {
  triggerShare: () => void
}

export interface ExpandedViewProps {
  readonly store: ShareExperienceStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId: string | null
  readonly onCollapseToCompact: () => void
}

// ============================================================================
// Tab Types
// ============================================================================

type TabId = "templates" | "layout" | "style" | "elements" | "effects"

interface Tab {
  readonly id: TabId
  readonly label: string
  readonly icon: React.ReactNode
}

const TABS: readonly Tab[] = [
  { id: "templates", label: "Templates", icon: <Layout size={20} weight="bold" /> },
  { id: "layout", label: "Layout", icon: <Sliders size={20} weight="bold" /> },
  { id: "style", label: "Style", icon: <MagicWand size={20} weight="bold" /> },
  { id: "elements", label: "Elements", icon: <Gear size={20} weight="bold" /> },
  { id: "effects", label: "Effects", icon: <Sparkle size={20} weight="bold" /> },
]

// ============================================================================
// Mobile Tab Bar Component
// ============================================================================

interface MobileTabBarProps {
  readonly activeTab: TabId
  readonly onChange: (tab: TabId) => void
}

const MobileTabBar = memo(function MobileTabBar({ activeTab, onChange }: MobileTabBarProps) {
  return (
    <div
      className="flex h-12 shrink-0 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--color-border)" }}
      role="tablist"
      aria-label="Studio options"
    >
      {TABS.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-4 transition-colors"
            style={{
              color: isActive ? "var(--color-accent)" : "var(--color-text3)",
            }}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
            {isActive && (
              <motion.div
                layoutId="expanded-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--color-accent)" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
})

// ============================================================================
// Share Dropdown Component
// ============================================================================

interface ShareDropdownProps {
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly onClose: () => void
  readonly isCopied: boolean
  readonly isGenerating: boolean
  readonly isSharing: boolean
  readonly onCopy: () => void
  readonly onDownload: () => void
  readonly onShare: () => void
}

const ShareDropdown = memo(function ShareDropdown({
  isOpen,
  onToggle,
  onClose,
  isCopied,
  isGenerating,
  isSharing,
  onCopy,
  onDownload,
  onShare,
}: ShareDropdownProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={isGenerating}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--color-accent)", color: "white" }}
        aria-label="Share options"
        aria-expanded={isOpen}
      >
        <ShareNetwork size={16} weight="bold" />
        Share
        <CaretDown size={14} weight="bold" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl shadow-lg"
            style={{
              background: "var(--color-surface2)",
              border: "1px solid var(--color-border)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                onCopy()
                onClose()
              }}
              disabled={isGenerating}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ color: "var(--color-text)" }}
            >
              {isCopied ? (
                <Check size={18} style={{ color: "var(--color-success)" }} />
              ) : (
                <span className="flex h-[18px] w-[18px] items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
                  </svg>
                </span>
              )}
              <span>{isCopied ? "Copied!" : "Copy to clipboard"}</span>
            </button>
            <div style={{ height: 1, background: "var(--color-border)" }} />
            <button
              type="button"
              onClick={() => {
                onDownload()
                onClose()
              }}
              disabled={isGenerating}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ color: "var(--color-text)" }}
            >
              <span className="flex h-[18px] w-[18px] items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z" />
                </svg>
              </span>
              <span>Save to device</span>
            </button>
            <div style={{ height: 1, background: "var(--color-border)" }} />
            <button
              type="button"
              onClick={() => {
                onShare()
                onClose()
              }}
              disabled={isGenerating || isSharing}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:brightness-110 disabled:opacity-50"
              style={{ color: "var(--color-text)" }}
            >
              <ShareNetwork size={18} />
              <span>Share...</span>
            </button>
          </motion.div>
        </>
      )}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const ExpandedView = memo(
  forwardRef<ExpandedViewRef, ExpandedViewProps>(function ExpandedView(
    { store, title, artist, albumArt, albumArtLarge, spotifyId, onCollapseToCompact },
    ref,
  ) {
    const previewContainerRef = useRef<HTMLDivElement>(null)
    const cardRef = useRef<HTMLDivElement>(null)

    // State
    const [showShareDropdown, setShowShareDropdown] = useState(false)
    const [previewScale, setPreviewScale] = useState(1)
    const [scaledHeight, setScaledHeight] = useState<number | null>(null)
    const [isTextEditing, setIsTextEditing] = useState(false)
    const [expandedWidth] = useState(true)
    const [activeTab, setActiveTab] = useState<TabId>("templates")

    // Store state subscriptions
    const state = useShareExperienceState(store)
    const lyrics = useShareExperienceLyrics(store)
    const background = useShareExperienceBackground(store)
    const typography = useShareExperienceTypography(store)
    const elements = useShareExperienceElements(store)
    const effects = useShareExperienceEffects(store)
    const albumArtEffect = useShareExperienceAlbumArtEffect(store)
    const imageEdit = useShareExperienceImageEdit(store)
    const aspectRatio = useShareExperienceAspectRatio(store)
    const exportSettings = useShareExperienceExportSettings(store)
    const history = useShareExperienceHistory(store)

    // Gradient palette from store
    const gradientPalette = useMemo(() => store.getGradientPalette(), [store])

    // Determine if image editing is available
    const isAlbumArtBackground = background.type === "albumArt"
    const isImageEditing = state.editor.mode === "image"
    const hasAlbumArt = Boolean(albumArt)
    const hasSpotifyId = Boolean(spotifyId)

    // Export hook
    const { isGenerating, isSharing, isCopied, handleDownload, handleCopy, handleShare } =
      useShareExport({
        cardRef,
        title,
        artist,
        settings: exportSettings,
      })

    // Expose triggerShare to parent via ref
    useImperativeHandle(ref, () => ({
      triggerShare: handleShare,
    }))

    // Calculate preview scale to fit within container
    const calculateScale = useCallback(() => {
      const container = previewContainerRef.current
      const card = cardRef.current
      if (!container || !card) return

      const availableWidth = container.clientWidth * 0.92
      const cardWidth = card.scrollWidth
      const cardHeight = card.scrollHeight

      if (cardWidth > availableWidth) {
        const scale = Math.max(0.5, availableWidth / cardWidth)
        const roundedScale = Math.round(scale * 1000) / 1000
        setPreviewScale(roundedScale)
        setScaledHeight(Math.round(cardHeight * roundedScale))
      } else {
        setPreviewScale(1)
        setScaledHeight(null)
      }
    }, [])

    // Calculate scale on mount and when relevant state changes
    useLayoutEffect(() => {
      calculateScale()
    }, [calculateScale, lyrics.selectedLines.length, effects.shadow.enabled, expandedWidth])

    // Recalculate on resize
    useLayoutEffect(() => {
      const card = cardRef.current
      if (!card) return

      const observer = new ResizeObserver(() => calculateScale())
      observer.observe(card)
      window.addEventListener("resize", calculateScale)

      return () => {
        observer.disconnect()
        window.removeEventListener("resize", calculateScale)
      }
    }, [calculateScale])

    // Text editing handlers
    const handleToggleTextEdit = useCallback(() => {
      setIsTextEditing(prev => !prev)
    }, [])

    const handleTextChange = useCallback(
      (lineId: string, text: string) => {
        store.updateLineText(lineId, text)
      },
      [store],
    )

    // Image editing handlers
    const handleToggleImageEdit = useCallback(() => {
      if (isImageEditing) {
        store.setEditMode("customize")
      } else {
        store.setEditMode("image")
      }
    }, [store, isImageEditing])

    const handleImageOffsetChange = useCallback(
      (offsetX: number, offsetY: number) => {
        store.setImageOffset(offsetX, offsetY)
      },
      [store],
    )

    const handleImageScaleChange = useCallback(
      (scale: number) => {
        store.setImageScale(scale)
      },
      [store],
    )

    const handleResetImagePosition = useCallback(() => {
      store.resetImagePosition()
    }, [store])

    // Get display text for preview
    const getDisplayText = useCallback((lineId: string) => store.getDisplayText(lineId), [store])

    // Background art URL
    const backgroundArtUrl = albumArtLarge ?? albumArt

    // Undo/redo handlers
    const handleUndo = useCallback(() => {
      store.undo()
    }, [store])

    const handleRedo = useCallback(() => {
      store.redo()
    }, [store])

    // Album art effect handlers
    const handleAlbumArtEffectChange = useCallback(
      (effect: EffectType) => {
        store.setAlbumArtEffect(effect)
      },
      [store],
    )

    const handleAlbumArtEffectSettingChange = useCallback(
      <K extends keyof EffectSettings>(setting: K, value: EffectSettings[K]) => {
        store.setAlbumArtEffectSetting(setting, value)
      },
      [store],
    )

    // Image edit mode config
    const imageEditModeConfig = useMemo(() => {
      if (!isAlbumArtBackground) return undefined
      return {
        isEditing: isImageEditing,
        imageEdit,
        onToggle: handleToggleImageEdit,
        onReset: handleResetImagePosition,
      }
    }, [
      isAlbumArtBackground,
      isImageEditing,
      imageEdit,
      handleToggleImageEdit,
      handleResetImagePosition,
    ])

    // Render mobile tab content
    const renderMobileTabContent = () => {
      switch (activeTab) {
        case "templates":
          return (
            <div className="p-4">
              <TemplateGallery
                selectedTemplateId={store.getCurrentTemplateId()}
                onSelect={id => store.applyTemplate(id)}
              />
            </div>
          )
        case "layout":
          return (
            <div className="space-y-4 p-4">
              <LayoutControls
                aspectRatio={aspectRatio}
                padding={state.padding}
                onAspectRatioChange={config => store.setAspectRatio(config)}
                onPaddingChange={padding => store.setPadding(padding)}
              />
            </div>
          )
        case "style":
          return (
            <div className="space-y-4 p-4">
              <BackgroundControls
                background={background}
                gradientPalette={gradientPalette}
                hasAlbumArt={hasAlbumArt}
                onBackgroundChange={config => store.setBackground(config)}
                onRegeneratePattern={() => store.regeneratePatternSeed()}
              />
              <div className="pt-2">
                <TypographyControls
                  typography={typography}
                  onTypographyChange={config => store.setTypography(config)}
                />
              </div>
            </div>
          )
        case "elements":
          return (
            <div className="space-y-4 p-4">
              <ElementsControls
                elements={elements}
                hasAlbumArt={hasAlbumArt}
                hasSpotifyId={hasSpotifyId}
                onElementChange={(element, config) => store.setElementConfig(element, config)}
                onToggleVisibility={element => store.toggleElementVisibility(element)}
              />
            </div>
          )
        case "effects":
          return (
            <div className="space-y-4 p-4">
              <EffectsControls
                effects={effects}
                onShadowChange={config => store.setShadow(config)}
                onBorderChange={config => store.setBorder(config)}
                onVignetteChange={config => store.setVignette(config)}
                isAlbumArtBackground={isAlbumArtBackground}
                albumArt={albumArt}
                albumArtEffect={albumArtEffect.effect}
                albumArtEffectSettings={albumArtEffect.settings}
                onAlbumArtEffectChange={handleAlbumArtEffectChange}
                onAlbumArtEffectSettingChange={handleAlbumArtEffectSettingChange}
              />
              <div className="pt-2">
                <ExportControls
                  settings={exportSettings}
                  onChange={config => store.setExportSettings(config)}
                />
              </div>
            </div>
          )
      }
    }

    return (
      <div className="flex h-full flex-col">
        {/* Mobile Layout */}
        <div className="flex flex-col lg:hidden" style={{ height: "calc(100dvh - 120px)" }}>
          {/* Preview Area */}
          <div
            ref={previewContainerRef}
            className="relative flex-shrink-0 rounded-2xl p-4"
            style={{ background: "#1a1a1a" }}
          >
            {/* Edit Mode Buttons */}
            <div className="absolute left-3 top-3 z-10 flex gap-1">
              {/* Text Edit Button */}
              <button
                type="button"
                onClick={handleToggleTextEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                style={{
                  background: isTextEditing ? "var(--color-accent)" : "rgba(0,0,0,0.5)",
                  color: isTextEditing ? "white" : "rgba(255,255,255,0.8)",
                }}
                aria-label={isTextEditing ? "Done editing" : "Edit text"}
              >
                {isTextEditing ? (
                  <Check size={18} weight="bold" />
                ) : (
                  <PencilSimple size={18} weight="bold" />
                )}
              </button>
              {/* Image Edit Button */}
              {imageEditModeConfig && (
                <ImageEditMode
                  isEditing={imageEditModeConfig.isEditing}
                  offsetX={imageEditModeConfig.imageEdit.offsetX}
                  offsetY={imageEditModeConfig.imageEdit.offsetY}
                  scale={imageEditModeConfig.imageEdit.scale}
                  onToggle={imageEditModeConfig.onToggle}
                  onReset={imageEditModeConfig.onReset}
                />
              )}
            </div>

            {/* Undo/Redo Buttons */}
            <div className="absolute right-3 top-3 z-10 flex gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!history.canUndo}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30"
                style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)" }}
                aria-label="Undo"
              >
                <ArrowCounterClockwise size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!history.canRedo}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30"
                style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)" }}
                aria-label="Redo"
              >
                <ArrowClockwise size={18} weight="bold" />
              </button>
            </div>

            {/* Card Preview */}
            <div
              className="flex items-center justify-center"
              style={{
                minHeight: scaledHeight !== null ? `${scaledHeight}px` : "200px",
                marginBottom: effects.shadow.enabled ? "-24px" : "0",
              }}
            >
              <div
                style={{
                  transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                  transformOrigin: "top center",
                  maxWidth: expandedWidth ? "600px" : "384px",
                  width: "100%",
                }}
              >
                <ShareDesignerPreview
                  title={title}
                  artist={artist}
                  albumArt={backgroundArtUrl}
                  spotifyId={spotifyId}
                  lyrics={lyrics}
                  background={background}
                  typography={typography}
                  padding={state.padding}
                  albumArtElement={elements.albumArt}
                  metadataElement={elements.metadata}
                  lyricsElement={elements.lyrics}
                  spotifyCodeElement={elements.spotifyCode}
                  brandingElement={elements.branding}
                  effects={effects}
                  albumArtEffect={albumArtEffect}
                  getDisplayText={getDisplayText}
                  cardRef={cardRef}
                  isEditing={isTextEditing}
                  onTextChange={handleTextChange}
                  isImageEditing={isImageEditing}
                  imageEdit={imageEdit}
                  onImageOffsetChange={handleImageOffsetChange}
                  onImageScaleChange={handleImageScaleChange}
                  onExitImageEdit={() => store.setEditMode("customize")}
                  onResetImagePosition={handleResetImagePosition}
                />
              </div>
            </div>

            {/* Zoom Slider - shown when image edit mode is active */}
            {isImageEditing && (
              <div className="mt-2">
                <ZoomSlider value={imageEdit.scale} onChange={handleImageScaleChange} />
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <MobileTabBar activeTab={activeTab} onChange={setActiveTab} />

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">{renderMobileTabContent()}</div>

          {/* Footer with Less Options */}
          <div
            className="flex shrink-0 items-center justify-between gap-3 p-4"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <button
              type="button"
              onClick={onCollapseToCompact}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:brightness-110"
              style={{ background: "var(--color-surface2)", color: "var(--color-text2)" }}
            >
              <Sparkle size={18} />
              Less options
            </button>
            <ShareDropdown
              isOpen={showShareDropdown}
              onToggle={() => setShowShareDropdown(prev => !prev)}
              onClose={() => setShowShareDropdown(false)}
              isCopied={isCopied}
              isGenerating={isGenerating}
              isSharing={isSharing}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onShare={handleShare}
            />
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden h-full lg:flex">
          {/* Preview Panel (60%) */}
          <div className="flex w-[60%] flex-col p-4">
            <div
              ref={previewContainerRef}
              className="relative flex-1 rounded-2xl p-6"
              style={{ background: "#1a1a1a" }}
            >
              {/* Edit Mode Buttons */}
              <div className="absolute left-4 top-4 z-10 flex gap-1">
                <button
                  type="button"
                  onClick={handleToggleTextEdit}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                  style={{
                    background: isTextEditing ? "var(--color-accent)" : "rgba(0,0,0,0.5)",
                    color: isTextEditing ? "white" : "rgba(255,255,255,0.8)",
                  }}
                  aria-label={isTextEditing ? "Done editing" : "Edit text"}
                >
                  {isTextEditing ? (
                    <Check size={18} weight="bold" />
                  ) : (
                    <PencilSimple size={18} weight="bold" />
                  )}
                </button>
                {imageEditModeConfig && (
                  <ImageEditMode
                    isEditing={imageEditModeConfig.isEditing}
                    offsetX={imageEditModeConfig.imageEdit.offsetX}
                    offsetY={imageEditModeConfig.imageEdit.offsetY}
                    scale={imageEditModeConfig.imageEdit.scale}
                    onToggle={imageEditModeConfig.onToggle}
                    onReset={imageEditModeConfig.onReset}
                  />
                )}
              </div>

              {/* Undo/Redo Buttons */}
              <div className="absolute right-4 top-4 z-10 flex gap-1">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!history.canUndo}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)" }}
                  aria-label="Undo"
                >
                  <ArrowCounterClockwise size={18} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!history.canRedo}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.8)" }}
                  aria-label="Redo"
                >
                  <ArrowClockwise size={18} weight="bold" />
                </button>
              </div>

              {/* Card Preview */}
              <div
                className="flex items-center justify-center"
                style={{
                  minHeight: scaledHeight !== null ? `${scaledHeight}px` : "200px",
                  marginBottom: effects.shadow.enabled ? "-24px" : "0",
                }}
              >
                <div
                  style={{
                    transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                    transformOrigin: "top center",
                    maxWidth: expandedWidth ? "600px" : "384px",
                    width: "100%",
                  }}
                >
                  <ShareDesignerPreview
                    title={title}
                    artist={artist}
                    albumArt={backgroundArtUrl}
                    spotifyId={spotifyId}
                    lyrics={lyrics}
                    background={background}
                    typography={typography}
                    padding={state.padding}
                    albumArtElement={elements.albumArt}
                    metadataElement={elements.metadata}
                    lyricsElement={elements.lyrics}
                    spotifyCodeElement={elements.spotifyCode}
                    brandingElement={elements.branding}
                    effects={effects}
                    albumArtEffect={albumArtEffect}
                    getDisplayText={getDisplayText}
                    cardRef={cardRef}
                    isEditing={isTextEditing}
                    onTextChange={handleTextChange}
                    isImageEditing={isImageEditing}
                    imageEdit={imageEdit}
                    onImageOffsetChange={handleImageOffsetChange}
                    onImageScaleChange={handleImageScaleChange}
                    onExitImageEdit={() => store.setEditMode("customize")}
                    onResetImagePosition={handleResetImagePosition}
                  />
                </div>
              </div>

              {/* Zoom Slider - shown when image edit mode is active */}
              {isImageEditing && (
                <div className="mt-4">
                  <ZoomSlider value={imageEdit.scale} onChange={handleImageScaleChange} />
                </div>
              )}
            </div>

            {/* Less Options Button */}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={onCollapseToCompact}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--color-surface2)", color: "var(--color-text2)" }}
              >
                <Sparkle size={18} />
                Less options
              </button>
            </div>
          </div>

          {/* Control Panel (40%) */}
          <div
            className="flex w-[40%] flex-col overflow-y-auto"
            style={{
              background: "var(--color-surface1)",
              borderLeft: "1px solid var(--color-border)",
            }}
          >
            {/* Header with Share Dropdown */}
            <div
              className="flex shrink-0 items-center justify-between p-4"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Customize
              </h3>
              <ShareDropdown
                isOpen={showShareDropdown}
                onToggle={() => setShowShareDropdown(prev => !prev)}
                onClose={() => setShowShareDropdown(false)}
                isCopied={isCopied}
                isGenerating={isGenerating}
                isSharing={isSharing}
                onCopy={handleCopy}
                onDownload={handleDownload}
                onShare={handleShare}
              />
            </div>

            {/* Control Sections */}
            <div className="flex-1 overflow-y-auto p-4">
              <ControlPanel defaultExpanded="templates">
                {{
                  templates: (
                    <ControlSectionContent>
                      <TemplateGallery
                        selectedTemplateId={store.getCurrentTemplateId()}
                        onSelect={id => store.applyTemplate(id)}
                      />
                    </ControlSectionContent>
                  ),
                  layout: (
                    <ControlSectionContent>
                      <LayoutControls
                        aspectRatio={aspectRatio}
                        padding={state.padding}
                        onAspectRatioChange={config => store.setAspectRatio(config)}
                        onPaddingChange={padding => store.setPadding(padding)}
                      />
                    </ControlSectionContent>
                  ),
                  background: (
                    <ControlSectionContent>
                      <BackgroundControls
                        background={background}
                        gradientPalette={gradientPalette}
                        hasAlbumArt={hasAlbumArt}
                        onBackgroundChange={config => store.setBackground(config)}
                        onRegeneratePattern={() => store.regeneratePatternSeed()}
                      />
                    </ControlSectionContent>
                  ),
                  typography: (
                    <ControlSectionContent>
                      <TypographyControls
                        typography={typography}
                        onTypographyChange={config => store.setTypography(config)}
                      />
                    </ControlSectionContent>
                  ),
                  elements: (
                    <ControlSectionContent>
                      <ElementsControls
                        elements={elements}
                        hasAlbumArt={hasAlbumArt}
                        hasSpotifyId={hasSpotifyId}
                        onElementChange={(element, config) =>
                          store.setElementConfig(element, config)
                        }
                        onToggleVisibility={element => store.toggleElementVisibility(element)}
                      />
                    </ControlSectionContent>
                  ),
                  effects: (
                    <ControlSectionContent>
                      <EffectsControls
                        effects={effects}
                        onShadowChange={config => store.setShadow(config)}
                        onBorderChange={config => store.setBorder(config)}
                        onVignetteChange={config => store.setVignette(config)}
                        isAlbumArtBackground={isAlbumArtBackground}
                        albumArt={albumArt}
                        albumArtEffect={albumArtEffect.effect}
                        albumArtEffectSettings={albumArtEffect.settings}
                        onAlbumArtEffectChange={handleAlbumArtEffectChange}
                        onAlbumArtEffectSettingChange={handleAlbumArtEffectSettingChange}
                      />
                    </ControlSectionContent>
                  ),
                  export: (
                    <ControlSectionContent>
                      <ExportControls
                        settings={exportSettings}
                        onChange={config => store.setExportSettings(config)}
                      />
                    </ControlSectionContent>
                  ),
                }}
              </ControlPanel>
            </div>
          </div>
        </div>
      </div>
    )
  }),
)
