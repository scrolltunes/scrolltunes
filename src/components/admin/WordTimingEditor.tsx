"use client"

import { springs } from "@/animations"
import type { EnhancementPayload } from "@/lib/db/schema"
import {
  type GpMetadata,
  type LrcLine,
  type WordPatch,
  type WordTiming,
  alignWords,
  estimateGlobalOffset,
  parseLrcToLines,
  patchesToPayload,
} from "@/lib/gp"
import { Check, PencilSimple, Trash, Warning, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// ============================================================================
// Types
// ============================================================================

interface EditableWord {
  lineIndex: number
  wordIndex: number
  word: string
  startMs: number | null
  durationMs: number | null
  matched: boolean
  gpText?: string | null
}

interface EditableLineData {
  lineIndex: number
  lineStartMs: number
  words: EditableWord[]
}

interface WordTimingEditorProps {
  readonly lrcContent: string
  readonly disabled?: boolean | undefined
  /** Import mode: raw GP words for alignment */
  readonly gpWords?: readonly WordTiming[] | undefined
  /** Import mode: GP metadata (bpm, key, tuning) */
  readonly gpMeta?: GpMetadata | undefined
  /** Edit mode: existing payload to edit */
  readonly initialPayload?: EnhancementPayload | undefined
  /** Callback when payload changes */
  readonly onPayloadChange: (
    payload: EnhancementPayload,
    meta: {
      isDirty: boolean
      coverage: number
      syncOffsetMs: number
      patches: readonly WordPatch[]
    },
  ) => void
  /** Edit mode: external dirty state (for header display) */
  readonly isDirty?: boolean | undefined
  /** Edit mode: callback to remove enhancement */
  readonly onRemove?: (() => void) | undefined
  /** Edit mode: is removal in progress */
  readonly isRemoving?: boolean | undefined
}

// ============================================================================
// Utilities
// ============================================================================

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

function formatOffset(ms: number): string {
  const sign = ms >= 0 ? "+" : ""
  return `${sign}${ms}ms`
}

function parseTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d+):(\d{1,2}(?:\.\d{1,3})?)$/)
  if (!match) return null
  const [, minStr, secStr] = match
  const minutes = Number.parseInt(minStr ?? "0", 10)
  const seconds = Number.parseFloat(secStr ?? "0")
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null
  return Math.round((minutes * 60 + seconds) * 1000)
}

// ============================================================================
// Build editable data from alignment patches (import mode)
// ============================================================================

function buildEditableDataFromPatches(
  lrcLines: readonly LrcLine[],
  patches: readonly WordPatch[],
): EditableLineData[] {
  const patchMap = new Map<string, WordPatch>()
  for (const patch of patches) {
    patchMap.set(`${patch.lineIndex}-${patch.wordIndex}`, patch)
  }

  return lrcLines.map((line, lineIdx) => ({
    lineIndex: lineIdx,
    lineStartMs: line.startMs,
    words: line.words.map((word, wordIdx) => {
      const patch = patchMap.get(`${lineIdx}-${wordIdx}`)
      return {
        lineIndex: lineIdx,
        wordIndex: wordIdx,
        word,
        startMs: patch?.startMs ?? null,
        durationMs: patch?.durationMs ?? null,
        matched: patch !== undefined,
        gpText: patch?.gpText ?? null,
      }
    }),
  }))
}

// ============================================================================
// Build editable data from existing payload (edit mode)
// ============================================================================

function buildEditableDataFromPayload(
  lrcLines: readonly LrcLine[],
  payload: EnhancementPayload,
): EditableLineData[] {
  const lineMap = new Map<
    number,
    Map<number, { start: number; dur: number; lineFirstWordStartMs: number }>
  >()

  for (const line of payload.lines) {
    const wordMap = new Map<number, { start: number; dur: number; lineFirstWordStartMs: number }>()
    const lrcLine = lrcLines[line.idx]
    if (!lrcLine) continue

    const firstWordStart = line.words[0]?.start ?? 0

    for (const word of line.words) {
      wordMap.set(word.idx, {
        start: word.start,
        dur: word.dur,
        lineFirstWordStartMs: lrcLine.startMs + firstWordStart,
      })
    }
    lineMap.set(line.idx, wordMap)
  }

  return lrcLines.map((line, lineIdx) => {
    const wordTimings = lineMap.get(lineIdx)

    return {
      lineIndex: lineIdx,
      lineStartMs: line.startMs,
      words: line.words.map((word, wordIdx) => {
        const timing = wordTimings?.get(wordIdx)
        const lineFirstWordStartMs = wordTimings?.values().next().value?.lineFirstWordStartMs

        return {
          lineIndex: lineIdx,
          wordIndex: wordIdx,
          word,
          startMs:
            timing !== undefined && lineFirstWordStartMs !== undefined
              ? lineFirstWordStartMs + timing.start
              : null,
          durationMs: timing?.dur ?? null,
          matched: timing !== undefined,
        }
      }),
    }
  })
}

