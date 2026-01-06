"use client"

import { springs } from "@/animations"
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  CopySimple,
  DownloadSimple,
  PencilSimple,
  ShareNetwork,
  Sparkle,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { TemplateGallery } from "./TemplateGallery"
import {
  createShareDesignerStore,
  type ShareDesignerStore,
  useShareDesignerState,
} from "./ShareDesignerStore"
import { ShareDesignerPreview } from "./ShareDesignerPreview"
import type { LyricLine, ShareDesignerSongContext } from "./types"
import { useShareExport } from "./useShareExport"

// ============================================================================
// Types
// ============================================================================

type Step = "select" | "customize"

export interface ShareDesignerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly lines: readonly LyricLine[]
  readonly initialSelectedIds?: readonly string[]
  readonly onOpenStudio?: (selectedIds: readonly string[]) => void
}

// ============================================================================
// Line Selection Component
// ============================================================================

interface LineSelectionProps {
  readonly lines: readonly LyricLine[]
  readonly selectedIds: Set<string>
  readonly onToggle: (id: string) => void
  readonly isRTL: boolean
}

const LineSelection = memo(function LineSelection({
  lines,
  selectedIds,
  onToggle,
  isRTL,
}: LineSelectionProps) {
  const selectableLines = useMemo(
    () => lines.filter(line => line.text.trim() !== "" && line.text.trim() !== "♪"),
    [lines],
  )

  return (
    <div className="space-y-1">
      {selectableLines.map(line => {
        const isSelected = selectedIds.has(line.id)
        return (
          <button
            key={line.id}
            type="button"
            onClick={() => onToggle(line.id)}
            dir={isRTL ? "rtl" : undefined}
            className={`relative w-full rounded-lg px-3 py-2 transition-colors ${
              isRTL ? "text-right" : "text-left"
            }`}
            style={{
              background: isSelected ? "var(--color-accent-soft)" : "transparent",
              color: isSelected ? "var(--color-text)" : "var(--color-text2)",
            }}
          >
            <div className="flex w-full items-start gap-3">
              <div
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors"
                style={{
                  borderColor: isSelected ? "var(--color-accent)" : "var(--color-border)",
                  background: isSelected ? "var(--color-accent)" : "transparent",
                }}
              >
                {isSelected && <Check size={12} weight="bold" style={{ color: "white" }} />}
              </div>
              <span className="text-sm leading-relaxed">{line.text}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
})

// ============================================================================
// Customize View Component
// ============================================================================

interface ExportActions {
  readonly isGenerating: boolean
  readonly isSharing: boolean
  readonly isCopied: boolean
  readonly handleDownload: () => Promise<void>
  readonly handleCopy: () => Promise<void>
  readonly handleShare: () => Promise<void>
}

interface CustomizeViewProps {
  readonly store: ShareDesignerStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly spotifyId: string | null
  readonly cardRef: React.RefObject<HTMLDivElement | null>
  readonly previewContainerRef: React.RefObject<HTMLDivElement | null>
  readonly onExportActionsReady: (actions: ExportActions) => void
}

const CustomizeView = memo(function CustomizeView({
  store,
  title,
  artist,
  albumArt,
  spotifyId,
  cardRef,
  previewContainerRef,
  onExportActionsReady,
}: CustomizeViewProps) {
  const state = useShareDesignerState(store)
  const [previewScale, setPreviewScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Export hooks - called unconditionally inside this component
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

  // Get gradient palette from store
  const gradientPalette = store.getGradientPalette()

  // Handle gradient selection
  const handleGradientSelect = useCallback(
    (gradientId: string, gradient: string) => {
      store.setBackground({ type: "gradient", gradient, gradientId })
    },
    [store],
  )

  // Get current gradient ID for selection highlight
  const currentGradientId = state.background.type === "gradient" ? state.background.gradientId : null

  // Calculate scale to fit preview
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
  }, [previewContainerRef, cardRef])

  useLayoutEffect(() => {
    calculateScale()
  }, [calculateScale, state.lyrics.selectedLines.length])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new ResizeObserver(() => calculateScale())
    observer.observe(card)
    window.addEventListener("resize", calculateScale)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", calculateScale)
    }
  }, [calculateScale, cardRef])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Preview */}
      <div
        ref={previewContainerRef}
        className="relative rounded-2xl bg-neutral-200 p-4 pb-14"
      >
        {/* Edit button */}
        <div className="absolute left-2 top-2 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => setIsEditing(prev => !prev)}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{
              background: isEditing ? "var(--color-accent)" : "rgba(0,0,0,0.4)",
              color: isEditing ? "white" : "rgba(255,255,255,0.8)",
            }}
            aria-label={isEditing ? "Done editing" : "Edit text"}
          >
            {isEditing ? (
              <Check size={18} weight="bold" />
            ) : (
              <PencilSimple size={18} weight="bold" />
            )}
          </button>
          {isEditing && store.hasTextEdits() && (
            <button
              type="button"
              onClick={() => store.resetAllLineText()}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{ background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.8)" }}
              aria-label="Reset text"
            >
              <ArrowCounterClockwise size={18} weight="bold" />
            </button>
          )}
        </div>

        {/* Card preview with scaling */}
        <div
          style={{
            height: scaledHeight !== null ? `${scaledHeight}px` : undefined,
            overflow: "visible",
            marginBottom: state.effects.shadow.enabled ? "-16px" : "0",
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
            <div style={{ maxWidth: "384px" }}>
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
              />
            </div>
          </div>
        </div>

        {/* Gradient Selection - inside preview at bottom */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-center">
          <div className="flex gap-1.5 rounded-full px-2 py-1.5" style={{ background: "rgba(0,0,0,0.5)" }}>
            {gradientPalette.map(option => {
              const isSelected = currentGradientId === option.id
              return (
                <motion.button
                  key={option.id}
                  type="button"
                  onClick={() => handleGradientSelect(option.id, option.gradient)}
                  className="h-6 w-6 rounded-full focus:outline-none"
                  style={{
                    background: option.gradient,
                    boxShadow: isSelected
                      ? "0 0 0 2px white"
                      : "inset 0 0 0 1px rgba(255,255,255,0.2)",
                  }}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  aria-pressed={isSelected}
                  aria-label={`Select gradient ${option.id}`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Templates */}
      <div>
        <p className="mb-2 text-sm font-medium" style={{ color: "var(--color-text2)" }}>
          Choose a style
        </p>
        <TemplateGallery
          selectedTemplateId={store.getCurrentTemplateId()}
          onSelect={id => store.applyTemplate(id)}
        />
      </div>
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const ShareDesigner = memo(function ShareDesigner({
  isOpen,
  onClose,
  title,
  artist,
  albumArt,
  spotifyId,
  lines,
  initialSelectedIds,
  onOpenStudio,
}: ShareDesignerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>("select")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [store, setStore] = useState<ShareDesignerStore | null>(null)
  const [exportActions, setExportActions] = useState<ExportActions | null>(null)
  const [showShareMenu, setShowShareMenu] = useState(false)

  // Callback for CustomizeView to provide export actions
  const handleExportActionsReady = useCallback((actions: ExportActions) => {
    setExportActions(actions)
  }, [])

  // Detect RTL
  const isRTL = useMemo(() => {
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
    return lines.some(line => rtlRegex.test(line.text))
  }, [lines])

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      const hasInitialSelection = initialSelectedIds && initialSelectedIds.length > 0
      const initialSet = hasInitialSelection
        ? new Set(initialSelectedIds.filter(id => lines.some(l => l.id === id)))
        : new Set<string>()

      setSelectedIds(initialSet)
      setStep(hasInitialSelection ? "customize" : "select")
      setStore(null)
    }
  }, [isOpen, initialSelectedIds, lines])

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

  // Scroll to top on step change
  useEffect(() => {
    if (step === "customize") {
      scrollContainerRef.current?.scrollTo({ top: 0 })
    }
  }, [step])

  // Handlers
  const toggleLine = useCallback((id: string) => {
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

  const handleNext = useCallback(() => {
    if (selectedIds.size > 0) {
      setStep("customize")
    }
  }, [selectedIds.size])

  const handleBack = useCallback(() => {
    setStep("select")
    setStore(null)
  }, [])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={e => {
            e.stopPropagation()
            handleBackdropClick(e)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={springs.default}
            className="relative mx-0 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl shadow-xl sm:mx-4 sm:max-w-lg sm:rounded-2xl"
            style={{ background: "var(--color-surface1)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div className="flex items-center gap-3">
                {step === "customize" && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:brightness-110"
                    style={{ background: "var(--color-surface2)" }}
                    aria-label="Back"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                  {step === "select" ? "Select Lyrics" : "Customize Card"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:brightness-110"
                style={{ color: "var(--color-text3)" }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div
              ref={scrollContainerRef}
              dir={isRTL ? "rtl" : undefined}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              <AnimatePresence mode="sync" initial={false}>
                {step === "select" ? (
                  <motion.div
                    key="select"
                    initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
                    transition={{ duration: 0.2 }}
                    className="p-4"
                  >
                    <p dir="ltr" className="mb-3 text-sm" style={{ color: "var(--color-text3)" }}>
                      Tap lines to include in your card
                    </p>
                    <LineSelection
                      lines={lines}
                      selectedIds={selectedIds}
                      onToggle={toggleLine}
                      isRTL={isRTL}
                    />
                  </motion.div>
                ) : store ? (
                  <motion.div
                    key="customize"
                    dir="ltr"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CustomizeView
                      store={store}
                      title={title}
                      artist={artist}
                      albumArt={albumArt}
                      spotifyId={spotifyId}
                      cardRef={cardRef}
                      previewContainerRef={previewContainerRef}
                      onExportActionsReady={handleExportActionsReady}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              className="flex flex-col gap-3 p-4"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              {step === "select" ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={selectedIds.size === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  Next
                  <ArrowRight size={20} weight="bold" />
                </button>
              ) : exportActions ? (
                <div className="flex w-full flex-col gap-2">
                  {/* Share button with dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowShareMenu(prev => !prev)}
                      disabled={exportActions.isGenerating}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                      style={{ background: "var(--color-accent)", color: "white" }}
                    >
                      <ShareNetwork size={20} weight="bold" />
                      Share
                      <CaretDown
                        size={16}
                        weight="bold"
                        style={{
                          transform: showShareMenu ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                        }}
                      />
                    </button>

                    {/* Dropdown menu */}
                    <AnimatePresence>
                      {showShareMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl shadow-lg"
                          style={{
                            background: "var(--color-surface2)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              exportActions.handleCopy()
                              setShowShareMenu(false)
                            }}
                            disabled={exportActions.isGenerating}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:opacity-50"
                            style={{ color: "var(--color-text)" }}
                          >
                            {exportActions.isCopied ? (
                              <Check size={20} style={{ color: "var(--color-success)" }} />
                            ) : (
                              <CopySimple size={20} />
                            )}
                            <span>{exportActions.isCopied ? "Copied!" : "Copy to clipboard"}</span>
                          </button>
                          <div style={{ height: 1, background: "var(--color-border)" }} />
                          <button
                            type="button"
                            onClick={() => {
                              exportActions.handleDownload()
                              setShowShareMenu(false)
                            }}
                            disabled={exportActions.isGenerating}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:opacity-50"
                            style={{ color: "var(--color-text)" }}
                          >
                            <DownloadSimple size={20} />
                            <span>Save to device</span>
                          </button>
                          <div style={{ height: 1, background: "var(--color-border)" }} />
                          <button
                            type="button"
                            onClick={() => {
                              exportActions.handleShare()
                              setShowShareMenu(false)
                            }}
                            disabled={exportActions.isGenerating || exportActions.isSharing}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-110 disabled:opacity-50"
                            style={{ color: "var(--color-text)" }}
                          >
                            <ShareNetwork size={20} />
                            <span>Share...</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Open in Studio */}
                  {onOpenStudio && (
                    <button
                      type="button"
                      onClick={() => onOpenStudio(Array.from(selectedIds))}
                      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2"
                      style={{
                        background: "transparent",
                        border: "2px solid var(--color-accent)",
                        color: "var(--color-accent)",
                      }}
                    >
                      <Sparkle size={20} weight="bold" />
                      Open in Studio
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
