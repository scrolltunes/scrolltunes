"use client"

import type { EnhancementPayload } from "@/lib/db/schema"
import {
  type LrcLine,
  type WordPatch,
  type WordTiming,
  alignWords,
  parseLrcToLines,
  patchesToPayload,
} from "@/lib/gp"
import { CheckCircle, Pencil, Warning, X } from "@phosphor-icons/react"
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
}

interface EditableWordTiming {
  lineIndex: number
  wordIndex: number
  lrcWord: string
  startMs: number | null
  durationMs: number | null
  matched: boolean
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

function parseTime(str: string): number | null {
  const match = str.match(/^(\d+):(\d+(?:\.\d+)?)$/)
  if (!match || !match[1] || !match[2]) return null
  const minutes = Number.parseInt(match[1], 10)
  const seconds = Number.parseFloat(match[2])
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null
  return Math.round((minutes * 60 + seconds) * 1000)
}

function WordTimingRow({
  word,
  onUpdate,
  lineStartMs,
}: {
  word: EditableWordTiming
  onUpdate: (updates: Partial<EditableWordTiming>) => void
  lineStartMs: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editStartMs, setEditStartMs] = useState("")
  const [editDurationMs, setEditDurationMs] = useState("")

  const handleStartEdit = () => {
    setEditStartMs(word.startMs !== null ? formatTime(word.startMs) : "")
    setEditDurationMs(word.durationMs !== null ? word.durationMs.toString() : "")
    setIsEditing(true)
  }

  const handleSave = () => {
    const newStartMs = parseTime(editStartMs)
    const newDurationMs = editDurationMs ? Number.parseInt(editDurationMs, 10) : null

    onUpdate({
      startMs: newStartMs,
      durationMs: newDurationMs && !Number.isNaN(newDurationMs) ? newDurationMs : null,
      matched: newStartMs !== null,
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  const relativeStart = word.startMs !== null ? word.startMs - lineStartMs : null

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-neutral-800 border border-indigo-500">
        <span className="text-white font-medium min-w-[80px]">{word.lrcWord}</span>
        <input
          type="text"
          value={editStartMs}
          onChange={e => setEditStartMs(e.target.value)}
          placeholder="0:00.00"
          className="w-20 px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-white font-mono"
        />
        <input
          type="text"
          value={editDurationMs}
          onChange={e => setEditDurationMs(e.target.value)}
          placeholder="ms"
          className="w-16 px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-white font-mono"
        />
        <button
          type="button"
          onClick={handleSave}
          className="p-1 text-emerald-400 hover:text-emerald-300"
        >
          <CheckCircle size={16} weight="fill" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1 text-neutral-400 hover:text-neutral-300"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded group cursor-pointer hover:bg-neutral-800 ${
        word.matched ? "bg-emerald-900/20" : "bg-orange-900/20"
      }`}
      onClick={handleStartEdit}
      onKeyDown={e => e.key === "Enter" && handleStartEdit()}
      tabIndex={0}
      role="button"
    >
      <span
        className={`font-medium min-w-[80px] ${word.matched ? "text-emerald-400" : "text-orange-400"}`}
      >
        {word.lrcWord}
      </span>
      {word.startMs !== null ? (
        <>
          <span className="text-xs font-mono text-neutral-400" title="Absolute start time">
            {formatTime(word.startMs)}
          </span>
          <span className="text-xs text-neutral-600">|</span>
          <span className="text-xs font-mono text-neutral-500" title="Relative to line start">
            +{relativeStart !== null ? relativeStart : 0}ms
          </span>
          <span className="text-xs text-neutral-600">|</span>
          <span className="text-xs font-mono text-neutral-500" title="Duration">
            {word.durationMs}ms
          </span>
        </>
      ) : (
        <span className="text-xs text-neutral-500 italic">No timing</span>
      )}
      <Pencil
        size={12}
        className="ml-auto text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
  )
}

function LineTimingSection({
  lineIndex,
  line,
  words,
  onUpdateWord,
}: {
  lineIndex: number
  line: LrcLine
  words: EditableWordTiming[]
  onUpdateWord: (lineIndex: number, wordIndex: number, updates: Partial<EditableWordTiming>) => void
}) {
  const matchedCount = words.filter(w => w.matched).length

  return (
    <div className="rounded-lg bg-neutral-900/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
            {String(lineIndex + 1).padStart(2, "0")}
          </span>
          <span className="text-xs font-mono text-indigo-400">{formatTime(line.startMs)}</span>
        </div>
        <span className="text-xs text-neutral-500">
          {matchedCount}/{words.length} matched
        </span>
      </div>
      <div className="text-sm text-neutral-300 mb-2">{line.text}</div>
      <div className="space-y-1">
        {words.map(word => (
          <WordTimingRow
            key={`${word.lineIndex}-${word.wordIndex}`}
            word={word}
            lineStartMs={line.startMs}
            onUpdate={updates => onUpdateWord(lineIndex, word.wordIndex, updates)}
          />
        ))}
      </div>
    </div>
  )
}

export function AlignmentPreview({
  gpWords,
  lrcContent,
  onAlignmentComplete,
  disabled = false,
}: AlignmentPreviewProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  const initialAlignment = useMemo(() => alignWords(lrcLines, gpWords), [lrcLines, gpWords])

  // Convert patches to editable word timings
  const [wordTimings, setWordTimings] = useState<EditableWordTiming[]>(() => {
    const timings: EditableWordTiming[] = []
    const patchMap = new Map<string, WordPatch>()

    for (const patch of initialAlignment.patches) {
      patchMap.set(`${patch.lineIndex}-${patch.wordIndex}`, patch)
    }

    for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
      const line = lrcLines[lineIdx]
      if (!line) continue

      for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
        const lrcWord = line.words[wordIdx]
        if (!lrcWord) continue

        const patch = patchMap.get(`${lineIdx}-${wordIdx}`)

        timings.push({
          lineIndex: lineIdx,
          wordIndex: wordIdx,
          lrcWord,
          startMs: patch?.startMs ?? null,
          durationMs: patch?.durationMs ?? null,
          matched: !!patch,
        })
      }
    }

    return timings
  })

  const handleUpdateWord = useCallback(
    (lineIndex: number, wordIndex: number, updates: Partial<EditableWordTiming>) => {
      setWordTimings(prev =>
        prev.map(w =>
          w.lineIndex === lineIndex && w.wordIndex === wordIndex ? { ...w, ...updates } : w,
        ),
      )
    },
    [],
  )

  // Group words by line
  const lineGroups = useMemo(() => {
    const groups: Map<number, EditableWordTiming[]> = new Map()

    for (const word of wordTimings) {
      const existing = groups.get(word.lineIndex)
      if (existing) {
        existing.push(word)
      } else {
        groups.set(word.lineIndex, [word])
      }
    }

    return groups
  }, [wordTimings])

  // Calculate stats
  const stats = useMemo(() => {
    const total = wordTimings.length
    const matched = wordTimings.filter(w => w.matched).length
    const coverage = total > 0 ? (matched / total) * 100 : 0
    return { total, matched, coverage }
  }, [wordTimings])

  const isLowCoverage = stats.coverage < 80

  // Auto-call onAlignmentComplete when wordTimings change
  useEffect(() => {
    const patches: WordPatch[] = wordTimings.flatMap(w =>
      w.startMs !== null && w.durationMs !== null
        ? [
            {
              lineIndex: w.lineIndex,
              wordIndex: w.wordIndex,
              startMs: w.startMs,
              durationMs: w.durationMs,
            },
          ]
        : [],
    )

    const payload = patchesToPayload(patches, lrcLines)
    onAlignmentComplete({
      patches,
      payload,
      coverage: stats.coverage,
    })
  }, [wordTimings, lrcLines, onAlignmentComplete, stats.coverage])

  return (
    <div className="space-y-6">
      {/* Coverage Stats */}
      <div className="rounded-xl bg-neutral-800/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-white">Alignment Results</h3>
          {isLowCoverage ? (
            <div className="flex items-center gap-1.5 text-amber-400">
              <Warning size={20} weight="fill" />
              <span className="text-sm font-medium">Low coverage</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle size={20} weight="fill" />
              <span className="text-sm font-medium">Good coverage</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span
            className={`text-4xl font-bold ${isLowCoverage ? "text-amber-400" : "text-emerald-400"}`}
          >
            {stats.coverage.toFixed(1)}%
          </span>
          <span className="text-neutral-400">word coverage</span>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-neutral-900/50 p-3">
            <div className="text-2xl font-semibold text-white">{stats.total}</div>
            <div className="text-xs text-neutral-400">Total words</div>
          </div>
          <div className="rounded-lg bg-neutral-900/50 p-3">
            <div className="text-2xl font-semibold text-emerald-400">{stats.matched}</div>
            <div className="text-xs text-neutral-400">Matched</div>
          </div>
          <div className="rounded-lg bg-neutral-900/50 p-3">
            <div className="text-2xl font-semibold text-red-400">{stats.total - stats.matched}</div>
            <div className="text-xs text-neutral-400">Unmatched</div>
          </div>
        </div>

        {isLowCoverage && (
          <div className="mt-4 rounded-lg bg-amber-900/30 border border-amber-700/50 p-3">
            <p className="text-sm text-amber-200">
              Coverage below 80%. Click on unmatched words to manually add timing.
            </p>
          </div>
        )}
      </div>

      {/* Word Timings Editor */}
      <div className="rounded-xl bg-neutral-800/50 p-4">
        <h4 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wide">
          Word Timings ({lrcLines.length} lines)
        </h4>
        <p className="text-xs text-neutral-500 mb-4">
          Click any word to edit its timing. Format: minutes:seconds.hundredths (e.g., 1:23.45)
        </p>
        <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2">
          {lrcLines.map((line, lineIdx) => {
            const lineWords = lineGroups.get(lineIdx) ?? []
            return (
              <LineTimingSection
                key={lineIdx}
                lineIndex={lineIdx}
                line={line}
                words={lineWords}
                onUpdateWord={handleUpdateWord}
              />
            )
          })}
        </div>
      </div>

      {/* GP Words Reference */}
      <details className="rounded-xl bg-neutral-800/50 p-4">
        <summary className="text-sm font-medium text-neutral-400 cursor-pointer hover:text-neutral-300">
          Guitar Pro Words Reference ({gpWords.length} words)
        </summary>
        <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-neutral-900/50 p-3">
          <div className="flex flex-wrap gap-1">
            {gpWords.map((word, idx) => (
              <span
                key={idx}
                className="text-xs font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded"
                title={formatTime(word.startMs)}
              >
                {word.text}
              </span>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
