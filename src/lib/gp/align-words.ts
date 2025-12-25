/**
 * Word alignment algorithm for matching Guitar Pro timing to LRCLIB lyrics.
 *
 * Aligns words from Guitar Pro (with precise timing) to words in LRCLIB
 * lyrics (with only line-level timing), producing word-level patches.
 */

import type { EnhancementPayload } from "@/lib/db/schema"

export interface LrcLine {
  readonly startMs: number
  readonly text: string
  readonly words: readonly string[]
}

export interface WordPatch {
  readonly lineIndex: number
  readonly wordIndex: number
  readonly startMs: number
  readonly durationMs: number
}

export interface WordTiming {
  readonly startMs: number
  readonly text: string
}

export interface AlignmentResult {
  readonly patches: readonly WordPatch[]
  readonly coverage: number // 0-100 percentage of words matched
  readonly totalWords: number
  readonly matchedWords: number
}

/**
 * Normalize a token for comparison.
 * Lowercases and strips leading/trailing punctuation.
 */
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "")
}

/**
 * Parse LRC content into structured lines with words.
 */
export function parseLrcToLines(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  const lineRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/

  for (const line of lrc.split("\n")) {
    const match = line.match(lineRegex)
    if (!match) continue

    const [, mm, ss, cs, text] = match
    if (!mm || !ss || !cs) continue

    const startMs =
      Number.parseInt(mm, 10) * 60000 +
      Number.parseInt(ss, 10) * 1000 +
      Number.parseInt(cs.padEnd(3, "0").slice(0, 3), 10)

    const trimmedText = text?.trim() ?? ""
    if (trimmedText) {
      lines.push({
        startMs,
        text: trimmedText,
        words: trimmedText.split(/\s+/),
      })
    }
  }

  return lines
}

/**
 * Try to match an LRC word by combining consecutive GP words.
 * Returns the number of GP words consumed (0 if no match).
 */
function tryMatchWithJoin(
  normalizedLrc: string,
  gpWords: readonly WordTiming[],
  startIdx: number,
  maxLookahead = 3,
): { matched: boolean; consumed: number; startMs: number; endMs: number } {
  let combined = ""

  for (let i = 0; i < maxLookahead && startIdx + i < gpWords.length; i++) {
    const gpWord = gpWords[startIdx + i]
    if (!gpWord) continue

    combined += normalizeToken(gpWord.text)

    if (combined === normalizedLrc) {
      const firstWord = gpWords[startIdx]
      const lastWord = gpWords[startIdx + i]
      if (firstWord && lastWord) {
        return {
          matched: true,
          consumed: i + 1,
          startMs: firstWord.startMs,
          endMs: lastWord.startMs + 500, // estimate end
        }
      }
    }

    // Stop if combined is already longer than target
    if (combined.length > normalizedLrc.length) {
      break
    }
  }

  return { matched: false, consumed: 0, startMs: 0, endMs: 0 }
}

/**
 * Find a matching GP word within a search window.
 * Returns the index of the match, or -1 if not found.
 */
function findMatchInWindow(
  normalizedLrc: string,
  gpWords: readonly WordTiming[],
  startIdx: number,
  maxLookahead: number,
): { gpIdx: number; consumed: number; startMs: number; endMs: number } | null {
  for (let offset = 0; offset < maxLookahead && startIdx + offset < gpWords.length; offset++) {
    const gpWord = gpWords[startIdx + offset]
    if (!gpWord) continue

    const normalizedGp = normalizeToken(gpWord.text)

    // Exact match
    if (normalizedGp === normalizedLrc) {
      return {
        gpIdx: startIdx + offset,
        consumed: 1,
        startMs: gpWord.startMs,
        endMs: gpWord.startMs + 500,
      }
    }

    // Try joining consecutive GP words
    if (normalizedGp.length < normalizedLrc.length) {
      const joinResult = tryMatchWithJoin(normalizedLrc, gpWords, startIdx + offset)
      if (joinResult.matched) {
        return {
          gpIdx: startIdx + offset,
          consumed: joinResult.consumed,
          startMs: joinResult.startMs,
          endMs: joinResult.endMs,
        }
      }
    }
  }

  return null
}

