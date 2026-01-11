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
import { CompactView, type CompactViewRef } from "./compact"
import type { LyricLine, ShareDesignerSongContext } from "./designer/types"
import { ExpandedView, type ExpandedViewRef } from "./expanded"
import {
  COLLAPSE_DURATION,
  EXPAND_DURATION,
  getModalClasses,
  prefersReducedMotion,
} from "./transitions"

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
  const compactViewRef = useRef<CompactViewRef>(null)
  const expandedViewRef = useRef<ExpandedViewRef>(null)

  // Local selection state for the select step (before store is created)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [store, setStore] = useState<ShareExperienceStore | null>(null)

  // Detect RTL from lyrics
  const isRTL = useMemo(() => {
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
    return lines.some(line => rtlRegex.test(line.text))
  }, [lines])

  // Get mode and step from store (hooks handle null store safely)
  const mode = useShareExperienceMode(store)
  const step = useShareExperienceStep(store)

  // Track previous mode for transition direction
  const prevModeRef = useRef(mode)
  const isExpanding = mode === "expanded" && prevModeRef.current === "compact"
  const isCollapsing = mode === "compact" && prevModeRef.current === "expanded"

  // Update previous mode after render
  useEffect(() => {
    prevModeRef.current = mode
  }, [mode])

  // Determine if we're in select step (before store exists) or with store
  const isSelectStep = !store || step === "select"

  // Check reduced motion preference once
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  // Calculate transition duration based on direction
  const modeTransitionDuration = useMemo(() => {
    if (reducedMotion) return 0
    return isExpanding ? EXPAND_DURATION : COLLAPSE_DURATION
  }, [reducedMotion, isExpanding])

  // Content transition duration (slightly shorter than container)
  const contentTransitionDuration = useMemo(() => {
    if (reducedMotion) return 0
    return modeTransitionDuration * 0.6
  }, [reducedMotion, modeTransitionDuration])

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

  // Focus management after mode transitions
  useEffect(() => {
    if (!store) return

    // Wait for transition to complete before managing focus
    const transitionDuration = reducedMotion ? 0 : modeTransitionDuration * 1000
    const timer = setTimeout(() => {
      // Focus the modal container for keyboard accessibility
      const container = scrollContainerRef.current?.closest('[role="dialog"]') as HTMLElement | null
      if (container && document.activeElement !== container) {
        // Find first focusable element in the new content
        const focusable = container.querySelector<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]',
        )
        focusable?.focus()
      }
    }, transitionDuration + 50) // Small delay after transition completes

    return () => clearTimeout(timer)
  }, [mode, store, reducedMotion, modeTransitionDuration])

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

  // Collapse to compact mode
  const handleCollapseToCompact = useCallback(() => {
    if (store) {
      store.setMode("compact")
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
    if (isSelectStep) {
      const count = selectedIds.size
      if (count === 0) return "Select Lyrics"
      return `Select Lyrics (${count})`
    }
    if (mode === "expanded") return "Studio"
    return "Customize"
  }, [isSelectStep, mode, selectedIds.size])

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
            role="dialog"
            aria-modal="true"
            aria-label={headerTitle}
            layout
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              ...springs.default,
              layout: {
                duration: modeTransitionDuration,
                ease: isExpanding ? "easeOut" : "easeIn",
              },
            }}
            className={`relative mx-0 flex w-full flex-col overflow-hidden shadow-xl ${getModalClasses(mode)}`}
            style={{ background: "var(--color-surface1)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header - shown in select and compact modes, in expanded mode show simplified header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <div className="flex items-center gap-3">
                {!isSelectStep && (
                  <button
                    type="button"
                    onClick={mode === "expanded" ? handleCollapseToCompact : handleBack}
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:brightness-110"
                    style={{ background: "var(--color-surface2)" }}
                    aria-label={mode === "expanded" ? "Less options" : "Back"}
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
                    transition={{
                      duration: contentTransitionDuration,
                      ease: "easeOut",
                    }}
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
                    initial={{ opacity: 0, x: isCollapsing ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: isExpanding ? -20 : 20 }}
                    transition={{
                      duration: contentTransitionDuration,
                      ease: isCollapsing ? "easeOut" : "easeIn",
                    }}
                    className="p-4"
                  >
                    <CompactView
                      ref={compactViewRef}
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
                    initial={{ opacity: 0, x: isExpanding ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: isCollapsing ? 20 : -20 }}
                    transition={{
                      duration: contentTransitionDuration,
                      ease: isExpanding ? "easeOut" : "easeIn",
                    }}
                    className="h-full"
                  >
                    <ExpandedView
                      ref={expandedViewRef}
                      store={store}
                      title={title}
                      artist={artist}
                      albumArt={albumArt}
                      albumArtLarge={albumArtLarge ?? null}
                      spotifyId={spotifyId}
                      onCollapseToCompact={handleCollapseToCompact}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Footer - only shown in select step */}
            {isSelectStep && (
              <div
                className="flex gap-3 p-4"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
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
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
