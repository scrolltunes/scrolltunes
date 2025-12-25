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
  let continueToNext = false // Track if previous syllable indicated continuation

  for (let i = 0; i < syllables.length; i++) {
    const syllable = syllables[i]
    if (!syllable) continue

    const text = syllable.text.trim()
    if (!text) continue

    // Handle bare hyphen as continuation marker
    // This means the previous syllable continues to the next non-hyphen syllable
    if (text === "-") {
      continueToNext = true
      continue
    }

    // Check for leading hyphen (continuation from previous syllable)
    // e.g., "-lse-" means continue the previous word with "lse"
    const hasLeadingHyphen = text.startsWith("-")
    const hasTrailingHyphen = text.endsWith("-")

    // This syllable continues the previous word if:
    // - It has a leading hyphen (explicit continuation marker), OR
    // - The previous syllable indicated continuation AND this syllable looks like a continuation
    //   (i.e., starts with lowercase or has trailing hyphen - indicates mid-word)
    //
    // If previous had trailing hyphen but this starts with uppercase and has no leading hyphen,
    // treat this as a new word (handles malformed GP like "lse-" followed by "Be")
    const looksLikeContinuation = hasLeadingHyphen || hasTrailingHyphen || /^[a-z]/.test(text)
    const continuesFromPrevious = hasLeadingHyphen || (continueToNext && looksLikeContinuation)

    // If this syllable starts a new word AND we have a word in progress, push it first
    if (!continuesFromPrevious && currentWord && wordStartTick !== null) {
      words.push({
        startMs: tickToMs(wordStartTick, tempoEvents as TempoEvent[]),
        text: currentWord,
      })
      currentWord = ""
      wordStartTick = null
    }

    // Start a new word if we don't have one in progress
    if (wordStartTick === null) {
      wordStartTick = syllable.tick
    }

    // Update continuation flag for next syllable
    continueToNext = hasTrailingHyphen

    // Determine the actual text content (strip leading/trailing hyphens)
    let content = text
    if (hasLeadingHyphen) content = content.slice(1)
    if (hasTrailingHyphen) content = content.slice(0, -1)

    // Add the content to current word
    currentWord += content

    // Word is complete if there's no trailing hyphen AND the next syllable isn't a bare "-"
    const nextSyllable = syllables[i + 1]
    const nextIsBareHyphen = nextSyllable?.text.trim() === "-"

    if (!hasTrailingHyphen && !nextIsBareHyphen) {
      if (wordStartTick !== null) {
        words.push({
          startMs: tickToMs(wordStartTick, tempoEvents as TempoEvent[]),
          text: currentWord,
        })
      }
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
