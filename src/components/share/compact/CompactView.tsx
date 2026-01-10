"use client"

import {
  ArrowCounterClockwise,
  Check,
  Gear,
  PencilSimple,
  ShareNetwork,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
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
import type { QuickPreset, ShareExperienceStore } from "../ShareExperienceStore"
import {
  useShareExperienceActivePreset,
  useShareExperienceAlbumArtEffect,
  useShareExperienceBackground,
  useShareExperienceCompactPattern,
  useShareExperienceEffects,
  useShareExperienceElements,
  useShareExperienceImageEdit,
  useShareExperienceLyrics,
  useShareExperienceState,
  useShareExperienceTypography,
} from "../ShareExperienceStore"
import { ShareDesignerPreview } from "../designer/ShareDesignerPreview"
import { ZoomSlider } from "../designer/controls"
import { useShareExport } from "../designer/useShareExport"
import type { EffectSettings } from "../effects"
import { CUSTOM_COLOR_ID, GradientPalette } from "./GradientPalette"
import { QuickControls } from "./QuickControls"
import { QuickStylePresets } from "./QuickStylePresets"

// ============================================================================
// Types
// ============================================================================

export interface CompactViewRef {
  triggerShare: () => void
}

export interface CompactViewProps {
  readonly store: ShareExperienceStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId: string | null
  readonly onExpandToStudio: () => void
}

// ============================================================================
// Share Menu Component
// ============================================================================

interface ShareMenuProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly isCopied: boolean
  readonly isGenerating: boolean
  readonly isSharing: boolean
  readonly onCopy: () => void
  readonly onDownload: () => void
  readonly onShare: () => void
}

