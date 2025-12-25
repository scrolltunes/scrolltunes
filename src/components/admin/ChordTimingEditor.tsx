"use client"

import { springs } from "@/animations"
import {
  type ChordEnhancementPayloadV1,
  type ChordEvent,
  type EnhancedChordLine,
  type LineChord,
  type TrackAnalysis,
  type WordPatch,
  alignChordsToLrc,
  alignChordsToWords,
  calculateCoverage,
  generateChordPayload,
  parseLrcToLines,
} from "@/lib/gp"
import { CaretDown, Check, Trash, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// ============================================================================
// Types
// ============================================================================

interface ChordTimingEditorProps {
  readonly lrcContent: string
  readonly disabled?: boolean

  /** Import mode: GP chord events */
  readonly gpChords?: readonly ChordEvent[]
  /** Import mode: GP track analysis */
  readonly tracks?: readonly TrackAnalysis[]
  /** Import mode: selected track index */
  readonly selectedTrackIndex?: number
  /** Import mode: track selection callback */
  readonly onTrackChange?: (index: number) => void
  /** Import mode: word patches for word-level alignment */
  readonly wordPatches?: readonly WordPatch[]
  /** Import mode: sync offset from word timing alignment */
  readonly syncOffsetMs?: number

  /** Edit mode: existing payload to edit */
  readonly initialPayload?: ChordEnhancementPayloadV1

  /** Callback when payload changes */
  readonly onPayloadChange: (
    payload: ChordEnhancementPayloadV1,
    meta: { isDirty: boolean; coverage: number },
  ) => void

  /** Edit mode: external dirty state (for header display) */
  readonly isDirty?: boolean
  /** Edit mode: callback to remove enhancement */
  readonly onRemove?: () => void
  /** Edit mode: is removal in progress */
  readonly isRemoving?: boolean
}

interface SelectedChord {
  lineIdx: number
  chordIdx: number
}

interface DragData {
  lineIdx: number
  chordIdx: number
  chordName: string
}

interface EditingChord {
  lineIdx: number
  chordIdx: number
  wordIdx: number | undefined
  originalName: string
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

// ============================================================================
// Word-Level Chord Display (with drag-drop)
// ============================================================================

interface WordLevelChordDisplayProps {
  readonly words: readonly string[]
  readonly chords: readonly LineChord[]
  readonly lineIdx: number
  readonly selectedChord: SelectedChord | null
  readonly onChordClick: (lineIdx: number, chordIdx: number) => void
  readonly onChordDoubleClick: (lineIdx: number, chordIdx: number, wordIdx: number | undefined, chordName: string) => void
  readonly onWordClick: (lineIdx: number, wordIdx: number) => void
  readonly onChordMove: (lineIdx: number, chordIdx: number, newWordIdx: number) => void
  readonly onAddChord: (lineIdx: number, wordIdx: number) => void
  readonly disabled: boolean
  readonly dragState: DragData | null
  readonly onDragStart: (data: DragData) => void
  readonly onDragEnd: () => void
}

function WordLevelChordDisplay({
  words,
  chords,
  lineIdx,
  selectedChord,
  onChordClick,
  onChordDoubleClick,
  onWordClick,
  onChordMove,
  onAddChord,
  disabled,
  dragState,
  onDragStart,
  onDragEnd,
}: WordLevelChordDisplayProps) {
  const [dropTargetWordIdx, setDropTargetWordIdx] = useState<number | null>(null)

  const chordsByWord = new Map<number, Array<{ chord: LineChord; chordIdx: number }>>()
  const uncategorizedChords: Array<{ chord: LineChord; chordIdx: number }> = []

  chords.forEach((chord, chordIdx) => {
    if (chord.wordIdx !== undefined) {
      const existing = chordsByWord.get(chord.wordIdx) ?? []
      existing.push({ chord, chordIdx })
      chordsByWord.set(chord.wordIdx, existing)
    } else {
      uncategorizedChords.push({ chord, chordIdx })
    }
  })

  const handleDragStart = (e: React.DragEvent, chordIdx: number, chordName: string) => {
    if (disabled) return
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", chordName)
    onDragStart({ lineIdx, chordIdx, chordName })
  }

  const handleDragEnd = () => {
    setDropTargetWordIdx(null)
    onDragEnd()
  }

  const handleDragOver = (e: React.DragEvent, wordIdx: number) => {
    if (!dragState || dragState.lineIdx !== lineIdx || disabled) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTargetWordIdx(wordIdx)
  }

  const handleDragLeave = () => {
    setDropTargetWordIdx(null)
  }

  const handleDrop = (e: React.DragEvent, wordIdx: number) => {
    e.preventDefault()
    if (!dragState || dragState.lineIdx !== lineIdx || disabled) return
    onChordMove(lineIdx, dragState.chordIdx, wordIdx)
    setDropTargetWordIdx(null)
    onDragEnd() // Clear drag state immediately since dragend may not fire after re-render
  }

  const isDraggingOnThisLine = dragState !== null && dragState.lineIdx === lineIdx

  if (words.length === 0) {
    return (
      <div className="text-neutral-500 flex items-center gap-2">
        (instrumental)
        {uncategorizedChords.length > 0 && (
          <div className="flex gap-1">
            {uncategorizedChords.map(({ chord, chordIdx }) => {
              const isSelected =
                selectedChord?.lineIdx === lineIdx && selectedChord?.chordIdx === chordIdx
              const isDragging = dragState?.lineIdx === lineIdx && dragState?.chordIdx === chordIdx
              return (
                <button
                  key={chordIdx}
                  type="button"
                  draggable={!disabled}
                  onDragStart={e => handleDragStart(e, chordIdx, chord.chord)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onChordClick(lineIdx, chordIdx)}
                  onDoubleClick={() => onChordDoubleClick(lineIdx, chordIdx, chord.wordIdx, chord.chord)}
                  disabled={disabled}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                    isDragging
                      ? "opacity-50 ring-2 ring-indigo-400"
                      : isSelected
                        ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                  } disabled:cursor-not-allowed`}
                  title={`Offset: +${chord.start}ms, double-click to edit`}
                >
                  {chord.chord}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 items-end">
      {words.map((word, wordIdx) => {
        const wordChords = chordsByWord.get(wordIdx)
        const hasSelectedChord = selectedChord !== null && selectedChord.lineIdx === lineIdx
        const isDropTarget = dropTargetWordIdx === wordIdx && isDraggingOnThisLine
        return (
          <div
            key={wordIdx}
            className={`flex flex-col items-start rounded transition-all ${
              isDropTarget
                ? "bg-indigo-600/30 ring-2 ring-indigo-400 scale-105"
                : isDraggingOnThisLine
                  ? "bg-neutral-800/30"
                  : ""
            }`}
            onDragOver={e => handleDragOver(e, wordIdx)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, wordIdx)}
          >
            <div
              className={`flex gap-0.5 mb-0.5 min-h-[18px] min-w-[20px] rounded transition-colors ${
                isDropTarget && (!wordChords || wordChords.length === 0)
                  ? "border-2 border-dashed border-indigo-400 bg-indigo-600/20"
                  : ""
              }`}
            >
              {wordChords && wordChords.length > 0 ? (
                wordChords.map(({ chord, chordIdx }) => {
                  const isSelected =
                    selectedChord?.lineIdx === lineIdx && selectedChord?.chordIdx === chordIdx
                  const isDragging =
                    dragState?.lineIdx === lineIdx && dragState?.chordIdx === chordIdx
                  return (
                    <button
                      key={chordIdx}
                      type="button"
                      draggable={!disabled}
                      onDragStart={e => handleDragStart(e, chordIdx, chord.chord)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onChordClick(lineIdx, chordIdx)}
                      onDoubleClick={() => onChordDoubleClick(lineIdx, chordIdx, chord.wordIdx, chord.chord)}
                      disabled={disabled}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        isDragging
                          ? "opacity-50 ring-2 ring-indigo-400"
                          : isSelected
                            ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                            : "bg-indigo-600 text-white hover:bg-indigo-500"
                      } disabled:cursor-not-allowed`}
                      title="Double-click to edit"
                    >
                      {chord.chord}
                    </button>
                  )
                })
              ) : (
                <button
                  type="button"
                  onClick={() => onAddChord(lineIdx, wordIdx)}
                  disabled={disabled}
                  className="w-full h-full min-h-[18px] rounded border border-dashed border-neutral-600 hover:border-indigo-400 hover:bg-indigo-600/10 transition-colors text-[10px] text-neutral-500 hover:text-indigo-400 disabled:cursor-not-allowed"
                  title="Click to add chord"
                >
                  +
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onWordClick(lineIdx, wordIdx)}
              disabled={disabled || !hasSelectedChord}
              className={`text-neutral-200 transition-all rounded px-0.5 ${
                wordChords && wordChords.length > 0 ? "border-b border-indigo-500" : ""
              } ${hasSelectedChord && !disabled ? "hover:text-indigo-300 cursor-pointer" : "cursor-default"}`}
            >
              {word}
            </button>
          </div>
        )
      })}
      {uncategorizedChords.length > 0 && (
        <div className="ml-2 flex gap-1">
          {uncategorizedChords.map(({ chord, chordIdx }) => {
            const isSelected =
              selectedChord?.lineIdx === lineIdx && selectedChord?.chordIdx === chordIdx
            const isDragging = dragState?.lineIdx === lineIdx && dragState?.chordIdx === chordIdx
            return (
              <button
                key={chordIdx}
                type="button"
                draggable={!disabled}
                onDragStart={e => handleDragStart(e, chordIdx, chord.chord)}
                onDragEnd={handleDragEnd}
                onClick={() => onChordClick(lineIdx, chordIdx)}
                onDoubleClick={() => onChordDoubleClick(lineIdx, chordIdx, chord.wordIdx, chord.chord)}
                disabled={disabled}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  isDragging
                    ? "opacity-50 ring-2 ring-indigo-400"
                    : isSelected
                      ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                } disabled:cursor-not-allowed`}
                title="Double-click to edit"
              >
                {chord.chord}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ChordTimingEditor({
  lrcContent,
  disabled = false,
  gpChords,
  tracks,
  selectedTrackIndex,
  onTrackChange,
  wordPatches,
  syncOffsetMs = 0,
  initialPayload,
  onPayloadChange,
  isDirty,
  onRemove,
  isRemoving,
}: ChordTimingEditorProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  // Determine mode
  const isImportMode = gpChords !== undefined && gpChords.length > 0

  // Fine-tune offset (import mode only)
  const [timeOffset, setTimeOffset] = useState(0)
  const effectiveOffsetMs = syncOffsetMs + timeOffset

  const transform = useMemo(
    () => (effectiveOffsetMs !== 0 ? { kind: "offset" as const, ms: effectiveOffsetMs } : undefined),
    [effectiveOffsetMs],
  )

  // Memoize wordPatches to prevent unnecessary recalculations
  const stableWordPatches = useMemo(() => wordPatches, [JSON.stringify(wordPatches)])

  // Compute initial lines from GP alignment or existing payload
  const computedLines = useMemo(() => {
    if (isImportMode && gpChords) {
      return stableWordPatches && stableWordPatches.length > 0
        ? alignChordsToWords(gpChords, lrcLines, stableWordPatches, transform)
        : alignChordsToLrc(gpChords, lrcLines, transform)
    }
    if (initialPayload) {
      return [...initialPayload.lines]
    }
    return []
  }, [isImportMode, gpChords, lrcLines, stableWordPatches, transform, initialPayload])

  // Track initial payload for dirty detection
  const initialLinesRef = useRef<readonly EnhancedChordLine[]>(
    initialPayload?.lines ?? computedLines,
  )
  useEffect(() => {
    if (initialPayload) {
      initialLinesRef.current = initialPayload.lines
    }
  }, [initialPayload])

  // Editable state
  const [editedLines, setEditedLines] = useState<EnhancedChordLine[]>(computedLines)
  const [selectedChord, setSelectedChord] = useState<SelectedChord | null>(null)
  const [dragState, setDragState] = useState<DragData | null>(null)
  const [addingChord, setAddingChord] = useState<{ lineIdx: number; wordIdx: number } | null>(null)
  const [newChordName, setNewChordName] = useState("")
  const [editingChord, setEditingChord] = useState<EditingChord | null>(null)
  const [editChordName, setEditChordName] = useState("")

  // Reset when transform changes (e.g., offset slider in import mode)
  // We use a ref to track if initial data has been loaded
  const hasInitializedRef = useRef(false)
  const prevTransformRef = useRef(transform)
  useEffect(() => {
    const transformChanged =
      JSON.stringify(prevTransformRef.current) !== JSON.stringify(transform)
    prevTransformRef.current = transform

    // Initialize on first load with data, or reset when transform changes
    if (!hasInitializedRef.current && computedLines.length > 0) {
      hasInitializedRef.current = true
      setEditedLines(computedLines)
      setSelectedChord(null)
      setDragState(null)
    } else if (transformChanged) {
      setEditedLines(computedLines)
      setSelectedChord(null)
      setDragState(null)
    }
  }, [computedLines, transform])

  // Coverage
  const coverage = useMemo(
    () => calculateCoverage(editedLines, lrcLines.length),
    [editedLines, lrcLines.length],
  )

  // Dirty detection (internal)
  const computedIsDirty = useMemo(() => {
    const initial = initialLinesRef.current
    if (editedLines.length !== initial.length) return true
    for (let i = 0; i < editedLines.length; i++) {
      const a = editedLines[i]
      const b = initial[i]
      if (!a || !b) return true
      if (a.idx !== b.idx) return true
      if (a.chords.length !== b.chords.length) return true
      for (let j = 0; j < a.chords.length; j++) {
        const ca = a.chords[j]
        const cb = b.chords[j]
        if (!ca || !cb) return true
        if (
          ca.start !== cb.start ||
          ca.chord !== cb.chord ||
          ca.wordIdx !== cb.wordIdx ||
          ca.dur !== cb.dur
        ) {
          return true
        }
      }
    }
    return false
  }, [editedLines])

  // Emit payload changes
  const selectedTrack = tracks?.[selectedTrackIndex ?? 0]
  useEffect(() => {
    const payload = isImportMode
      ? generateChordPayload(editedLines, selectedTrack, transform)
      : initialPayload
        ? { ...initialPayload, lines: editedLines }
        : generateChordPayload(editedLines)

    onPayloadChange(payload, { isDirty: computedIsDirty, coverage })
  }, [
    editedLines,
    selectedTrack,
    transform,
    computedIsDirty,
    coverage,
    isImportMode,
    initialPayload,
    onPayloadChange,
  ])

  const coveragePercent = Math.round(coverage * 100)
  const coverageColor =
    coveragePercent >= 50
      ? "text-emerald-400"
      : coveragePercent >= 20
        ? "text-amber-400"
        : "text-red-400"

  const alignedLineMap = useMemo(() => {
    const map = new Map<number, EnhancedChordLine>()
    for (const line of editedLines) {
      map.set(line.idx, line)
    }
    return map
  }, [editedLines])

  // Handlers
  const handleChordClick = useCallback(
    (lineIdx: number, chordIdx: number) => {
      if (disabled) return
      setSelectedChord(prev =>
        prev && prev.lineIdx === lineIdx && prev.chordIdx === chordIdx
          ? null
          : { lineIdx, chordIdx },
      )
    },
    [disabled],
  )

  const handleChordMove = useCallback(
    (lineIdx: number, chordIdx: number, newWordIdx: number) => {
      if (disabled) return

      setEditedLines(prev =>
        prev.map(line => {
          if (line.idx !== lineIdx) return line
          const chords = [...line.chords]
          const chord = chords[chordIdx]
          if (!chord) return line
          chords[chordIdx] = { ...chord, wordIdx: newWordIdx }
          return { ...line, chords }
        }),
      )
      setSelectedChord(null)
    },
    [disabled],
  )

  const handleWordClick = useCallback(
    (lineIdx: number, wordIdx: number) => {
      if (disabled || !selectedChord) return
      if (selectedChord.lineIdx !== lineIdx) return
      handleChordMove(lineIdx, selectedChord.chordIdx, wordIdx)
    },
    [disabled, selectedChord, handleChordMove],
  )

  const handleDragStart = useCallback((data: DragData) => {
    setDragState(data)
    setSelectedChord(null)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragState(null)
  }, [])

  const handleAddChordStart = useCallback(
    (lineIdx: number, wordIdx: number) => {
      if (disabled) return
      setAddingChord({ lineIdx, wordIdx })
      setNewChordName("")
    },
    [disabled],
  )

  const handleAddChordConfirm = useCallback(() => {
    if (!addingChord || !newChordName.trim()) return

    const { lineIdx, wordIdx } = addingChord
    const line = lrcLines[lineIdx]
    if (!line) return

    const newChord: LineChord = {
      start: 0,
      chord: newChordName.trim(),
      wordIdx,
    }

    setEditedLines(prev => {
      const existingLine = prev.find(l => l.idx === lineIdx)
      if (existingLine) {
        return prev.map(l =>
          l.idx === lineIdx ? { ...l, chords: [...l.chords, newChord] } : l,
        )
      }
      return [...prev, { idx: lineIdx, chords: [newChord] }].sort((a, b) => a.idx - b.idx)
    })

    setAddingChord(null)
    setNewChordName("")
  }, [addingChord, newChordName, lrcLines])

  const handleAddChordCancel = useCallback(() => {
    setAddingChord(null)
    setNewChordName("")
  }, [])

  const handleChordDoubleClick = useCallback(
    (lineIdx: number, chordIdx: number, wordIdx: number | undefined, chordName: string) => {
      if (disabled) return
      setEditingChord({ lineIdx, chordIdx, wordIdx, originalName: chordName })
      setEditChordName(chordName)
      setSelectedChord(null)
    },
    [disabled],
  )

  const handleEditChordConfirm = useCallback(() => {
    if (!editingChord || !editChordName.trim()) return

    const { lineIdx, chordIdx, wordIdx } = editingChord
    const chordNames = editChordName
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (chordNames.length === 0) return

    setEditedLines(prev => {
      return prev.map(line => {
        if (line.idx !== lineIdx) return line

        const oldChord = line.chords[chordIdx]
        if (!oldChord) return line

        // Replace the chord at chordIdx with new chord(s)
        const newChords = [...line.chords]
        newChords.splice(chordIdx, 1) // Remove old chord

        // Insert new chord(s) at the same position
        const insertChords: LineChord[] = chordNames.map((name, i) => ({
          start: oldChord.start + i * 50, // Slight offset for multiple chords
          chord: name,
          wordIdx: wordIdx,
        }))

        newChords.splice(chordIdx, 0, ...insertChords)
        return { ...line, chords: newChords }
      })
    })

    setEditingChord(null)
    setEditChordName("")
  }, [editingChord, editChordName])

  const handleEditChordCancel = useCallback(() => {
    setEditingChord(null)
    setEditChordName("")
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectedChord) return
      if (e.key !== "Delete" && e.key !== "Backspace") return

      e.preventDefault()

      setEditedLines(prev => {
        const out: EnhancedChordLine[] = []
        for (const line of prev) {
          if (line.idx !== selectedChord.lineIdx) {
            out.push(line)
            continue
          }
          const newChords = line.chords.filter((_, idx) => idx !== selectedChord.chordIdx)
          if (newChords.length > 0) {
            out.push({ ...line, chords: newChords })
          }
        }
        return out
      })

      setSelectedChord(null)
    },
    [selectedChord],
  )

  return (
    <section
      aria-label="Chord editor. Click chords to select, click words to move, Delete to remove."
      className="rounded-xl bg-neutral-900 p-5 focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          Chord Alignment
          {isDirty && <span className="text-xs text-amber-400 font-normal">(unsaved)</span>}
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {editedLines.length} / {lrcLines.length} lines with chords
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

      {/* Track selector + offset (import mode only) */}
      {isImportMode && tracks && onTrackChange && (
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1 min-w-48">
            <label htmlFor="chord-track-select" className="block text-xs text-neutral-400 mb-1">
              Track
            </label>
            <div className="relative">
              <select
                id="chord-track-select"
                value={selectedTrackIndex ?? 0}
                onChange={e => onTrackChange(Number(e.target.value))}
                disabled={disabled}
                className="w-full appearance-none px-3 py-2 pr-8 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tracks.map((track, idx) => (
                  <option key={idx} value={idx}>
                    {track.trackName} (score: {track.score}, chords: {track.chordEventCount})
                  </option>
                ))}
              </select>
              <CaretDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex-1 min-w-48">
            <label htmlFor="chord-time-offset" className="block text-xs text-neutral-400 mb-1">
              Fine-tune Offset: {formatOffset(timeOffset)}
              {syncOffsetMs !== 0 && (
                <span className="ml-1 text-[10px] text-neutral-500">
                  (total: {formatOffset(effectiveOffsetMs)})
                </span>
              )}
            </label>
            <input
              id="chord-time-offset"
              type="range"
              min={-2000}
              max={2000}
              step={50}
              value={timeOffset}
              onChange={e => setTimeOffset(Number(e.target.value))}
              disabled={disabled}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>-2000ms</span>
              <button
                type="button"
                onClick={() => setTimeOffset(0)}
                disabled={disabled || timeOffset === 0}
                className="text-indigo-400 hover:text-indigo-300 disabled:text-neutral-600 disabled:cursor-not-allowed"
              >
                Reset
              </button>
              <span>+2000ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <p className="mb-4 text-xs text-neutral-500">
        Drag chords to move them between words. Or click a chord to select it, then click a word.
        Press Delete/Backspace to remove the selected chord.
      </p>

      {/* Low coverage warning */}
      {coveragePercent < 20 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="mb-4 rounded-lg bg-red-900/30 border border-red-700/50 p-3 flex items-start gap-2"
        >
          <Warning size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">
            Very low coverage ({coveragePercent}%). Consider adjusting the time offset or selecting
            a different track.
          </p>
        </motion.div>
      )}

      {/* Editor */}
      <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
        {lrcLines.map((line, lineIdx) => {
          const enhanced = alignedLineMap.get(lineIdx)
          const chordCount = enhanced?.chords.length ?? 0

          const bgColor =
            chordCount >= 2
              ? "bg-emerald-900/20"
              : chordCount === 1
                ? "bg-amber-900/20"
                : "bg-red-900/20"

          return (
            <div key={lineIdx} className={`flex items-start gap-3 py-1.5 px-2 rounded ${bgColor}`}>
              <span className="text-neutral-500 flex-shrink-0 w-16">
                [{formatTime(line.startMs)}]
              </span>
              <div className="flex-1">
                {line.words.length > 0 ? (
                  <WordLevelChordDisplay
                    words={line.words}
                    chords={enhanced?.chords ?? []}
                    lineIdx={lineIdx}
                    selectedChord={selectedChord}
                    onChordClick={handleChordClick}
                    onChordDoubleClick={handleChordDoubleClick}
                    onWordClick={handleWordClick}
                    onChordMove={handleChordMove}
                    onAddChord={handleAddChordStart}
                    disabled={disabled}
                    dragState={dragState}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ) : (
                  <div className="text-neutral-500">(instrumental)</div>
                )}
              </div>
              <span className="flex-shrink-0 w-6">
                {chordCount >= 2 ? (
                  <Check size={16} className="text-emerald-400" />
                ) : chordCount === 1 ? (
                  <span className="text-xs text-amber-400">{chordCount}</span>
                ) : (
                  <span className="text-xs text-neutral-500">—</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {disabled && <div className="mt-4 text-center text-sm text-neutral-500">Processing...</div>}

      {/* Add Chord Dialog */}
      {addingChord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.default}
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 shadow-xl min-w-64"
          >
            <h4 className="text-sm font-medium text-white mb-3">Add Chord</h4>
            <input
              ref={el => el?.focus()}
              type="text"
              value={newChordName}
              onChange={e => setNewChordName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleAddChordConfirm()
                if (e.key === "Escape") handleAddChordCancel()
              }}
              placeholder="e.g. Am, G, D7"
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddChordConfirm}
                disabled={!newChordName.trim()}
                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleAddChordCancel}
                className="px-3 py-1.5 bg-neutral-700 text-neutral-300 text-sm rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Chord Dialog */}
      {editingChord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springs.default}
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 shadow-xl min-w-72"
          >
            <h4 className="text-sm font-medium text-white mb-1">Edit Chord</h4>
            <p className="text-xs text-neutral-400 mb-3">
              Use comma to add multiple chords (e.g. "C, Am")
            </p>
            <input
              ref={el => el?.focus()}
              type="text"
              value={editChordName}
              onChange={e => setEditChordName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleEditChordConfirm()
                if (e.key === "Escape") handleEditChordCancel()
              }}
              placeholder="e.g. Am, G, D7"
              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEditChordConfirm}
                disabled={!editChordName.trim()}
                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleEditChordCancel}
                className="px-3 py-1.5 bg-neutral-700 text-neutral-300 text-sm rounded-lg hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </section>
  )
}
