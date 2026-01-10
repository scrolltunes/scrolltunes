"use client"

import { springs } from "@/animations"
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type ShareExperienceStore,
  createShareExperienceStore,
  useShareExperienceMode,
  useShareExperienceStep,
} from "./ShareExperienceStore"
import type { LyricLine, ShareDesignerSongContext } from "./designer/types"

// ============================================================================
// Types
// ============================================================================

export interface ShareExperienceProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId: string | null
  readonly lines: readonly LyricLine[]
  readonly initialSelectedIds?: readonly string[]
}

// ============================================================================
// Line Selection Component (Inline for now, will be extracted to shared/)
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
// Compact View Placeholder (Task 6)
// ============================================================================

interface CompactViewProps {
  readonly store: ShareExperienceStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId: string | null
}

const CompactView = memo(function CompactView({
  store: _store,
  title: _title,
  artist: _artist,
  albumArt: _albumArt,
  albumArtLarge: _albumArtLarge,
  spotifyId: _spotifyId,
}: CompactViewProps) {
  // Placeholder - will be implemented in Task 6
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <p className="text-sm" style={{ color: "var(--color-text3)" }}>
        Compact customize view
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--color-text3)" }}>
        (Coming in Task 6)
      </p>
    </div>
  )
})

// ============================================================================
// Expanded View Placeholder (Task 15)
// ============================================================================

interface ExpandedViewProps {
  readonly store: ShareExperienceStore
  readonly title: string
  readonly artist: string
  readonly albumArt: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId: string | null
}

const ExpandedView = memo(function ExpandedView({
  store: _store,
  title: _title,
  artist: _artist,
  albumArt: _albumArt,
  albumArtLarge: _albumArtLarge,
  spotifyId: _spotifyId,
}: ExpandedViewProps) {
  // Placeholder - will be implemented in Task 15
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <p className="text-sm" style={{ color: "var(--color-text3)" }}>
        Expanded studio view
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--color-text3)" }}>
        (Coming in Task 15)
      </p>
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const ShareExperience = memo(function ShareExperience({
  isOpen,
  onClose,
  title,
  artist,
  albumArt,
  albumArtLarge,
  spotifyId,
  lines,
  initialSelectedIds,
}: ShareExperienceProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Local selection state for the select step (before store is created)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [store, setStore] = useState<ShareExperienceStore | null>(null)

  // Detect RTL from lyrics
  const isRTL = useMemo(() => {
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
    return lines.some(line => rtlRegex.test(line.text))
  }, [lines])

  // Get mode and step from store (or default to compact/select)
  const mode = store ? useShareExperienceMode(store) : "compact"
  const step = store ? useShareExperienceStep(store) : "select"

  // Determine if we're in select step (before store exists) or with store
  const isSelectStep = !store || step === "select"

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      const hasInitialSelection = initialSelectedIds && initialSelectedIds.length > 0
      const initialSet = hasInitialSelection
        ? new Set(initialSelectedIds.filter(id => lines.some(l => l.id === id)))
        : new Set<string>()

      setSelectedIds(initialSet)

      // If we have initial selection, create store and move to customize
      if (hasInitialSelection) {
        const context: ShareDesignerSongContext = {
          title,
          artist,
          albumArt,
          spotifyId,
          lines,
          initialSelectedIds: Array.from(initialSet),
        }
        const newStore = createShareExperienceStore(context)
        newStore.setStep("customize")
        setStore(newStore)
      } else {
        setStore(null)
      }
    }
  }, [isOpen, initialSelectedIds, lines, title, artist, albumArt, spotifyId])

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStore(null)
      setSelectedIds(new Set())
    }
  }, [isOpen])

  // Scroll to top on step change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [step])

  // Toggle line selection
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

  // Move to customize step
  const handleNext = useCallback(() => {
    if (selectedIds.size === 0) return

    const context: ShareDesignerSongContext = {
      title,
      artist,
      albumArt,
      spotifyId,
      lines,
      initialSelectedIds: Array.from(selectedIds),
    }
    const newStore = createShareExperienceStore(context)
    newStore.setStep("customize")
    setStore(newStore)
  }, [selectedIds, title, artist, albumArt, spotifyId, lines])

  // Go back to select step
  const handleBack = useCallback(() => {
    if (store) {
      // Preserve selection when going back
      const currentSelection = store.getSnapshot().lyrics.selectedLines.map(l => l.id)
      setSelectedIds(new Set(currentSelection))
      store.setStep("select")
    }
  }, [store])

  // Close modal on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // Handle escape key
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

  // Determine header title based on step and mode
  const headerTitle = useMemo(() => {
    if (isSelectStep) return "Select Lyrics"
    if (mode === "expanded") return "Studio"
    return "Customize"
  }, [isSelectStep, mode])

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
            className="relative mx-0 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl shadow-xl sm:mx-4 sm:max-w-xl sm:rounded-2xl"
            style={{ background: "var(--color-surface1)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div className="flex items-center gap-3">
                {!isSelectStep && (
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
                  {headerTitle}
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
                {isSelectStep ? (
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
                ) : store && mode === "compact" ? (
                  <motion.div
                    key="compact"
                    dir="ltr"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CompactView
                      store={store}
                      title={title}
                      artist={artist}
                      albumArt={albumArt}
                      albumArtLarge={albumArtLarge ?? null}
                      spotifyId={spotifyId}
                    />
                  </motion.div>
                ) : store && mode === "expanded" ? (
                  <motion.div
                    key="expanded"
                    dir="ltr"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ExpandedView
                      store={store}
                      title={title}
                      artist={artist}
                      albumArt={albumArt}
                      albumArtLarge={albumArtLarge ?? null}
                      spotifyId={spotifyId}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-4" style={{ borderTop: "1px solid var(--color-border)" }}>
              {isSelectStep ? (
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
              ) : (
                // Placeholder for customize mode footer (will be implemented in CompactView/ExpandedView)
                <div className="flex-1">
                  <p className="text-center text-sm" style={{ color: "var(--color-text3)" }}>
                    Footer actions (Task 6/15)
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
