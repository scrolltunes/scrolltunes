/**
 * Chord alignment module for matching GP chord events to LRC lyrics lines.
 *
 * Aligns chords extracted from Guitar Pro files to LRCLIB lyrics,
 * producing chord enhancement patches.
 */

import type { LrcLine, WordPatch } from "./align-words"
import type {
  ChordEnhancementPayloadV1,
  ChordEvent,
  EnhancedChordLine,
  LineChord,
  TimeTransformV1,
  TrackAnalysis,
} from "./chord-types"

export const TOLERANCE_MS = 300
export const MAX_CHORDS_PER_LINE = 4

/**
 * Apply time transform to convert GP time to LRC time.
 */
export function applyTimeTransform(gpMs: number, transform?: TimeTransformV1): number {
  if (!transform) return gpMs

  if (transform.kind === "offset") {
    return gpMs + transform.ms
  }

  const { anchors } = transform
  if (anchors.length === 0) return gpMs
  if (anchors.length === 1) {
    const anchor = anchors[0]
    if (!anchor) return gpMs
    return gpMs + (anchor.lrcMs - anchor.gpMs)
  }

  const firstAnchor = anchors[0]
  const lastAnchor = anchors[anchors.length - 1]
  if (!firstAnchor || !lastAnchor) return gpMs

  if (gpMs <= firstAnchor.gpMs) {
    return gpMs + (firstAnchor.lrcMs - firstAnchor.gpMs)
  }

  if (gpMs >= lastAnchor.gpMs) {
    return gpMs + (lastAnchor.lrcMs - lastAnchor.gpMs)
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a1 = anchors[i]
    const a2 = anchors[i + 1]
    if (!a1 || !a2) continue

    if (gpMs >= a1.gpMs && gpMs < a2.gpMs) {
      const t = (gpMs - a1.gpMs) / (a2.gpMs - a1.gpMs)
      return a1.lrcMs + t * (a2.lrcMs - a1.lrcMs)
    }
  }

  return gpMs
}

/**
 * Remove consecutive chords with the same name.
 */
export function deduplicateChords(chords: readonly LineChord[]): LineChord[] {
  const result: LineChord[] = []
  let prevChord: string | undefined

  for (const chord of chords) {
    if (chord.chord !== prevChord) {
      result.push(chord)
      prevChord = chord.chord
    }
  }

  return result
}

/**
 * Assign chords to LRC lines.
 *
 * Rules (per spec §5):
 * - Assign by inclusion with ±300ms tolerance
 * - Convert to relative offset (from line start)
 * - Deduplicate consecutive identical chords
 * - Cap at 4 events per line
 */
export function alignChordsToLrc(
  chords: readonly ChordEvent[],
  lrcLines: readonly LrcLine[],
  transform?: TimeTransformV1,
): EnhancedChordLine[] {
  const transformedChords = chords.map(c => ({
    ...c,
    lrcMs: applyTimeTransform(c.startMs, transform),
  }))

  const result: EnhancedChordLine[] = []

  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    if (!line) continue

    const lineStart = line.startMs - TOLERANCE_MS
    const nextLine = lrcLines[lineIdx + 1]
    const lineEnd = (nextLine?.startMs ?? line.startMs + 10000) + TOLERANCE_MS

    const lineChords: LineChord[] = transformedChords
      .filter(c => c.lrcMs >= lineStart && c.lrcMs < lineEnd)
      .map(c => ({
        start: Math.max(0, c.lrcMs - line.startMs),
        dur: c.durationMs,
        chord: c.chord,
      }))

    const deduped = deduplicateChords(lineChords)
    const capped = deduped.slice(0, MAX_CHORDS_PER_LINE)

    if (capped.length > 0) {
      result.push({ idx: lineIdx, chords: capped })
    }
  }

  return result
}

/**
 * Generate the chord enhancement payload.
 */
export function generateChordPayload(
  lines: readonly EnhancedChordLine[],
  track?: TrackAnalysis,
  transform?: TimeTransformV1,
  algoVersion = "1.0.0",
): ChordEnhancementPayloadV1 {
  return {
    patchFormatVersion: "chords-json-v1",
    algoVersion,
    ...(transform && { timeTransform: transform }),
    ...(track && {
      track: {
        index: track.trackIndex,
        name: track.trackName,
        score: track.score,
      },
    }),
    lines,
  }
}

