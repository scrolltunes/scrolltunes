/**
 * LRC Enhancement Application
 *
 * Applies word-level timing enhancements to parsed lyrics.
 * Enhancements provide precise word timing from Guitar Pro files,
 * replacing the default linear interpolation with real data.
 */

import type { LyricLine, LyricWord, Lyrics } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"

/**
 * Apply enhancement payload to lyrics, injecting word-level timings.
 *
 * For lines with enhancement data, splits text into words and assigns
 * real timing from the payload. Lines without enhancement data retain
 * their original structure (words will be interpolated at render time).
 *
 * @param lyrics - Parsed lyrics with line-level timing
 * @param enhancement - Enhancement payload with word offsets
 * @returns New lyrics object with word timings injected
 */
export function applyEnhancement(lyrics: Lyrics, enhancement: EnhancementPayload): Lyrics {
  const enhancedLines: LyricLine[] = []

  for (let lineIdx = 0; lineIdx < lyrics.lines.length; lineIdx++) {
    const line = lyrics.lines[lineIdx]
    if (!line) continue

    const linePatch = enhancement.lines.find(l => l.idx === lineIdx)

    if (!linePatch) {
      // No enhancement for this line, keep original
      enhancedLines.push(line)
      continue
    }

    // Split line text into words
    const textWords = line.text.split(/\s+/).filter(w => w.length > 0)
    const words: LyricWord[] = []

    for (let wordIdx = 0; wordIdx < textWords.length; wordIdx++) {
      const wordText = textWords[wordIdx]
      if (!wordText) continue

      const wordPatch = linePatch.words.find(w => w.idx === wordIdx)

      if (wordPatch) {
        // Use real timing from enhancement (convert ms offsets to seconds)
        // Clamp negative offsets to 0 (can occur with older enhancement data)
        const offsetSeconds = Math.max(0, wordPatch.start) / 1000
        const startTime = line.startTime + offsetSeconds
        const endTime = startTime + wordPatch.dur / 1000

        words.push({
          text: wordText,
          startTime,
          endTime,
        })
      } else {
        // No timing for this word, use line start as fallback
        words.push({
          text: wordText,
          startTime: line.startTime,
          endTime: line.startTime,
        })
      }
    }

    enhancedLines.push({
      ...line,
      words,
    })
  }

  return {
    ...lyrics,
    lines: enhancedLines,
  }
}

/**
 * Check if lyrics have any word-level timing data.
 */
export function hasWordTimings(lyrics: Lyrics): boolean {
  return lyrics.lines.some(line => line.words && line.words.length > 0)
}

/**
 * Get word timing data for a specific line index.
 * Returns undefined if the line has no word timings.
 */
export function getLineWordTimings(
  lyrics: Lyrics,
  lineIndex: number,
): readonly LyricWord[] | undefined {
  const line = lyrics.lines[lineIndex]
  if (!line?.words || line.words.length === 0) {
    return undefined
  }
  return line.words
}
