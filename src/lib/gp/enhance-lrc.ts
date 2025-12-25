/**
 * Enhanced LRC generation from Guitar Pro word timings.
 *
 * This module combines alignment results with LRC content to produce
 * enhanced LRC format with word-level timing.
 */

import type { EnhancementPayload } from "@/lib/db/schema"
import { alignWords, parseLrcToLines, patchesToPayload } from "./align-words"
import type { WordTiming } from "./types"

/**
 * Format milliseconds as mm:ss.xx
 */
export function formatTimeMs(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`
}

/**
 * Parse LRC timestamp to milliseconds
 */
export function parseTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{2}):(\d{2})\.(\d{2,3})/)
  if (!match) return 0
  const [, mins, secs, centis] = match
  const minutes = Number.parseInt(mins ?? "0", 10)
  const seconds = Number.parseInt(secs ?? "0", 10)
  const fraction =
    centis?.length === 3 ? Number.parseInt(centis, 10) : Number.parseInt(centis ?? "0", 10) * 10
  return (minutes * 60 + seconds) * 1000 + fraction
}

/**
 * Generate Enhanced LRC format with word-level timing.
 *
 * Format: [mm:ss.xx] word1 <mm:ss.xx>word2 <mm:ss.xx>word3 ...
 * Where word timestamps are absolute (line start + word offset)
 *
 * @param lrcContent - Original LRC content with line-level timing
 * @param payload - Enhancement payload with word-level timing offsets
 * @returns Enhanced LRC string
 */
export function generateEnhancedLrc(lrcContent: string, payload: EnhancementPayload): string {
  const lines = lrcContent.split("\n")
  const lineRegex = /^\[(\d{2}:\d{2}\.\d{2,3})\]\s*(.*)$/
  const enhancedLines: string[] = []

  // Build a map of line index -> word timings
  const lineTimings = new Map<number, Map<number, { start: number; dur: number }>>()
  for (const line of payload.lines) {
    const wordMap = new Map<number, { start: number; dur: number }>()
    for (const word of line.words) {
      wordMap.set(word.idx, { start: word.start, dur: word.dur })
    }
    lineTimings.set(line.idx, wordMap)
  }

  // Build line start map from payload (GP-derived timestamps)
  const lineStartByIdx = new Map<number, number>()
  for (const line of payload.lines) {
    if (line.startMs !== undefined) {
      lineStartByIdx.set(line.idx, line.startMs)
    }
  }

  let lastGpTimestampMs = 0 // Track last GP-derived timestamp separately
  let lineIndex = 0
  for (const line of lines) {
    const match = line.match(lineRegex)
    if (!match) {
      enhancedLines.push(line)
      continue
    }

    const [, timestamp, text] = match
    const trimmedText = text?.trim() ?? ""

    if (!trimmedText) {
      // Empty line - preserve original timestamp, don't increment lineIndex
      enhancedLines.push(`[${timestamp}]`)
      continue
    }

    // Determine line start time: prefer GP-derived (trusted), fall back to LRC
    const gpStartMs = lineStartByIdx.get(lineIndex)
    let lineStartMs: number
    if (gpStartMs !== undefined) {
      // Trust GP timing completely - only ensure monotonicity within GP-timed lines
      lineStartMs = Math.max(gpStartMs, lastGpTimestampMs + 50)
      lastGpTimestampMs = lineStartMs
    } else {
      // No GP timing - use original LRC timestamp (don't try to fit with GP timeline)
      lineStartMs = parseTimestamp(timestamp ?? "00:00.00")
    }

    const wordTimingsForLine = lineTimings.get(lineIndex)
    if (!wordTimingsForLine || wordTimingsForLine.size === 0) {
      enhancedLines.push(`[${formatTimeMs(lineStartMs)}] ${trimmedText}`)
      lineIndex++
      continue
    }

    // Split text into words and build enhanced format
    const words = trimmedText.split(/\s+/)
    const enhancedWords: string[] = []

    for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
      const word = words[wordIdx]
      const timing = wordTimingsForLine.get(wordIdx)

      if (timing && word) {
        // Skip timing for first word if it starts at 0 (starts at line time)
        if (wordIdx === 0 && timing.start === 0) {
          enhancedWords.push(word)
        } else {
          const absoluteTimeMs = lineStartMs + timing.start
          enhancedWords.push(`<${formatTimeMs(absoluteTimeMs)}>${word}`)
        }
      } else if (word) {
        enhancedWords.push(word)
      }
    }

    enhancedLines.push(`[${formatTimeMs(lineStartMs)}] ${enhancedWords.join(" ")}`)
    lineIndex++
  }

  return enhancedLines.join("\n")
}

export interface EnhanceLrcResult {
  enhancedLrc: string
  payload: EnhancementPayload
  coverage: number
  totalWords: number
  matchedWords: number
}

/**
 * Enhance LRC content with word-level timing from Guitar Pro word timings.
 *
 * This is the main entry point for the enhancement pipeline:
 * 1. Parse LRC into lines
 * 2. Align GP words to LRC words
 * 3. Convert patches to payload
 * 4. Generate enhanced LRC
 *
 * @param lrcContent - Original LRC content with line-level timing
 * @param gpWords - Word timings extracted from Guitar Pro file
 * @returns Enhanced LRC result with payload and statistics
 */
export function enhanceLrc(lrcContent: string, gpWords: readonly WordTiming[]): EnhanceLrcResult {
  const lrcLines = parseLrcToLines(lrcContent)
  const alignment = alignWords(lrcLines, gpWords)
  const payload = patchesToPayload(alignment.patches, lrcLines, 1, undefined, gpWords)
  const enhancedLrc = generateEnhancedLrc(lrcContent, payload)

  return {
    enhancedLrc,
    payload,
    coverage: alignment.coverage,
    totalWords: alignment.totalWords,
    matchedWords: alignment.matchedWords,
  }
}