/**
 * Calculate coverage: fraction of lines with chords.
 */
export function calculateCoverage(
  enhancedLines: readonly EnhancedChordLine[],
  totalLrcLines: number,
): number {
  if (totalLrcLines === 0) return 0
  return enhancedLines.length / totalLrcLines
}

/**
 * Build a lookup from (lineIndex, wordIndex) → absolute word start time.
 */
function buildWordTimingMap(wordPatches: readonly WordPatch[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const patch of wordPatches) {
    const key = `${patch.lineIndex}:${patch.wordIndex}`
    map.set(key, patch.startMs)
  }
  return map
}

/**
 * Align chords to words when word-level timing is available.
 *
 * For each chord, finds the closest word that starts at or before the chord time,
 * and annotates the LineChord with the wordIdx.
 *
 * @param chords - Chord events from GP extraction
 * @param lrcLines - Parsed LRC lines with words
 * @param wordPatches - Word-level timing patches from alignWords()
 * @param transform - Optional time transform for GP→LRC time conversion
 * @returns Enhanced chord lines with word index annotations
 */
export function alignChordsToWords(
  chords: readonly ChordEvent[],
  lrcLines: readonly LrcLine[],
  wordPatches: readonly WordPatch[],
  transform?: TimeTransformV1,
): EnhancedChordLine[] {
  const wordTimingMap = buildWordTimingMap(wordPatches)

  const transformedChords = chords.map(c => ({
    ...c,
    lrcMs: applyTimeTransform(c.startMs, transform),
  }))

  const result: EnhancedChordLine[] = []

  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    if (!line) continue

    const lineStart = line.startMs - TOLERANCE_MS
    const nextLine = lrcLines[lineIdx + 1]
    const lineEnd = (nextLine?.startMs ?? line.startMs + 10000) + TOLERANCE_MS

    const lineChordsRaw = transformedChords.filter(c => c.lrcMs >= lineStart && c.lrcMs < lineEnd)

    const lineChords: LineChord[] = lineChordsRaw.map(c => {
      const relativeStart = Math.max(0, c.lrcMs - line.startMs)

      const wordIdx = findClosestWordIndex(c.lrcMs, lineIdx, line.words.length, wordTimingMap)

      return {
        start: relativeStart,
        dur: c.durationMs,
        chord: c.chord,
        ...(wordIdx !== undefined && { wordIdx }),
      }
    })

    const deduped = deduplicateChords(lineChords)
    const capped = deduped.slice(0, MAX_CHORDS_PER_LINE)

    if (capped.length > 0) {
      result.push({ idx: lineIdx, chords: capped })
    }
  }

  return result
}

/**
 * Find the word index whose start time is closest to (but not after) the chord time.
 * Returns undefined if no word timing is available for this line.
 */
function findClosestWordIndex(
  chordMs: number,
  lineIdx: number,
  wordCount: number,
  wordTimingMap: Map<string, number>,
): number | undefined {
  let bestIdx: number | undefined
  let bestTime = Number.NEGATIVE_INFINITY

  for (let wordIdx = 0; wordIdx < wordCount; wordIdx++) {
    const key = `${lineIdx}:${wordIdx}`
    const wordStartMs = wordTimingMap.get(key)

    if (wordStartMs === undefined) continue

    if (wordStartMs <= chordMs && wordStartMs > bestTime) {
      bestTime = wordStartMs
      bestIdx = wordIdx
    }
  }

  if (bestIdx === undefined) {
    for (let wordIdx = 0; wordIdx < wordCount; wordIdx++) {
      const key = `${lineIdx}:${wordIdx}`
      const wordStartMs = wordTimingMap.get(key)

      if (wordStartMs === undefined) continue

      if (bestIdx === undefined || wordStartMs < bestTime) {
        bestTime = wordStartMs
        bestIdx = wordIdx
      }
    }
  }

  return bestIdx
}
