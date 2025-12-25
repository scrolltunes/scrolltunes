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
import { CaretDown, Check, MusicNotes, Warning } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useEffect, useMemo } from "react"

interface ChordPreviewProps {
  readonly lrcContent: string
  readonly gpChords: ChordEvent[]
  readonly tracks: TrackAnalysis[]
  readonly selectedTrackIndex: number
  readonly onTrackChange: (index: number) => void
  readonly timeOffset: number
  readonly onTimeOffsetChange: (offset: number) => void
  readonly onAlignmentComplete: (result: {
    lines: EnhancedChordLine[]
    payload: ChordEnhancementPayloadV1
    coverage: number
  }) => void
  readonly disabled?: boolean
  readonly wordPatches?: readonly WordPatch[]
}

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

interface WordLevelChordDisplayProps {
  readonly words: readonly string[]
  readonly chords: readonly LineChord[]
}

function WordLevelChordDisplay({ words, chords }: WordLevelChordDisplayProps) {
  const chordsByWord = new Map<number, LineChord[]>()
  const uncategorizedChords: LineChord[] = []

  for (const chord of chords) {
    if (chord.wordIdx !== undefined) {
      const existing = chordsByWord.get(chord.wordIdx) ?? []
      existing.push(chord)
      chordsByWord.set(chord.wordIdx, existing)
    } else {
      uncategorizedChords.push(chord)
    }
  }

  if (words.length === 0) {
    return <div className="text-neutral-500">(instrumental)</div>
  }

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 items-end">
      {words.map((word, wordIdx) => {
        const wordChords = chordsByWord.get(wordIdx)
        return (
          <div key={wordIdx} className="flex flex-col items-start">
            {wordChords && wordChords.length > 0 && (
              <div className="flex gap-0.5 mb-0.5">
                {wordChords.map((chord, chordIdx) => (
                  <span
                    key={chordIdx}
                    className="px-1.5 py-0.5 bg-indigo-600 rounded text-[10px] font-medium text-white"
                    title={`Word: "${word}", Offset: +${chord.start}ms`}
                  >
                    {chord.chord}
                  </span>
                ))}
              </div>
            )}
            <span
              className={`text-neutral-200 ${wordChords && wordChords.length > 0 ? "border-b border-indigo-500" : ""}`}
            >
              {word}
            </span>
          </div>
        )
      })}
      {uncategorizedChords.length > 0 && (
        <div className="ml-2 flex gap-1">
          {uncategorizedChords.map((chord, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px] text-neutral-300"
              title={`Offset: +${chord.start}ms (no word match)`}
            >
              {chord.chord}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChordPreview({
  lrcContent,
  gpChords,
  tracks,
  selectedTrackIndex,
  onTrackChange,
  timeOffset,
  onTimeOffsetChange,
  onAlignmentComplete,
  disabled = false,
  wordPatches,
}: ChordPreviewProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  const transform = useMemo(
    () => (timeOffset !== 0 ? { kind: "offset" as const, ms: timeOffset } : undefined),
    [timeOffset],
  )

  const alignedLines = useMemo(
    () =>
      wordPatches && wordPatches.length > 0
        ? alignChordsToWords(gpChords, lrcLines, wordPatches, transform)
        : alignChordsToLrc(gpChords, lrcLines, transform),
    [gpChords, lrcLines, wordPatches, transform],
  )

  const coverage = useMemo(
    () => calculateCoverage(alignedLines, lrcLines.length),
    [alignedLines, lrcLines.length],
  )

  const selectedTrack = tracks[selectedTrackIndex]

  useEffect(() => {
    const payload = generateChordPayload(alignedLines, selectedTrack, transform)
    onAlignmentComplete({
      lines: alignedLines,
      payload,
      coverage,
    })
  }, [alignedLines, selectedTrack, transform, coverage, onAlignmentComplete])

  const coveragePercent = Math.round(coverage * 100)
  const coverageColor =
    coveragePercent >= 50
      ? "text-emerald-400"
      : coveragePercent >= 20
        ? "text-amber-400"
        : "text-red-400"

  const alignedLineMap = useMemo(() => {
    const map = new Map<number, EnhancedChordLine>()
    for (const line of alignedLines) {
      map.set(line.idx, line)
    }
    return map
  }, [alignedLines])

  return (
    <div className="rounded-xl bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Chord Alignment Preview</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-neutral-400">
            {alignedLines.length} / {lrcLines.length} lines with chords
          </span>
          <span className={`text-sm font-medium ${coverageColor}`}>
            {coveragePercent}% coverage
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex-1 min-w-48">
          <label htmlFor="chord-track-select" className="block text-xs text-neutral-400 mb-1">
            Track
          </label>
          <div className="relative">
            <select
              id="chord-track-select"
              value={selectedTrackIndex}
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
            Time Offset: {formatOffset(timeOffset)}
          </label>
          <input
            id="chord-time-offset"
            type="range"
            min={-2000}
            max={2000}
            step={50}
            value={timeOffset}
            onChange={e => onTimeOffsetChange(Number(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-neutral-500 mt-1">
            <span>-2000ms</span>
            <button
              type="button"
              onClick={() => onTimeOffsetChange(0)}
              disabled={disabled || timeOffset === 0}
              className="text-indigo-400 hover:text-indigo-300 disabled:text-neutral-600 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <span>+2000ms</span>
          </div>
        </div>
      </div>

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
                  <WordLevelChordDisplay words={line.words} chords={enhanced.chords} />
                ) : (
                  <>
                    <div className="text-neutral-200">
                      {line.words.join(" ") || "(instrumental)"}
                    </div>
                    {enhanced && enhanced.chords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {enhanced.chords.map((chord, chordIdx) => (
                          <span
                            key={chordIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-900/50 border border-indigo-700/50 rounded text-xs text-indigo-300"
                            title={`Offset: +${chord.start}ms${chord.dur ? `, Duration: ${chord.dur}ms` : ""}`}
                          >
                            <MusicNotes size={12} />
                            {chord.chord}
                            <span className="text-indigo-500">+{chord.start}ms</span>
                          </span>
                        ))}
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
    </div>
  )
}
