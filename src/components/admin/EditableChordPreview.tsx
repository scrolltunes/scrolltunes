"use client"

import { springs } from "@/animations"
import {
  type ChordEnhancementPayloadV1,
  type EnhancedChordLine,
  type LineChord,
  calculateCoverage,
  parseLrcToLines,
} from "@/lib/gp"
import { Check, MusicNotes, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface EditableChordPreviewProps {
  readonly lrcContent: string
  readonly initialPayload: ChordEnhancementPayloadV1
  readonly onPayloadChange: (payload: ChordEnhancementPayloadV1, isDirty: boolean) => void
  readonly disabled?: boolean
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
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

interface EditableWordLevelChordDisplayProps {
  readonly words: readonly string[]
  readonly chords: readonly LineChord[]
  readonly lineIdx: number
  readonly selectedChord: SelectedChord | null
  readonly onChordClick: (lineIdx: number, chordIdx: number) => void
  readonly onWordClick: (lineIdx: number, wordIdx: number) => void
  readonly onChordMove: (lineIdx: number, chordIdx: number, newWordIdx: number) => void
  readonly disabled: boolean
  readonly dragState: DragData | null
  readonly onDragStart: (data: DragData) => void
  readonly onDragEnd: () => void
}

function EditableWordLevelChordDisplay({
  words,
  chords,
  lineIdx,
  selectedChord,
  onChordClick,
  onWordClick,
  onChordMove,
  disabled,
  dragState,
  onDragStart,
  onDragEnd,
}: EditableWordLevelChordDisplayProps) {
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
                  disabled={disabled}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? "opacity-50 ring-2 ring-indigo-400"
                      : isSelected
                        ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                        : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                  } disabled:cursor-not-allowed`}
                  title={`Offset: +${chord.start}ms (drag to move)`}
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
              {wordChords &&
                wordChords.length > 0 &&
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
                      disabled={disabled}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-grab active:cursor-grabbing ${
                        isDragging
                          ? "opacity-50 ring-2 ring-indigo-400"
                          : isSelected
                            ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                            : "bg-indigo-600 text-white hover:bg-indigo-500"
                      } disabled:cursor-not-allowed`}
                      title={`Word: "${word}", Offset: +${chord.start}ms (drag to move)`}
                    >
                      {chord.chord}
                    </button>
                  )
                })}
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
                disabled={disabled}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-grab active:cursor-grabbing ${
                  isDragging
                    ? "opacity-50 ring-2 ring-indigo-400"
                    : isSelected
                      ? "bg-yellow-500 text-black ring-2 ring-yellow-300"
                      : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                } disabled:cursor-not-allowed`}
                title={`Offset: +${chord.start}ms (drag to move)`}
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

export function EditableChordPreview({
  lrcContent,
  initialPayload,
  onPayloadChange,
  disabled = false,
}: EditableChordPreviewProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  const initialLinesRef = useRef(initialPayload.lines)
  useEffect(() => {
    initialLinesRef.current = initialPayload.lines
  }, [initialPayload.lines])

  const [editedLines, setEditedLines] = useState<EnhancedChordLine[]>([...initialPayload.lines])
  const [selectedChord, setSelectedChord] = useState<SelectedChord | null>(null)
  const [dragState, setDragState] = useState<DragData | null>(null)

  useEffect(() => {
    setEditedLines([...initialPayload.lines])
    setSelectedChord(null)
    setDragState(null)
  }, [initialPayload])

  const coverage = useMemo(
    () => calculateCoverage(editedLines, lrcLines.length),
    [editedLines, lrcLines.length],
  )

  const isDirty = useMemo(() => {
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

  useEffect(() => {
    const payload: ChordEnhancementPayloadV1 = {
      ...initialPayload,
      lines: editedLines,
    }
    onPayloadChange(payload, isDirty)
  }, [editedLines, isDirty, initialPayload, onPayloadChange])

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
        <h3 className="text-lg font-medium">Chord Editor</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {editedLines.length} / {lrcLines.length} lines with chords
          </span>
          <span className={`text-sm font-medium ${coverageColor}`}>
            {coveragePercent}% coverage
          </span>
        </div>
      </div>

      <p className="mb-4 text-xs text-neutral-500">
        Drag chords to move them between words. Or click a chord to select it, then click a word.
        Press Delete/Backspace to remove the selected chord.
      </p>

      {coveragePercent < 20 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.default}
          className="mb-4 rounded-lg bg-red-900/30 border border-red-700/50 p-3 flex items-start gap-2"
        >
          <Warning size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">Very low coverage ({coveragePercent}%).</p>
        </motion.div>
      )}

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
                {enhanced?.chords.some(c => c.wordIdx !== undefined) ? (
                  <EditableWordLevelChordDisplay
                    words={line.words}
                    chords={enhanced.chords}
                    lineIdx={lineIdx}
                    selectedChord={selectedChord}
                    onChordClick={handleChordClick}
                    onWordClick={handleWordClick}
                    onChordMove={handleChordMove}
                    disabled={disabled}
                    dragState={dragState}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ) : (
                  <>
                    <div className="text-neutral-200">
                      {line.words.join(" ") || "(instrumental)"}
                    </div>
                    {enhanced && enhanced.chords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {enhanced.chords.map((chord, chordIdx) => {
                          const isSelected =
                            selectedChord?.lineIdx === lineIdx &&
                            selectedChord?.chordIdx === chordIdx
                          return (
                            <button
                              key={chordIdx}
                              type="button"
                              onClick={() => handleChordClick(lineIdx, chordIdx)}
                              disabled={disabled}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs transition-colors ${
                                isSelected
                                  ? "bg-yellow-500 text-black border-yellow-300 ring-2 ring-yellow-300"
                                  : "bg-indigo-900/50 border-indigo-700/50 text-indigo-300 hover:bg-indigo-800/50"
                              } disabled:cursor-not-allowed`}
                              title={`Offset: +${chord.start}ms${chord.dur ? `, Duration: ${chord.dur}ms` : ""}`}
                            >
                              <MusicNotes size={12} />
                              {chord.chord}
                              <span className={isSelected ? "text-black/70" : "text-indigo-500"}>
                                +{chord.start}ms
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
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
    </section>
  )
}