const ShareMenu = memo(function ShareMenu({
  isOpen,
  onClose,
  isCopied,
  isGenerating,
  isSharing,
  onCopy,
  onDownload,
  onShare,
}: ShareMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop to close menu */}
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
    </AnimatePresence>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const CompactView = memo(
  forwardRef<CompactViewRef, CompactViewProps>(function CompactView(
    { store, title, artist, albumArt, albumArtLarge, spotifyId, onExpandToStudio },
    ref,
  ) {
    const previewContainerRef = useRef<HTMLDivElement>(null)
    const cardRef = useRef<HTMLDivElement>(null)

    // State
    const [showShareMenu, setShowShareMenu] = useState(false)
    const [previewScale, setPreviewScale] = useState(1)
    const [scaledHeight, setScaledHeight] = useState<number | null>(null)
    const [isTextEditing, setIsTextEditing] = useState(false)
    const [customColor, setCustomColor] = useState("#4f46e5")

    // Store state subscriptions
    const state = useShareExperienceState(store)
    const lyrics = useShareExperienceLyrics(store)
    const background = useShareExperienceBackground(store)
    const typography = useShareExperienceTypography(store)
    const elements = useShareExperienceElements(store)
    const effects = useShareExperienceEffects(store)
    const albumArtEffect = useShareExperienceAlbumArtEffect(store)
    const imageEdit = useShareExperienceImageEdit(store)
    const compactPattern = useShareExperienceCompactPattern(store)
    const activePreset = useShareExperienceActivePreset(store)

    // Gradient palette from store
    const gradientPalette = useMemo(() => store.getGradientPalette(), [store])

    // Derive selected gradient ID from background state
    const selectedGradientId = useMemo(() => {
      if (background.type === "gradient") {
        return background.gradientId
      }
      if (background.type === "solid") {
        // Check if solid color matches customColor - treat as custom
        return CUSTOM_COLOR_ID
      }
      return null
    }, [background])

    // Determine if image editing is available
    const isAlbumArtBackground = background.type === "albumArt" || compactPattern === "albumArt"
    const isImageEditing = state.editor.mode === "image"

    // Export hook
    const { isGenerating, isSharing, isCopied, handleDownload, handleCopy, handleShare } =
      useShareExport({
        cardRef,
        title,
        artist,
        settings: state.exportSettings,
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
    }, [calculateScale, lyrics.selectedLines.length, effects.shadow.enabled])

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

    const handleResetText = useCallback(() => {
      store.resetAllLineText()
    }, [store])

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

    // Check if text has been edited
    const hasTextEdits = useMemo(() => store.hasTextEdits(), [store, lyrics])

    // Background art URL
    const backgroundArtUrl = albumArtLarge ?? albumArt

    // QuickControls handlers
    const handlePatternChange = useCallback(
      (pattern: typeof compactPattern) => {
        store.setCompactPattern(pattern)
      },
      [store],
    )

    const handleEffectTypeChange = useCallback(
      (effect: typeof albumArtEffect.effect) => {
        store.setAlbumArtEffect(effect)
      },
      [store],
    )

    const handleEffectSettingChange = useCallback(
      <K extends keyof EffectSettings>(setting: K, value: EffectSettings[K]) => {
        store.setAlbumArtEffectSetting(setting, value)
      },
      [store],
    )

    const handleShadowToggle = useCallback(
      (enabled: boolean) => {
        store.setShadow({ enabled })
      },
      [store],
    )

    const handleSpotifyCodeToggle = useCallback(
      (visible: boolean) => {
        store.setElementConfig("spotifyCode", { visible })
      },
      [store],
    )

    const handleBrandingToggle = useCallback(
      (visible: boolean) => {
        store.setElementConfig("branding", { visible })
      },
      [store],
    )

    // Gradient palette handlers
    const handleGradientSelect = useCallback(
      (gradientId: string, gradient: string) => {
        store.setGradient(gradientId, gradient)
      },
      [store],
    )

    const handleCustomColorChange = useCallback(
      (color: string) => {
        setCustomColor(color)
        store.setSolidColor(color)
      },
      [store],
    )

    // Quick preset handler
    const handlePresetSelect = useCallback(
      (preset: QuickPreset) => {
        store.applyQuickPreset(preset)
      },
      [store],
    )

    return (
      <div className="flex flex-col">
        {/* Preview Area */}
        <div
          ref={previewContainerRef}
          className="share-modal-preserve relative rounded-2xl bg-neutral-200 p-6 pb-14"
        >
          {/* Edit Mode Buttons */}
          <div className="absolute left-2 top-2 z-10 flex gap-1">
            {/* Text Edit Button */}
            <button
              type="button"
              onClick={handleToggleTextEdit}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{
                background: isTextEditing ? "var(--color-accent)" : "rgba(0,0,0,0.4)",
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
            {/* Reset Text Button */}
            {isTextEditing && hasTextEdits && (
              <button
                type="button"
                onClick={handleResetText}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  color: "rgba(255,255,255,0.8)",
                }}
                aria-label="Reset text"
              >
                <ArrowCounterClockwise size={18} weight="bold" />
              </button>
            )}
          </div>

          {/* Image Edit Button (when Album pattern selected) */}
          {isAlbumArtBackground && albumArt && (
            <div className="absolute right-12 top-2 z-10 flex gap-1">
              <ImageEditMode
                isEditing={isImageEditing}
                offsetX={imageEdit.offsetX}
                offsetY={imageEdit.offsetY}
                scale={imageEdit.scale}
                onToggle={handleToggleImageEdit}
                onReset={handleResetImagePosition}
              />
            </div>
          )}

          {/* Share Menu Button */}
          <div className="absolute right-2 top-2 z-10">
            <button
              type="button"
              onClick={() => setShowShareMenu(prev => !prev)}
              disabled={isGenerating}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50"
              style={{ background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.8)" }}
              aria-label="Share options"
            >
              <ShareNetwork size={18} weight="bold" />
            </button>
            <ShareMenu
              isOpen={showShareMenu}
              onClose={() => setShowShareMenu(false)}
              isCopied={isCopied}
              isGenerating={isGenerating}
              isSharing={isSharing}
              onCopy={handleCopy}
              onDownload={handleDownload}
              onShare={handleShare}
            />
          </div>

          {/* Card Preview */}
          <div
            style={{
              height: scaledHeight !== null ? `${scaledHeight}px` : undefined,
              overflow: "visible",
              marginBottom: effects.shadow.enabled ? "-24px" : "0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                transformOrigin: "top center",
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

          {/* Gradient Palette - shown when not using album art background */}
          {!isAlbumArtBackground && (
            <GradientPalette
              gradientPalette={gradientPalette}
              selectedGradientId={selectedGradientId}
              customColor={customColor}
              onGradientSelect={handleGradientSelect}
              onCustomColorChange={handleCustomColorChange}
            />
          )}

          {/* Zoom Slider - shown when image edit mode is active */}
          {isImageEditing && (
            <div className="absolute inset-x-4 bottom-2">
              <ZoomSlider value={imageEdit.scale} onChange={handleImageScaleChange} />
            </div>
          )}
        </div>

        {/* Controls Section */}
        <div className="mt-4 space-y-4">
          {/* Quick Style Presets */}
          <QuickStylePresets activePreset={activePreset} onPresetSelect={handlePresetSelect} />

          {/* Quick Controls */}
          <QuickControls
            compactPattern={compactPattern}
            onPatternChange={handlePatternChange}
            hasAlbumArt={Boolean(albumArt)}
            albumArt={albumArt}
            effectType={albumArtEffect.effect}
            effectSettings={albumArtEffect.settings}
            onEffectTypeChange={handleEffectTypeChange}
            onEffectSettingChange={handleEffectSettingChange}
            effects={effects}
            elements={elements}
            onShadowToggle={handleShadowToggle}
            onSpotifyCodeToggle={handleSpotifyCodeToggle}
            onBrandingToggle={handleBrandingToggle}
            spotifyId={spotifyId}
          />

          {/* More Options Button */}
          <button
            type="button"
            onClick={onExpandToStudio}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:brightness-110"
            style={{ background: "var(--color-surface2)", color: "var(--color-text2)" }}
          >
            <Gear size={18} />
            More options...
          </button>
        </div>
      </div>
    )
  }),
)
