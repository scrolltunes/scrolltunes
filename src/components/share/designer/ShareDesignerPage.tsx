"use client"

import { detectLyricsDirection } from "@/lib"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { createShareDesignerStore, type ShareDesignerStore } from "./ShareDesignerStore"
import { CustomizeView } from "./page/CustomizeView"
import { LineSelectionView } from "./page/LineSelectionView"
import { type ExportActions, ShareDesignerHeader } from "./page/ShareDesignerHeader"
import { PreviewCanvas } from "./page/PreviewCanvas"
import { ShareDesignerPreview } from "./ShareDesignerPreview"
import type { LyricLine, ShareDesignerSongContext } from "./types"
import { useRef } from "react"
import {
  DEFAULT_BACKGROUND,
  DEFAULT_EFFECTS,
  DEFAULT_ELEMENTS,
  DEFAULT_TYPOGRAPHY,
} from "./types"

type Step = "select" | "customize"

export interface ShareDesignerPageProps {
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly lines: readonly LyricLine[]
  readonly initialSelectedIds?: readonly string[]
  readonly initialStep?: Step
  readonly onBack: () => void
}

export const ShareDesignerPage = memo(function ShareDesignerPage({
  title,
  artist,
  albumArt,
  spotifyId,
  lines,
  initialSelectedIds = [],
  initialStep = "select",
  onBack,
}: ShareDesignerPageProps) {
  const previewCardRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>(initialStep)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds.filter(id => lines.some(l => l.id === id))),
  )
  const [store, setStore] = useState<ShareDesignerStore | null>(null)
  const [exportActions, setExportActions] = useState<ExportActions | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [expandedWidth, setExpandedWidth] = useState(true)

  // Detect RTL
  const isRTL = useMemo(() => detectLyricsDirection(lines) === "rtl", [lines])

  // Create store when moving to customize step
  useEffect(() => {
    if (step === "customize" && selectedIds.size > 0 && !store) {
      const context: ShareDesignerSongContext = {
        title,
        artist,
        albumArt,
        spotifyId,
        lines,
        initialSelectedIds: Array.from(selectedIds),
      }
      setStore(createShareDesignerStore(context))
    }
  }, [step, selectedIds, store, title, artist, albumArt, spotifyId, lines])

  // Handle line toggle
  const handleToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Handle continue
  const handleContinue = useCallback(() => {
    if (selectedIds.size > 0) {
      setStep("customize")
    }
  }, [selectedIds.size])

  // Handle back
  const handleBack = useCallback(() => {
    if (step === "customize") {
      setStep("select")
      setStore(null)
      setExportActions(null)
    } else {
      onBack()
    }
  }, [step, onBack])

  // Handle export actions ready
  const handleExportActionsReady = useCallback((actions: ExportActions) => {
    setExportActions(actions)
  }, [])

  // Build preview state for selection view
  const previewLyrics = useMemo(() => {
    const selectedLines = Array.from(selectedIds)
      .map(id => lines.find(l => l.id === id))
      .filter((l): l is LyricLine => l !== null)
      .map(l => ({
        id: l.id,
        originalText: l.text,
        editedText: null,
      }))

    return {
      selectedLines,
      direction: isRTL ? "rtl" as const : "ltr" as const,
    }
  }, [selectedIds, lines, isRTL])

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Header */}
      <ShareDesignerHeader
        step={step}
        title={title}
        artist={artist}
        onBack={handleBack}
        exportActions={step === "customize" ? exportActions ?? undefined : undefined}
      />

      {/* Main content */}
      <main className="flex flex-1 flex-col pt-14">
        {step === "select" ? (
          <div className="flex flex-1 flex-col lg:flex-row">
            {/* Desktop: Preview on left */}
            <div className="hidden flex-1 p-4 lg:flex lg:flex-col">
              <PreviewCanvas
                cardRef={previewCardRef}
                isEditing={isEditing}
                expandedWidth={expandedWidth}
                onEditToggle={() => setIsEditing(prev => !prev)}
                onWidthToggle={() => setExpandedWidth(prev => !prev)}
                hasShadow={DEFAULT_EFFECTS.shadow.enabled}
              >
                <ShareDesignerPreview
                  title={title}
                  artist={artist}
                  albumArt={albumArt}
                  spotifyId={spotifyId}
                  lyrics={previewLyrics}
                  background={DEFAULT_BACKGROUND}
                  typography={{
                    ...DEFAULT_TYPOGRAPHY,
                    alignment: isRTL ? "right" : "left",
                  }}
                  padding={24}
                  albumArtElement={DEFAULT_ELEMENTS.albumArt}
                  metadataElement={DEFAULT_ELEMENTS.metadata}
                  lyricsElement={DEFAULT_ELEMENTS.lyrics}
                  spotifyCodeElement={DEFAULT_ELEMENTS.spotifyCode}
                  brandingElement={DEFAULT_ELEMENTS.branding}
                  effects={DEFAULT_EFFECTS}
                  getDisplayText={lineId =>
                    lines.find(l => l.id === lineId)?.text ?? ""
                  }
                  cardRef={previewCardRef}
                />
              </PreviewCanvas>
            </div>

            {/* Selection panel */}
            <div
              className="flex flex-1 flex-col lg:w-[400px] lg:flex-none"
              style={{
                background: "var(--color-surface1)",
                borderLeft: "1px solid var(--color-border)",
              }}
            >
              <LineSelectionView
                lines={lines}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                onContinue={handleContinue}
                isRTL={isRTL}
              />
            </div>
          </div>
        ) : store ? (
          <CustomizeView
            store={store}
            title={title}
            artist={artist}
            albumArt={albumArt}
            spotifyId={spotifyId}
            onExportActionsReady={handleExportActionsReady}
          />
        ) : null}
      </main>
    </div>
  )
})
