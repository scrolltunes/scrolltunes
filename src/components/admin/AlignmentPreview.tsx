"use client"

import { springs } from "@/animations"
import type { EnhancementPayload } from "@/lib/db/schema"
import {
  type GpMetadata,
  type LrcLine,
  type WordPatch,
  type WordTiming,
  alignWords,
  parseLrcToLines,
  patchesToPayload,
} from "@/lib/gp"
import { Check, PencilSimple, Warning, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

interface AlignmentPreviewProps {
  readonly gpWords: WordTiming[]
  readonly lrcContent: string
  readonly onAlignmentComplete: (result: {
    patches: WordPatch[]
    payload: EnhancementPayload
    coverage: number
  }) => void
  readonly disabled?: boolean
  readonly gpMeta?: GpMetadata | undefined
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
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

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "") // Remove apostrophes
    .replace(/[^\p{L}\p{N}]/gu, "") // Remove all non-letter/number chars
}

function areWordsSimilar(lrcWord: string, gpWord: string): boolean {
  return normalizeForComparison(lrcWord) === normalizeForComparison(gpWord)
}

interface EditableWord {
  lineIndex: number
  wordIndex: number
  word: string
  startMs: number | null
  durationMs: number | null
  matched: boolean
  gpText: string | null // Original GP word that matched
}

interface WordEditorProps {
  readonly word: EditableWord
  readonly lineStartMs: number
  readonly onSave: (startMs: number, durationMs: number) => void
  readonly onCancel: () => void
  readonly gpWords: readonly WordTiming[]
}

function WordEditor({ word, lineStartMs, onSave, onCancel, gpWords }: WordEditorProps) {
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

  const nearbyGpWords = useMemo(() => {
    return gpWords.filter(gp => Math.abs(gp.startMs - lineStartMs) < 10000).slice(0, 8)
  }, [gpWords, lineStartMs])

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={springs.default}
      className="absolute left-0 top-full mt-1 z-50 bg-neutral-800 border border-neutral-700 rounded-lg p-3 shadow-xl min-w-64"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">"{word.word}"</span>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

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

interface EditableLineData {
  lineIndex: number
  lineStartMs: number
  words: EditableWord[]
}

function buildEditableData(
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

export function AlignmentPreview({
  gpWords,
  lrcContent,
  onAlignmentComplete,
  disabled = false,
  gpMeta,
}: AlignmentPreviewProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])
  const initialAlignment = useMemo(() => alignWords(lrcLines, gpWords), [lrcLines, gpWords])

  const [editableData, setEditableData] = useState<EditableLineData[]>(() =>
    buildEditableData(lrcLines, initialAlignment.patches),
  )
  const [editingWord, setEditingWord] = useState<{ lineIndex: number; wordIndex: number } | null>(
    null,
  )

  useEffect(() => {
    setEditableData(buildEditableData(lrcLines, initialAlignment.patches))
    setEditingWord(null)
  }, [lrcLines, initialAlignment.patches])

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

  const handleWordClick = useCallback(
    (lineIndex: number, wordIndex: number) => {
      if (disabled) return
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
  }, [])

  useEffect(() => {
    const patches = editableDataToPatches(editableData)
    const payload = patchesToPayload(patches, lrcLines, 1, gpMeta)
    onAlignmentComplete({
      patches,
      payload,
      coverage: stats.coverage,
    })
  }, [editableData, lrcLines, stats.coverage, onAlignmentComplete, gpMeta])

  const coveragePercent = Math.round(stats.coverage)
  const coverageColor =
    coveragePercent >= 90
      ? "text-emerald-400"
      : coveragePercent >= 70
        ? "text-amber-400"
        : "text-red-400"

  return (
    <div className="rounded-xl bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Alignment Preview</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {stats.matchedWords} / {stats.totalWords} words matched
          </span>
          <span className={`text-sm font-medium ${coverageColor}`}>
            {coveragePercent}% coverage
          </span>
        </div>
      </div>

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
              <span className="text-neutral-500 flex-shrink-0 w-16">
                [{formatTime(line.lineStartMs)}]
              </span>
              <div className="flex-1 flex flex-wrap gap-x-1">
                {line.words.map(word => {
                  const isEditing =
                    editingWord?.lineIndex === word.lineIndex &&
                    editingWord?.wordIndex === word.wordIndex

                  return (
                    <span key={word.wordIndex} className="relative">
                      <button
                        type="button"
                        onClick={() => handleWordClick(word.lineIndex, word.wordIndex)}
                        disabled={disabled}
                        className={`${
                          word.matched
                            ? "text-emerald-300 hover:text-emerald-200"
                            : "text-red-400 hover:text-red-300"
                        } hover:underline cursor-pointer disabled:cursor-not-allowed group inline-flex items-center gap-0.5`}
                        title={
                          word.matched
                            ? `GP: "${word.gpText}" @ ${formatTime(word.startMs ?? 0)} (${word.durationMs}ms)`
                            : "Click to add timing"
                        }
                      >
                        {word.word}
                        {word.matched &&
                          word.gpText &&
                          !areWordsSimilar(word.word, word.gpText) && (
                            <span className="text-amber-400 text-xs ml-0.5">({word.gpText})</span>
                          )}
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
                          gpWords={gpWords}
                        />
                      )}
                    </span>
                  )
                })}
              </div>
              <span className="flex-shrink-0 w-6">
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

      {disabled && <div className="mt-4 text-center text-sm text-neutral-500">Processing...</div>}
    </div>
  )
}
