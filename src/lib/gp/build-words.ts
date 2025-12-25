/**
 * Syllable joining (word building) for Guitar Pro lyrics.
 *
 * Guitar Pro stores lyrics as individual syllables with continuation markers:
 * - `la-` = syllable continues to next (hyphen at end)
 * - No hyphen = word is complete
 *
 * This module joins syllables into complete words with timing.
 */

import { tickToMs } from "./timing"
import type { LyricSyllable, TempoEvent, WordTiming } from "./types"

/**
 * Join syllables into complete words with timing information.
 *
 * @param syllables - Array of syllables extracted from Guitar Pro
 * @param tempoEvents - Array of tempo change events for timing conversion
 * @returns Array of words with their start times in milliseconds
 */
export function buildWordTimings(
  syllables: readonly LyricSyllable[],
  tempoEvents: readonly TempoEvent[],
): WordTiming[] {
  const words: WordTiming[] = []
  let currentWord = ""
  let wordStartTick: number | null = null

  for (const syllable of syllables) {
    const text = syllable.text.trim()
    if (!text) continue

    // Start a new word if we don't have one in progress
    if (wordStartTick === null) {
      wordStartTick = syllable.tick
    }

    // Check for continuation marker (hyphen at end)
    if (text.endsWith("-")) {
      // Append syllable without the hyphen, continue building
      currentWord += text.slice(0, -1)
    } else {
      // Word is complete
      currentWord += text

      words.push({
        startMs: tickToMs(wordStartTick, tempoEvents as TempoEvent[]),
        text: currentWord,
      })

      // Reset for next word
      currentWord = ""
      wordStartTick = null
    }
  }

  // Handle trailing incomplete word (no closing syllable)
  if (currentWord && wordStartTick !== null) {
    words.push({
      startMs: tickToMs(wordStartTick, tempoEvents as TempoEvent[]),
      text: currentWord,
    })
  }

  return words
}