// ============================================================================
// Convert editable data back to patches
// ============================================================================

function editableDataToPatches(data: readonly EditableLineData[]): WordPatch[] {
  const patches: WordPatch[] = []
  for (const line of data) {
    for (const word of line.words) {
      if (word.startMs !== null && word.durationMs !== null) {
        patches.push({
          lineIndex: word.lineIndex,
          wordIndex: word.wordIndex,
          startMs: word.startMs,
          durationMs: word.durationMs,
        })
      }
    }
  }
  return patches
}

// ============================================================================
// Word Editor Popup
// ============================================================================

interface WordEditorProps {
  readonly word: EditableWord
  readonly lineStartMs: number
  readonly onSave: (startMs: number, durationMs: number) => void
  readonly onCancel: () => void
  readonly anchorRect: DOMRect | null
  readonly lrcLines: readonly LrcLine[]
  readonly gpWords?: readonly WordTiming[] | undefined
}

function WordEditor({
  word,
  lineStartMs,
  onSave,
  onCancel,
  anchorRect,
  lrcLines,
  gpWords,
}: WordEditorProps) {
  const [startInput, setStartInput] = useState(
    word.startMs !== null ? formatTime(word.startMs) : formatTime(lineStartMs),
  )
  const [durationInput, setDurationInput] = useState(
    word.durationMs !== null ? word.durationMs.toString() : "500",
  )

  const handleSave = () => {
    const startMs = parseTime(startInput)
    const durationMs = Number.parseInt(durationInput, 10)
    if (startMs !== null && !Number.isNaN(durationMs) && durationMs > 0) {
      onSave(startMs, durationMs)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  const lrcAtTimestamp = useMemo(() => {
    const ms = parseTime(startInput)
    if (ms === null) return null

    let matchingLine: LrcLine | null = null
    for (let i = 0; i < lrcLines.length; i++) {
      const line = lrcLines[i]
      if (!line) continue
      if (line.startMs <= ms) {
        matchingLine = line
      } else {
        break
      }
    }
    return matchingLine
  }, [startInput, lrcLines])

  const nearbyGpWords = useMemo(() => {
    if (!gpWords) return []
    return gpWords.filter(gp => Math.abs(gp.startMs - lineStartMs) < 10000).slice(0, 8)
  }, [gpWords, lineStartMs])

  if (!anchorRect) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={springs.default}
      style={{
        position: "fixed",
        left: anchorRect.left,
        top: anchorRect.top - 8,
        transform: "translateY(-100%)",
      }}
      className="z-[100] bg-neutral-800 border border-neutral-700 rounded-lg p-3 shadow-xl min-w-64 max-w-md"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">Edit timing for "{word.word}"</span>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Original LRC reference */}
      {lrcAtTimestamp && (
        <div className="rounded bg-indigo-950/50 border border-indigo-800/50 p-2 mb-3">
          <div className="flex items-center gap-2 text-xs text-indigo-400 mb-1">
            <span className="font-medium">Original LRC</span>
            <span className="text-indigo-500">@ {formatTime(lrcAtTimestamp.startMs)}</span>
          </div>
          <p className="text-sm text-white break-words">
            {lrcAtTimestamp.text || "(instrumental)"}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="word-start-input" className="text-xs text-neutral-400 w-14">
            Start
          </label>
          <input
            id="word-start-input"
            type="text"
            value={startInput}
            onChange={e => setStartInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0:00.00"
            className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="word-duration-input" className="text-xs text-neutral-400 w-14">
            Duration
          </label>
          <input
            id="word-duration-input"
            type="text"
            value={durationInput}
            onChange={e => setDurationInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="500"
            className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
          />
          <span className="text-xs text-neutral-500">ms</span>
        </div>

        {nearbyGpWords.length > 0 && (
          <div className="pt-2 border-t border-neutral-700">
            <p className="text-xs text-neutral-500 mb-1">Nearby GP words:</p>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {nearbyGpWords.map((gp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStartInput(formatTime(gp.startMs))}
                  className="px-1.5 py-0.5 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-300 hover:border-indigo-500 hover:text-white transition-colors"
                >
                  {gp.text} <span className="text-neutral-500">{formatTime(gp.startMs)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-500 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 bg-neutral-700 text-neutral-300 text-sm rounded hover:bg-neutral-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function WordTimingEditor({
  lrcContent,
  disabled = false,
  gpWords,
  gpMeta,
  initialPayload,
  onPayloadChange,
  isDirty,
  onRemove,
  isRemoving,
}: WordTimingEditorProps) {
  const isImportMode = gpWords !== undefined && gpWords.length > 0
  const rawLrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  // Sync offset state (only used in import mode)
  const [syncOffsetMs, setSyncOffsetMs] = useState(0)
  const [suggestedOffsetMs, setSuggestedOffsetMs] = useState<number | null>(null)

  // Reference to initial payload for dirty checking
  const initialPayloadRef = useRef(initialPayload)

  // Estimate sync offset from initial alignment (import mode only)
  useEffect(() => {
    if (!isImportMode || !gpWords) return

    const baseAlignment = alignWords(rawLrcLines, gpWords)
    const median = estimateGlobalOffset(rawLrcLines, baseAlignment.patches)

    if (median === null || Math.abs(median) < 150) {
      setSuggestedOffsetMs(0)
      setSyncOffsetMs(0)
      return
    }

    setSuggestedOffsetMs(median)
    setSyncOffsetMs(median)
  }, [rawLrcLines, gpWords, isImportMode])

  // Apply sync offset to LRC lines (import mode)
  const lrcLines = useMemo(
    () =>
      isImportMode
        ? rawLrcLines.map(line => ({
            ...line,
            startMs: line.startMs + syncOffsetMs,
          }))
        : rawLrcLines,
    [rawLrcLines, syncOffsetMs, isImportMode],
  )

  // Compute initial alignment (import mode)
  const initialAlignment = useMemo(
    () => (isImportMode && gpWords ? alignWords(lrcLines, gpWords) : null),
    [lrcLines, gpWords, isImportMode],
  )

  // Build editable data
  const [editableData, setEditableData] = useState<EditableLineData[]>(() => {
    if (isImportMode && initialAlignment) {
      return buildEditableDataFromPatches(lrcLines, initialAlignment.patches)
    }
    if (initialPayload) {
      return buildEditableDataFromPayload(rawLrcLines, initialPayload)
    }
    return rawLrcLines.map((line, lineIdx) => ({
      lineIndex: lineIdx,
      lineStartMs: line.startMs,
      words: line.words.map((word, wordIdx) => ({
        lineIndex: lineIdx,
        wordIndex: wordIdx,
        word,
        startMs: null,
        durationMs: null,
        matched: false,
      })),
    }))
  })

  // UI state
  const [editingWord, setEditingWord] = useState<{ lineIndex: number; wordIndex: number } | null>(
    null,
  )
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; rect: DOMRect } | null>(null)
  const [activeTab, setActiveTab] = useState<"editor" | "compare">("editor")
  const [selectedCompareWord, setSelectedCompareWord] = useState<{
    lineIndex: number
    wordIndex: number
  } | null>(null)
  const [showTimingMarkers, setShowTimingMarkers] = useState(true)
  const [compareRightView, setCompareRightView] = useState<"enhanced" | "rawGp">("enhanced")

  // Re-compute editable data when alignment changes (import mode)
  useEffect(() => {
    if (isImportMode && initialAlignment) {
      setEditableData(buildEditableDataFromPatches(lrcLines, initialAlignment.patches))
      setEditingWord(null)
      setAnchorRect(null)
    }
  }, [lrcLines, initialAlignment, isImportMode])

  // Re-compute editable data when payload changes (edit mode)
  useEffect(() => {
    if (!isImportMode && initialPayload) {
      initialPayloadRef.current = initialPayload
      setEditableData(buildEditableDataFromPayload(rawLrcLines, initialPayload))
      setEditingWord(null)
      setAnchorRect(null)
    }
  }, [rawLrcLines, initialPayload, isImportMode])

  // Compute stats
  const stats = useMemo(() => {
    let totalWords = 0
    let matchedWords = 0
    for (const line of editableData) {
      for (const word of line.words) {
        totalWords++
        if (word.matched) matchedWords++
      }
    }
    const coverage = totalWords > 0 ? (matchedWords / totalWords) * 100 : 0
    return { totalWords, matchedWords, coverage }
  }, [editableData])

  // Handlers
  const handleWordClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, lineIndex: number, wordIndex: number) => {
      if (disabled) return
      const rect = e.currentTarget.getBoundingClientRect()
      setAnchorRect(rect)
      setEditingWord({ lineIndex, wordIndex })
    },
    [disabled],
  )

  const handleWordSave = useCallback(
    (lineIndex: number, wordIndex: number, startMs: number, durationMs: number) => {
      setEditableData(prev =>
        prev.map(line =>
          line.lineIndex === lineIndex
            ? {
                ...line,
                words: line.words.map(w =>
                  w.wordIndex === wordIndex ? { ...w, startMs, durationMs, matched: true } : w,
                ),
              }
            : line,
        ),
      )
      setEditingWord(null)
    },
    [],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingWord(null)
    setAnchorRect(null)
  }, [])

  // Emit payload changes
  useEffect(() => {
    const patches = editableDataToPatches(editableData)
    const payload = patchesToPayload(patches, rawLrcLines, 1, gpMeta, gpWords)

    let isDirty = false
    if (initialPayloadRef.current) {
      isDirty = !payloadsEqual(payload, initialPayloadRef.current)
    } else {
      isDirty = patches.length > 0
    }

    onPayloadChange(payload, {
      isDirty,
      coverage: stats.coverage,
      syncOffsetMs,
      patches,
    })
  }, [editableData, rawLrcLines, gpMeta, gpWords, onPayloadChange, stats.coverage, syncOffsetMs])

  const coveragePercent = Math.round(stats.coverage)
  const coverageColor =
    coveragePercent >= 90
      ? "text-emerald-400"
      : coveragePercent >= 70
        ? "text-amber-400"
        : "text-red-400"

  // Get gpWords for display (from prop or from initialPayload)
  const displayGpWords = gpWords ?? initialPayload?.gpWords

  return (
    <div className="rounded-xl bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          Word Alignment
          {isDirty && <span className="text-xs text-amber-400 font-normal">(unsaved)</span>}
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {stats.matchedWords} / {stats.totalWords} words timed
          </span>
          <span className={`text-sm font-medium ${coverageColor}`}>
            {coveragePercent}% coverage
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving || disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50"
            >
              <Trash size={14} />
              <span>{isRemoving ? "Removing..." : "Remove"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync offset slider (import mode only) */}
      {isImportMode && (
        <div className="mb-4">
          <label htmlFor="sync-offset-slider" className="block text-xs text-neutral-400 mb-1">
            Sync Offset (GP − LRC): {formatOffset(syncOffsetMs)}
            {suggestedOffsetMs !== null && suggestedOffsetMs !== 0 && (
              <span className="ml-1 text-[10px] text-neutral-500">
                (auto-detected: {formatOffset(suggestedOffsetMs)})
              </span>
            )}
          </label>
          <input
            id="sync-offset-slider"
            type="range"
            min={-3000}
            max={3000}
            step={50}
            value={syncOffsetMs}
            onChange={e => setSyncOffsetMs(Number(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-1">
            <span>-3000ms</span>
            <button
              type="button"
              onClick={() => setSyncOffsetMs(suggestedOffsetMs ?? 0)}
              disabled={disabled || syncOffsetMs === (suggestedOffsetMs ?? 0)}
              className="text-indigo-400 hover:text-indigo-300 disabled:text-neutral-600 disabled:cursor-not-allowed"
            >
              Reset to auto
            </button>
            <span>+3000ms</span>
          </div>
        </div>
      )}

      {/* Low coverage warning */}
      {coveragePercent < 70 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="mb-4 rounded-lg bg-amber-900/30 border border-amber-700/50 p-3 flex items-start gap-2"
        >
          <Warning size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            Low coverage. Click on unmatched (red) words to manually add timing.
          </p>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-neutral-800 rounded-lg p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("editor")}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            activeTab === "editor"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-neutral-300"
          }`}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("compare")
            setSelectedCompareWord(null)
          }}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            activeTab === "compare"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-neutral-300"
          }`}
        >
          Compare
        </button>
      </div>

      {/* Compare Tab */}
      {activeTab === "compare" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showTimingMarkers}
                onChange={e => setShowTimingMarkers(e.target.checked)}
                className="rounded border-neutral-600 bg-neutral-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
              />
              Show timing markers
            </label>
            <div className="flex bg-neutral-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setCompareRightView("enhanced")}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  compareRightView === "enhanced"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-neutral-300"
                }`}
              >
                Enhanced
              </button>
              <button
                type="button"
                onClick={() => setCompareRightView("rawGp")}
                disabled={!displayGpWords || displayGpWords.length === 0}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  compareRightView === "rawGp"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-neutral-300"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Raw GP
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Left: Raw LRC */}
            <div className="bg-neutral-950 rounded-lg p-3 max-h-96 overflow-y-auto">
              <div className="text-xs text-neutral-500 mb-2 font-medium sticky top-0 bg-neutral-950 pb-1">
                Raw LRC
              </div>
              <div className="space-y-2 font-mono text-xs">
                {lrcLines.map((line, lineIdx) => (
                  <div key={lineIdx} className="flex gap-2 py-0.5">
                    <span className="text-neutral-600 flex-shrink-0">
                      [{formatTime(line.startMs)}]
                    </span>
                    <div className="flex flex-wrap gap-x-1">
                      {line.words.map((word, wordIdx) => {
                        const isSelected =
                          selectedCompareWord?.lineIndex === lineIdx &&
                          selectedCompareWord?.wordIndex === wordIdx
                        const editableWord = editableData[lineIdx]?.words[wordIdx]
                        const hasMatch = editableWord?.matched ?? false
                        return (
                          <button
                            key={wordIdx}
                            type="button"
                            ref={el => {
                              if (isSelected && el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" })
                              }
                            }}
                            onClick={() =>
                              setSelectedCompareWord(
                                isSelected ? null : { lineIndex: lineIdx, wordIndex: wordIdx },
                              )
                            }
                            className={`transition-colors rounded px-0.5 ${
                              isSelected
                                ? "bg-yellow-500 text-black"
                                : hasMatch
                                  ? "text-emerald-400 hover:bg-emerald-900/30"
                                  : "text-red-400 hover:bg-red-900/30"
                            }`}
                          >
                            {word}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Enhanced or Raw GP */}
            <div className="bg-neutral-950 rounded-lg p-3 max-h-96 overflow-y-auto">
              <div className="text-xs text-neutral-500 mb-2 font-medium sticky top-0 bg-neutral-950 pb-1">
                {compareRightView === "enhanced" ? "Enhanced (with timing)" : "Raw GP Extraction"}
              </div>
              {compareRightView === "enhanced" ? (
                <div className="space-y-2 font-mono text-xs">
                  {editableData.map(line => (
                    <div key={line.lineIndex} className="flex gap-2 py-0.5">
                      <span className="text-neutral-600 flex-shrink-0">
                        [{formatTime(line.lineStartMs)}]
                      </span>
                      <div className="flex flex-wrap gap-x-1">
                        {line.words.map(word => {
                          const isSelected =
                            selectedCompareWord?.lineIndex === word.lineIndex &&
                            selectedCompareWord?.wordIndex === word.wordIndex
                          return (
                            <button
                              ref={el => {
                                if (isSelected && el) {
                                  el.scrollIntoView({ behavior: "smooth", block: "center" })
                                }
                              }}
                              key={word.wordIndex}
                              type="button"
                              onClick={() =>
                                setSelectedCompareWord(
                                  isSelected
                                    ? null
                                    : { lineIndex: word.lineIndex, wordIndex: word.wordIndex },
                                )
                              }
                              className={`transition-colors rounded px-0.5 ${
                                isSelected
                                  ? "bg-yellow-500 text-black"
                                  : word.matched
                                    ? "text-emerald-400 hover:bg-emerald-900/30"
                                    : "text-red-400 hover:bg-red-900/30"
                              }`}
                            >
                              {word.matched && showTimingMarkers && (
                                <span className="text-indigo-400 mr-0.5">
                                  &lt;{formatTime(word.startMs ?? 0)}&gt;
                                </span>
                              )}
                              {word.word}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayGpWords && displayGpWords.length > 0 ? (
                <div className="font-mono text-xs leading-relaxed">
                  {displayGpWords.map((gpWord, idx) => (
                    <span
                      key={idx}
                      className="inline-block mr-1 text-cyan-400"
                      title={`${formatTime(gpWord.startMs)} (${"durationMs" in gpWord ? gpWord.durationMs : "?"}ms)`}
                    >
                      {showTimingMarkers && (
                        <span className="text-indigo-400 mr-0.5 text-[10px]">
                          &lt;{formatTime(gpWord.startMs)}&gt;
                        </span>
                      )}
                      {gpWord.text}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-500 text-sm italic">No raw GP data available.</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Editor Tab */}
      {activeTab === "editor" && (
        <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
          {editableData.map(line => {
            const matchCount = line.words.filter(w => w.matched).length
            const totalWords = line.words.length

            return (
              <div
                key={line.lineIndex}
                className={`flex items-start gap-3 py-1.5 px-2 rounded ${
                  matchCount === totalWords
                    ? "bg-emerald-900/20"
                    : matchCount > 0
                      ? "bg-amber-900/20"
                      : "bg-red-900/20"
                }`}
              >
                <span className="text-neutral-500 flex-shrink-0 w-16 mt-3">
                  [{formatTime(line.lineStartMs)}]
                </span>
                <div className="flex-1 flex flex-wrap gap-x-1 items-end">
                  {line.words.map(word => {
                    const isEditing =
                      editingWord?.lineIndex === word.lineIndex &&
                      editingWord?.wordIndex === word.wordIndex

                    return (
                      <span key={word.wordIndex} className="inline-flex flex-col items-center">
                        <span
                          className="flex items-center justify-center h-3 -mb-0.5"
                          onMouseEnter={
                            word.matched
                              ? e => {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setHoverTooltip({
                                    text: `${formatTime(word.startMs ?? 0)} (${word.durationMs}ms)`,
                                    rect,
                                  })
                                }
                              : undefined
                          }
                          onMouseLeave={word.matched ? () => setHoverTooltip(null) : undefined}
                        >
                          {word.matched && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={e => handleWordClick(e, word.lineIndex, word.wordIndex)}
                          disabled={disabled}
                          className={`${
                            word.matched
                              ? "text-emerald-300 hover:text-emerald-200"
                              : "text-red-400 hover:text-red-300"
                          } hover:underline cursor-pointer disabled:cursor-not-allowed group inline-flex items-center gap-0.5`}
                          title={word.matched ? undefined : "Click to add timing"}
                        >
                          {word.word}
                          {!word.matched && (
                            <PencilSimple
                              size={10}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          )}
                        </button>
                        {isEditing && (
                          <WordEditor
                            word={word}
                            lineStartMs={line.lineStartMs}
                            onSave={(startMs, durationMs) =>
                              handleWordSave(word.lineIndex, word.wordIndex, startMs, durationMs)
                            }
                            onCancel={handleCancelEdit}
                            anchorRect={anchorRect}
                            lrcLines={lrcLines}
                            gpWords={gpWords}
                          />
                        )}
                      </span>
                    )
                  })}
                </div>
                <span className="flex-shrink-0 w-6 mt-3">
                  {matchCount === totalWords ? (
                    <Check size={16} className="text-emerald-400" />
                  ) : (
                    <span className="text-xs text-neutral-500">
                      {matchCount}/{totalWords}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {disabled && activeTab === "editor" && (
        <div className="mt-4 text-center text-sm text-neutral-500">Processing...</div>
      )}

      {/* Fixed tooltip for timing dots */}
      {hoverTooltip && (
        <div
          className="fixed z-[100] px-1.5 py-0.5 text-[10px] text-white bg-neutral-900 border border-neutral-700 rounded whitespace-nowrap pointer-events-none"
          style={{
            left: hoverTooltip.rect.left + hoverTooltip.rect.width / 2,
            top: hoverTooltip.rect.top - 4,
            transform: "translate(-50%, -100%)",
          }}
        >
          {hoverTooltip.text}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function payloadsEqual(a: EnhancementPayload, b: EnhancementPayload): boolean {
  if (a.lines.length !== b.lines.length) return false

  for (let i = 0; i < a.lines.length; i++) {
    const lineA = a.lines[i]
    const lineB = b.lines[i]
    if (!lineA || !lineB) return false
    if (lineA.idx !== lineB.idx) return false
    if (lineA.words.length !== lineB.words.length) return false

    for (let j = 0; j < lineA.words.length; j++) {
      const wordA = lineA.words[j]
      const wordB = lineB.words[j]
      if (!wordA || !wordB) return false
      if (wordA.idx !== wordB.idx || wordA.start !== wordB.start || wordA.dur !== wordB.dur) {
        return false
      }
    }
  }

  return true
}
