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
  readonly gpText?: string // Original GP word(s) that matched
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
 * - Lowercases
 * - Converts Cyrillic lookalikes to Latin (о→o, а→a, е→e, etc.)
 * - Collapses repeated vowels (ooo→o, aaa→a)
 * - Removes Guitar Pro prolongation markers like (o), (a), (u), (oo), etc.
 * - Removes +word suffixes (e.g., "all+yeah" → "all")
 * - Strips leading/trailing punctuation
 */
function normalizeToken(s: string): string {
  return (
    s
      .toLowerCase()
      // Convert Cyrillic lookalikes to Latin equivalents
      .replace(/а/g, "a") // Cyrillic а → Latin a
      .replace(/е/g, "e") // Cyrillic е → Latin e
      .replace(/о/g, "o") // Cyrillic о → Latin o
      .replace(/р/g, "p") // Cyrillic р → Latin p
      .replace(/с/g, "c") // Cyrillic с → Latin c
      .replace(/у/g, "y") // Cyrillic у → Latin y
      .replace(/х/g, "x") // Cyrillic х → Latin x
      // Collapse repeated vowels (ooo→o, aaa→a, etc.)
      .replace(/([aeiou])\1+/g, "$1")
      // Normalize interjections: ooh/oh/ohh → o, aah/ah/ahh → a
      .replace(/([ao])h+/g, "$1")
      // Normalize whoa/woah variants to o (sung "oh" sound)
      .replace(/\bwh?o+a+h?\b/gi, "o")
      // Collapse hyphenated interjections: oh-oh-oh → o, ah-ah → a
      .replace(/(o+h?[-−])+o*h?/gi, "o")
      .replace(/(a+h?[-−])+a*h?/gi, "a")
      // Remove GP prolongation markers: (o), (a), (e), (u), (oo), etc.
      .replace(/\([a-z]+\)/g, "")
      // Remove +suffix patterns (e.g., "all+yeah" → "all")
      .replace(/\+\w+/g, "")
      // Strip leading punctuation
      .replace(/^[^\p{L}\p{N}]+/u, "")
      // Strip trailing punctuation
      .replace(/[^\p{L}\p{N}]+$/u, "")
  )
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
): { matched: boolean; consumed: number; startMs: number; endMs: number; gpText: string } {
  let combined = ""
  const originalParts: string[] = []

  for (let i = 0; i < maxLookahead && startIdx + i < gpWords.length; i++) {
    const gpWord = gpWords[startIdx + i]
    if (!gpWord) continue

    combined += normalizeToken(gpWord.text)
    originalParts.push(gpWord.text)

    if (combined === normalizedLrc) {
      const firstWord = gpWords[startIdx]
      const lastWord = gpWords[startIdx + i]
      if (firstWord && lastWord) {
        return {
          matched: true,
          consumed: i + 1,
          startMs: firstWord.startMs,
          endMs: lastWord.startMs + 500, // estimate end
          gpText: originalParts.join(""),
        }
      }
    }

    // Stop if combined is already longer than target
    if (combined.length > normalizedLrc.length) {
      break
    }
  }

  return { matched: false, consumed: 0, startMs: 0, endMs: 0, gpText: "" }
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
): { gpIdx: number; consumed: number; startMs: number; endMs: number; gpText: string } | null {
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
        gpText: gpWord.text,
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
          gpText: joinResult.gpText,
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
 * The algorithm re-syncs gpIdx at each line boundary using line timing,
 * preventing drift from accumulating across the song. It continues searching
 * even after mismatches, using a sliding window to find the best match.
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
  const MAX_LOOKAHEAD = 20

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
          gpText: match.gpText,
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

export interface GpMetadata {
  readonly bpm: number
  readonly keySignature: string | null
  readonly tuning: string | null
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
  gpMeta?: GpMetadata,
  gpWords?: readonly WordTiming[],
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
    readonly startMs?: number
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
      startMs: firstWordStartMs,
      words,
    })
  }

  return {
    version: 1,
    algoVersion,
    lines,
    ...(gpMeta && { gpMeta }),
    ...(gpWords && {
      gpWords: gpWords.map((w, i) => {
        const nextWord = gpWords[i + 1]
        const durationMs = nextWord ? nextWord.startMs - w.startMs : 500
        return {
          text: w.text,
          startMs: w.startMs,
          durationMs: Math.max(50, durationMs),
        }
      }),
    }),
  }
}