/**
 * Align Guitar Pro word timings to LRC lines.
 *
 * Uses normalized comparison to match words, handling punctuation differences.
 * Also handles split words (e.g., "con" + "trol" → "control") by trying to
 * join consecutive GP words when single words don't match.
 *
 * The algorithm continues searching even after mismatches, using a sliding
 * window to find the best match within a reasonable range.
 *
 * @param lrcLines - Parsed LRC lines with words
 * @param gpWords - Word timings from Guitar Pro
 * @returns Alignment result with patches and coverage stats
 */
export function alignWords(
  lrcLines: readonly LrcLine[],
  gpWords: readonly WordTiming[],
): AlignmentResult {
  const patches: WordPatch[] = []
  let gpIdx = 0
  let totalWords = 0
  let matchedWords = 0

  // Maximum words to look ahead when searching for a match
  const MAX_LOOKAHEAD = 10

  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    if (!line) continue

    for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
      const lrcWord = line.words[wordIdx]
      if (!lrcWord) continue

      totalWords++
      const normalizedLrc = normalizeToken(lrcWord)
      if (!normalizedLrc) continue

      // Search for matching GP word within a window
      const match = findMatchInWindow(normalizedLrc, gpWords, gpIdx, MAX_LOOKAHEAD)

      if (match) {
        // Calculate duration
        const nextWordMs = gpWords[match.gpIdx + match.consumed]?.startMs
        const nextLineMs = lrcLines[lineIdx + 1]?.startMs

        let durationMs = match.endMs - match.startMs

        if (nextWordMs !== undefined) {
          durationMs = Math.min(nextWordMs - match.startMs, 2000)
        } else if (nextLineMs !== undefined) {
          durationMs = Math.min(nextLineMs - match.startMs, 2000)
        }

        patches.push({
          lineIndex: lineIdx,
          wordIndex: wordIdx,
          startMs: Math.round(match.startMs),
          durationMs: Math.max(50, Math.round(durationMs)),
        })

        matchedWords++
        // Advance past the matched word(s)
        gpIdx = match.gpIdx + match.consumed
      } else {
        // No match found - skip this LRC word but DON'T advance gpIdx
        // This allows the next LRC word to potentially match the current GP word
      }
    }
  }

  const coverage = totalWords > 0 ? (matchedWords / totalWords) * 100 : 0

  return {
    patches,
    coverage,
    totalWords,
    matchedWords,
  }
}

/**
 * Convert alignment patches to the enhancement payload format.
 *
 * Groups patches by line and converts absolute times to line-relative offsets.
 */
export function patchesToPayload(
  patches: readonly WordPatch[],
  lrcLines: readonly LrcLine[],
  algoVersion = 1,
): EnhancementPayload {
  // Group patches by line
  const lineMap = new Map<number, WordPatch[]>()

  for (const patch of patches) {
    const existing = lineMap.get(patch.lineIndex)
    if (existing) {
      existing.push(patch)
    } else {
      lineMap.set(patch.lineIndex, [patch])
    }
  }

  // Build payload lines
  const lines: Array<{
    readonly idx: number
    readonly words: ReadonlyArray<{
      readonly idx: number
      readonly start: number
      readonly dur: number
    }>
  }> = []

  for (const [lineIdx, linePatches] of lineMap) {
    const line = lrcLines[lineIdx]
    if (!line || linePatches.length === 0) continue

    // Sort patches by word index to ensure correct order
    const sortedPatches = [...linePatches].sort((a, b) => a.wordIndex - b.wordIndex)

    // Use the first GP word's timing as reference (not LRCLIB line start)
    // This preserves the relative timing between words from the GP file
    const firstWordStartMs = sortedPatches[0]?.startMs ?? 0

    const words = sortedPatches.map(p => ({
      idx: p.wordIndex,
      start: Math.max(0, p.startMs - firstWordStartMs),
      dur: p.durationMs,
    }))

    lines.push({
      idx: lineIdx,
      words,
    })
  }

  return {
    version: 1,
    algoVersion,
    lines,
  }
}
