/**
 * Chord merge helper
 *
 * Merges GP chord patches with baseline Songsterr chords at runtime.
 */

import type { LyricLine } from "@/core"
import type { ChordEnhancementPayloadV1, MergedChordLine, TimedChord } from "@/lib/gp/chord-types"
import { findBestMatch } from "./lyrics-matcher"
import type { PositionedChord, SongsterrChordData } from "./songsterr-types"

export interface MergedChordResult {
  readonly lines: readonly MergedChordLine[]
  readonly capo?: number | undefined
  readonly tuning?: string | undefined
}

/**
 * Merge GP chord patches with baseline Songsterr chords.
 *
 * Rules:
 * - If GP patch exists for a line, use ONLY GP chords (override)
 * - Otherwise, use Songsterr chords (converted to time-based)
 * - Preserve capo/tuning from Songsterr
 */
export function mergeChordSources(
  lrcLines: readonly LyricLine[],
  baseline: SongsterrChordData | null,
  gpPatch: ChordEnhancementPayloadV1 | null,
): MergedChordResult {
  const gpLineMap = new Map(gpPatch?.lines.map(l => [l.idx, l]) ?? [])

  const mergedLines: MergedChordLine[] = lrcLines.map((line, idx) => {
    const gpLine = gpLineMap.get(idx)

    if (gpLine && gpLine.chords.length > 0) {
      const chords: TimedChord[] = gpLine.chords.map(c => ({
        absoluteMs: line.startTime + c.start,
        durationMs: c.dur,
        chord: c.chord,
        source: "gp" as const,
      }))
      return {
        lineIndex: idx,
        chords,
        source: "gp" as const,
      }
    }

    const baselineChords = findBaselineChordsForLine(baseline, line, idx)
    if (baselineChords.length > 0) {
      const chords: TimedChord[] = baselineChords.map(c => ({
        absoluteMs: line.startTime + estimateChordTimeFromCharIndex(c.charIndex, line),
        chord: c.name,
        source: "songsterr" as const,
      }))
      return {
        lineIndex: idx,
        chords,
        source: "songsterr" as const,
      }
    }

    return { lineIndex: idx, chords: [], source: "none" as const }
  })

  return {
    lines: mergedLines,
    capo: baseline?.capo,
    tuning: baseline?.tuning,
  }
}

/**
 * Find Songsterr chords that match this lyric line.
 * Uses fuzzy matching to find the best matching Songsterr line.
 */
export function findBaselineChordsForLine(
  baseline: SongsterrChordData | null,
  line: LyricLine,
  _lineIndex: number,
): readonly PositionedChord[] {
  if (!baseline || baseline.lines.length === 0) return []

  const linesAsLyricLines: LyricLine[] = baseline.lines.map((l, i) => ({
    id: `songsterr-${i}`,
    text: l.text,
    startTime: 0,
    endTime: 0,
  }))

  const match = findBestMatch(line.text, linesAsLyricLines)
  if (!match) return []

  const matchIndex = linesAsLyricLines.findIndex(l => l.id === match.id)
  if (matchIndex < 0) return []

  const songsterrLine = baseline.lines[matchIndex]
  return songsterrLine?.positionedChords ?? []
}

/**
 * Estimate chord time from char index (for Songsterr baseline).
 * Uses proportional mapping: charIndex / lineLength * lineDuration
 */
export function estimateChordTimeFromCharIndex(charIndex: number, line: LyricLine): number {
  const lineLength = line.text.length || 1
  const lineDuration = line.endTime - line.startTime || 3000
  return (charIndex / lineLength) * lineDuration
}