/**
 * Estimate global offset between GP and LRC timing.
 *
 * Compares the first few matched words' GP startMs with their LRC line startMs
 * and returns the median offset (GP - LRC). Positive means GP is ahead of LRC.
 *
 * @param lrcLines - Parsed LRC lines
 * @param patches - Word alignment patches from alignWords()
 * @param sampleCount - Number of early patches to sample (default 8)
 * @returns Median offset in ms, or null if insufficient data
 */
export function estimateGlobalOffset(
  lrcLines: readonly LrcLine[],
  patches: readonly WordPatch[],
  sampleCount = 8,
): number | null {
  if (patches.length === 0 || lrcLines.length === 0) return null

  // Take earliest patches by time
  const sorted = [...patches].sort((a, b) => a.startMs - b.startMs)
  const sample = sorted.slice(0, sampleCount)

  const deltas: number[] = []
  for (const p of sample) {
    const line = lrcLines[p.lineIndex]
    if (!line) continue
    // GP time - LRC line start time
    deltas.push(p.startMs - line.startMs)
  }
  if (deltas.length === 0) return null

  deltas.sort((a, b) => a - b)
  const mid = Math.floor(deltas.length / 2)
  const firstMid = deltas[mid - 1]
  const secondMid = deltas[mid]
  const median =
    deltas.length % 2 === 1 || firstMid === undefined || secondMid === undefined
      ? (secondMid ?? firstMid ?? 0)
      : Math.round((firstMid + secondMid) / 2)

  return median
}

// ============================================================================
// Recovery Pass for Unmatched Lines
// ============================================================================

interface GpNormalized {
  readonly index: number
  readonly startMs: number
  readonly norm: string
  readonly text: string
}

interface BlockMatch {
  readonly score: number
  readonly scoreRatio: number
  readonly firstGpIndex: number
  readonly mapping: readonly number[] // gpIndex for each LRC token, -1 if unmatched
}

/**
 * Find the best GP word sequence that matches a block of LRC tokens.
 * Searches the entire GP word stream, allowing reuse of already-matched words.
 */
function findBestGpMatchForBlock(
  lrcTokens: readonly string[],
  gpNorm: readonly GpNormalized[],
): BlockMatch | null {
  const L = lrcTokens.length
  const G = gpNorm.length
  if (L === 0 || G === 0) return null

  const MAX_EXTRA_GP = 10 // allow some extra GP tokens interspersed
  let best: BlockMatch | null = null

  for (let gStart = 0; gStart < G; gStart++) {
    let l = 0
    let g = gStart
    let matched = 0
    let firstMatchIdx = -1
    const mapping: number[] = new Array(L).fill(-1)

    const maxG = Math.min(G, gStart + L + MAX_EXTRA_GP)

    while (l < L && g < maxG) {
      const gpWord = gpNorm[g]
      if (gpWord && gpWord.norm === lrcTokens[l]) {
        if (firstMatchIdx === -1) firstMatchIdx = gpWord.index
        mapping[l] = gpWord.index
        matched++
        l++
        g++
      } else {
        g++
      }
    }

    const scoreRatio = matched / L
    if (
      matched >= 2 &&
      scoreRatio >= 0.7 &&
      (!best ||
        scoreRatio > best.scoreRatio ||
        (scoreRatio === best.scoreRatio && matched > best.score))
    ) {
      best = {
        score: matched,
        scoreRatio,
        firstGpIndex: firstMatchIdx,
        mapping,
      }
    }
  }

  return best
}

/**
 * Recover word timing for unmatched LRC lines by searching the entire GP word stream.
 *
 * This handles cases where GP and LRC have different song structures (e.g., different
 * solo lengths) causing the sequential alignment to miss later sections.
 *
 * @param lrcLines - Parsed LRC lines
 * @param gpWords - All GP word timings
 * @param basePatches - Patches from the primary alignment pass
 * @returns Additional patches for recovered words
 */
