"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ShareDesignerPreview } from "../ShareDesignerPreview"
import {
  type ShareDesignerStore,
  useShareDesignerImageEdit,
  useShareDesignerState,
} from "../ShareDesignerStore"
import { TemplateGallery } from "../TemplateGallery"
import {
  BackgroundControls,
  ControlPanel,
  ControlSectionContent,
  EffectsControls,
  ElementsControls,
  ExportControls,
  LayoutControls,
  TypographyControls,
} from "../controls"
import { useShareExport } from "../useShareExport"
import { BottomSheet } from "./BottomSheet"
import { ExportActionBar } from "./ExportActionBar"
import { MobileTabBar, type TabId } from "./MobileTabBar"
import { PreviewCanvas } from "./PreviewCanvas"
import type { ExportActions } from "./ShareDesignerHeader"

interface CustomizeViewProps {
  readonly store: ShareDesignerStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly onExportActionsReady: (actions: ExportActions) => void
}

export const CustomizeView = memo(function CustomizeView({
  store,
  title,
  artist,
  albumArt,
  spotifyId,
  onExportActionsReady,
}: CustomizeViewProps) {
  const state = useShareDesignerState(store)
  const cardRef = useRef<HTMLDivElement>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [expandedWidth, setExpandedWidth] = useState(true)
  const [sheetState, setSheetState] = useState<"peek" | "half" | "full">("peek")
  const [activeTab, setActiveTab] = useState<TabId>("templates")

  // Export actions
  const exportActions = useShareExport({
    cardRef,
    title,
    artist,
    settings: state.exportSettings,
  })

  // Notify parent of export actions
  useEffect(() => {
    onExportActionsReady(exportActions)
  }, [onExportActionsReady, exportActions])

  const gradientPalette = store.getGradientPalette()
  const hasAlbumArt = Boolean(albumArt)
  const hasSpotifyId = Boolean(spotifyId)

  const handleEditToggle = useCallback(() => setIsEditing(prev => !prev), [])
  const handleWidthToggle = useCallback(() => setExpandedWidth(prev => !prev), [])

  // Image edit mode (only when album art background is selected)
  const imageEdit = useShareDesignerImageEdit(store)
  const isAlbumArtBackground = state.background.type === "albumArt"

  const handleImageEditToggle = useCallback(() => {
    if (store.isImageEditing()) {
      store.setEditMode("customize")
    } else {
      store.setEditMode("image")
    }
  }, [store])

  const handleImageEditReset = useCallback(() => {
    store.resetImagePosition()
  }, [store])

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

  const imageEditModeConfig = useMemo(() => {
    if (!isAlbumArtBackground) return undefined
    return {
      isEditing: store.isImageEditing(),
      imageEdit,
      onToggle: handleImageEditToggle,
      onReset: handleImageEditReset,
    }
  }, [isAlbumArtBackground, store, imageEdit, handleImageEditToggle, handleImageEditReset])

  // Render control content based on active tab (mobile)
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
      case "style":
        return (
          <div className="space-y-4 p-4">
            <ControlPanel defaultExpanded="background">
              {{
                layout: (
                  <ControlSectionContent>
                    <LayoutControls
                      aspectRatio={state.aspectRatio}
                      padding={state.padding}
                      onAspectRatioChange={config => store.setAspectRatio(config)}
                      onPaddingChange={padding => store.setPadding(padding)}
                    />
                  </ControlSectionContent>
                ),
                background: (
                  <ControlSectionContent>
                    <BackgroundControls
                      background={state.background}
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
                      typography={state.typography}
                      onTypographyChange={config => store.setTypography(config)}
                    />
                  </ControlSectionContent>
                ),
              }}
            </ControlPanel>
          </div>
        )
      case "export":
        return (
          <div className="space-y-4 p-4">
            <ControlPanel defaultExpanded="elements">
              {{
                elements: (
                  <ControlSectionContent>
                    <ElementsControls
                      elements={state.elements}
                      hasAlbumArt={hasAlbumArt}
                      hasSpotifyId={hasSpotifyId}
                      onElementChange={(element, config) => store.setElementConfig(element, config)}
                      onToggleVisibility={element => store.toggleElementVisibility(element)}
                    />
                  </ControlSectionContent>
                ),
                effects: (
                  <ControlSectionContent>
                    <EffectsControls
                      effects={state.effects}
                      onShadowChange={config => store.setShadow(config)}
                      onBorderChange={config => store.setBorder(config)}
                      onVignetteChange={config => store.setVignette(config)}
                    />
                  </ControlSectionContent>
                ),
                export: (
                  <ControlSectionContent>
                    <ExportControls
                      settings={state.exportSettings}
                      onChange={config => store.setExportSettings(config)}
                    />
                  </ControlSectionContent>
                ),
              }}
            </ControlPanel>
          </div>
        )
    }
  }

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden h-full lg:flex">
        {/* Preview Panel (60%) */}
        <div className="flex w-[60%] flex-col p-4">
          <PreviewCanvas
            cardRef={cardRef}
            isEditing={isEditing}
            expandedWidth={expandedWidth}
            onEditToggle={handleEditToggle}
            onWidthToggle={handleWidthToggle}
            hasShadow={state.effects.shadow.enabled}
            imageEditMode={imageEditModeConfig}
          >
            <ShareDesignerPreview
              title={title}
              artist={artist}
              albumArt={albumArt}
              spotifyId={spotifyId}
              lyrics={state.lyrics}
              background={state.background}
              typography={state.typography}
              padding={state.padding}
              albumArtElement={state.elements.albumArt}
              metadataElement={state.elements.metadata}
              lyricsElement={state.elements.lyrics}
              spotifyCodeElement={state.elements.spotifyCode}
              brandingElement={state.elements.branding}
              effects={state.effects}
              getDisplayText={lineId => store.getDisplayText(lineId)}
              cardRef={cardRef}
              isImageEditing={store.isImageEditing()}
              imageEdit={imageEdit}
              onImageOffsetChange={handleImageOffsetChange}
              onImageScaleChange={handleImageScaleChange}
            />
          </PreviewCanvas>
        </div>

        {/* Control Panel (40%) */}
        <div
          className="flex w-[40%] flex-col overflow-y-auto"
          style={{
            background: "var(--color-surface1)",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          <div className="p-4">
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
                      aspectRatio={state.aspectRatio}
                      padding={state.padding}
                      onAspectRatioChange={config => store.setAspectRatio(config)}
                      onPaddingChange={padding => store.setPadding(padding)}
                    />
                  </ControlSectionContent>
                ),
                background: (
                  <ControlSectionContent>
                    <BackgroundControls
                      background={state.background}
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
                      typography={state.typography}
                      onTypographyChange={config => store.setTypography(config)}
                    />
                  </ControlSectionContent>
                ),
                elements: (
                  <ControlSectionContent>
                    <ElementsControls
                      elements={state.elements}
                      hasAlbumArt={hasAlbumArt}
                      hasSpotifyId={hasSpotifyId}
                      onElementChange={(element, config) => store.setElementConfig(element, config)}
                      onToggleVisibility={element => store.toggleElementVisibility(element)}
                    />
                  </ControlSectionContent>
                ),
                effects: (
                  <ControlSectionContent>
                    <EffectsControls
                      effects={state.effects}
                      onShadowChange={config => store.setShadow(config)}
                      onBorderChange={config => store.setBorder(config)}
                      onVignetteChange={config => store.setVignette(config)}
                    />
                  </ControlSectionContent>
                ),
                export: (
                  <ControlSectionContent>
                    <ExportControls
                      settings={state.exportSettings}
                      onChange={config => store.setExportSettings(config)}
                    />
                  </ControlSectionContent>
                ),
              }}
            </ControlPanel>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex h-full flex-col lg:hidden">
        {/* Preview area */}
        <div className="flex-1 p-4" style={{ paddingBottom: "220px" }}>
          <PreviewCanvas
            cardRef={cardRef}
            isEditing={isEditing}
            expandedWidth={expandedWidth}
            onEditToggle={handleEditToggle}
            onWidthToggle={handleWidthToggle}
            hasShadow={state.effects.shadow.enabled}
            imageEditMode={imageEditModeConfig}
          >
            <ShareDesignerPreview
              title={title}
              artist={artist}
              albumArt={albumArt}
              spotifyId={spotifyId}
              lyrics={state.lyrics}
              background={state.background}
              typography={state.typography}
              padding={state.padding}
              albumArtElement={state.elements.albumArt}
              metadataElement={state.elements.metadata}
              lyricsElement={state.elements.lyrics}
              spotifyCodeElement={state.elements.spotifyCode}
              brandingElement={state.elements.branding}
              effects={state.effects}
              getDisplayText={lineId => store.getDisplayText(lineId)}
              cardRef={cardRef}
              isImageEditing={store.isImageEditing()}
              imageEdit={imageEdit}
              onImageOffsetChange={handleImageOffsetChange}
              onImageScaleChange={handleImageScaleChange}
            />
          </PreviewCanvas>
        </div>

        {/* Bottom sheet with tabs */}
        <BottomSheet state={sheetState} onStateChange={setSheetState} peekHeight={260}>
          <MobileTabBar activeTab={activeTab} onChange={setActiveTab} />
          <div className="flex-1 overflow-y-auto">{renderMobileTabContent()}</div>
          <ExportActionBar
            onCopy={exportActions.handleCopy}
            onSave={exportActions.handleDownload}
            onShare={exportActions.handleShare}
            isGenerating={exportActions.isGenerating}
            isCopied={exportActions.isCopied}
          />
        </BottomSheet>
      </div>
    </>
  )
})
