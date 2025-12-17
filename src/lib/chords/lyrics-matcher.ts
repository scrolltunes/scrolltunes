/**
 * Lyrics fuzzy matcher
 *
 * Matches Songsterr chord lines to LRCLIB lyrics lines to transfer timing information.
 */

import type { LyricLine } from "@/core"
import type { SongsterrChordLine } from "./songsterr-types"

export interface LyricLineWithChords {
  readonly id: string
  readonly text: string
  readonly startTime: number
  readonly endTime: number
  readonly chords?: readonly string[]
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeText(a)
  const normalizedB = normalizeText(b)

  if (!normalizedA || !normalizedB) return 0

  const wordsA = new Set(normalizedA.split(" ").filter(Boolean))
  const wordsB = new Set(normalizedB.split(" ").filter(Boolean))

  if (wordsA.size === 0 || wordsB.size === 0) return 0

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size

  return union === 0 ? 0 : intersection / union
}

export function findBestMatch(
  songsterrText: string,
  lrclibLines: readonly LyricLine[],
  threshold = 0.5,
): LyricLine | null {
  const normalizedSongsterr = normalizeText(songsterrText)
  if (!normalizedSongsterr) return null

  let bestMatch: LyricLine | null = null
  let bestScore = threshold

  for (const line of lrclibLines) {
    const score = calculateSimilarity(songsterrText, line.text)
    if (score > bestScore) {
      bestScore = score
      bestMatch = line
    }
  }

  return bestMatch
}

export function matchChordsToLyrics(
  chordLines: readonly SongsterrChordLine[],
  lrclibLines: readonly LyricLine[],
): LyricLineWithChords[] {
  const chordMap = new Map<string, readonly string[]>()

  for (const chordLine of chordLines) {
    const normalizedText = normalizeText(chordLine.text)
    if (!normalizedText || chordLine.chords.length === 0) continue

    if (chordMap.has(normalizedText)) continue

    const match = findBestMatch(chordLine.text, lrclibLines)
    if (match) {
      chordMap.set(match.id, chordLine.chords)
    }
  }

  return lrclibLines.map(line => {
    const chords = chordMap.get(line.id)
    if (chords) {
      return { ...line, chords }
    }
    return line
  })
}