export function recoverUnmatchedLrcLines(
  lrcLines: readonly LrcLine[],
  gpWords: readonly WordTiming[],
  basePatches: readonly WordPatch[],
): WordPatch[] {
  // Build set of lines that have patches
  const linesWithPatches = new Set<number>()
  for (const patch of basePatches) {
    linesWithPatches.add(patch.lineIndex)
  }

  // Find consecutive blocks of unmatched lines
  const unmatchedBlocks: Array<{ start: number; end: number }> = []
  let blockStart: number | null = null

  for (let i = 0; i < lrcLines.length; i++) {
    const line = lrcLines[i]
    const hasContent = line && line.words.length > 0
    const isUnmatched = hasContent && !linesWithPatches.has(i)

    if (isUnmatched) {
      if (blockStart === null) blockStart = i
    } else {
      if (blockStart !== null) {
        unmatchedBlocks.push({ start: blockStart, end: i - 1 })
        blockStart = null
      }
    }
  }
  if (blockStart !== null) {
    unmatchedBlocks.push({ start: blockStart, end: lrcLines.length - 1 })
  }

  if (unmatchedBlocks.length === 0) return []

  // Precompute normalized GP tokens
  const gpNorm: GpNormalized[] = gpWords.map((w, i) => ({
    index: i,
    startMs: w.startMs,
    norm: normalizeToken(w.text),
    text: w.text,
  }))

  const recoveredPatches: WordPatch[] = []

  for (const block of unmatchedBlocks) {
    // Collect LRC tokens and their locations for this block
    const lrcTokens: string[] = []
    const tokenLoc: Array<{ lineIndex: number; wordIndex: number }> = []

    for (let li = block.start; li <= block.end; li++) {
      const line = lrcLines[li]
      if (!line) continue
      for (let wi = 0; wi < line.words.length; wi++) {
        const word = line.words[wi]
        if (!word) continue
        const norm = normalizeToken(word)
        if (!norm) continue
        lrcTokens.push(norm)
        tokenLoc.push({ lineIndex: li, wordIndex: wi })
      }
    }

    if (lrcTokens.length < 2) continue // Skip single-word blocks

    // Find best matching GP segment
    const match = findBestGpMatchForBlock(lrcTokens, gpNorm)
    if (!match) continue

    // Group matched tokens by line to compute per-line offset
    const lineFirstGpMs = new Map<number, number>()
    for (let i = 0; i < tokenLoc.length; i++) {
      const loc = tokenLoc[i]
      const gpIdx = match.mapping[i]
      if (!loc || gpIdx === undefined || gpIdx === -1) continue
      const gpWord = gpWords[gpIdx]
      if (!gpWord) continue

      const existing = lineFirstGpMs.get(loc.lineIndex)
      if (existing === undefined || gpWord.startMs < existing) {
        lineFirstGpMs.set(loc.lineIndex, gpWord.startMs)
      }
    }

    // Create patches with timing offset to fit LRC line windows
    for (let i = 0; i < tokenLoc.length; i++) {
      const loc = tokenLoc[i]
      const gpIdx = match.mapping[i]
      if (!loc || gpIdx === undefined || gpIdx === -1) continue
      const gpWord = gpWords[gpIdx]
      const lrcLine = lrcLines[loc.lineIndex]
      if (!gpWord || !lrcLine) continue

      const lineGpFirst = lineFirstGpMs.get(loc.lineIndex)
      if (lineGpFirst === undefined) continue

      // Offset: shift GP timing so first word of line aligns with LRC line start
      const delta = lrcLine.startMs - lineGpFirst
      const adjustedStartMs = gpWord.startMs + delta

      // Compute duration
      const nextGpWord = gpWords[gpIdx + 1]
      let durationMs = nextGpWord ? nextGpWord.startMs - gpWord.startMs : 500
      durationMs = Math.max(50, Math.min(durationMs, 2000))

      recoveredPatches.push({
        lineIndex: loc.lineIndex,
        wordIndex: loc.wordIndex,
        startMs: Math.round(adjustedStartMs),
        durationMs: Math.round(durationMs),
        gpText: gpWord.text,
      })
    }
  }

  return recoveredPatches
}
