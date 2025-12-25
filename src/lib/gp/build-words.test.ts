/**
 * Tests for syllable joining (word building) logic.
 *
 * Run with: bun run test src/lib/gp/build-words.test.ts
 */

import { describe, expect, it } from "vitest"
import { buildWordTimings } from "./build-words"
import type { LyricSyllable, TempoEvent } from "./types"

const DEFAULT_TEMPO: TempoEvent[] = [{ tick: 0, bpm: 120 }]

describe("buildWordTimings", () => {
  describe("basic syllable joining", () => {
    it("joins syllables with trailing hyphens", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "ma-", sameBeat: false },
        { tick: 480, text: "ri-", sameBeat: false },
        { tick: 960, text: "o-", sameBeat: false },
        { tick: 1440, text: "nettes", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("marionettes")
    })

    it("creates separate words without hyphens", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "Hello", sameBeat: false },
        { tick: 480, text: "world", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(2)
      expect(words[0]?.text).toBe("Hello")
      expect(words[1]?.text).toBe("world")
    })

    it("handles mixed hyphenated and non-hyphenated", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "Hel-", sameBeat: false },
        { tick: 480, text: "lo", sameBeat: false },
        { tick: 960, text: "world", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(2)
      expect(words[0]?.text).toBe("Hello")
      expect(words[1]?.text).toBe("world")
    })
  })

  describe("bare hyphen handling", () => {
    it("treats bare hyphen as continuation marker", () => {
      // This is the "pulse" + "Before" case from Symphony of Destruction
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "pu", sameBeat: false },
        { tick: 480, text: "-", sameBeat: false },
        { tick: 960, text: "-lse-", sameBeat: false },
        { tick: 1440, text: "Be", sameBeat: false },
        { tick: 1920, text: "fore", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(3)
      expect(words[0]?.text).toBe("pulse")
      expect(words[1]?.text).toBe("Be")
      expect(words[2]?.text).toBe("fore")
    })

    it("continues word across bare hyphen when next has no trailing hyphen", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "some", sameBeat: false },
        { tick: 480, text: "-", sameBeat: false },
        { tick: 960, text: "-thing", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("something")
    })
  })

  describe("leading hyphen handling", () => {
    it("treats leading hyphen as continuation from previous", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "con-", sameBeat: false },
        { tick: 480, text: "-tin-", sameBeat: false },
        { tick: 960, text: "-ue", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("continue")
    })
  })

  describe("uppercase word boundary detection", () => {
    it("starts new word when uppercase follows trailing hyphen", () => {
      // When GP has "lse-" followed by "Be", "Be" is a new word (uppercase, no leading hyphen)
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "lse-", sameBeat: false },
        { tick: 480, text: "Be", sameBeat: false },
        { tick: 960, text: "fore", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(3)
      expect(words[0]?.text).toBe("lse")
      expect(words[1]?.text).toBe("Be")
      expect(words[2]?.text).toBe("fore")
    })

    it("continues word when lowercase follows trailing hyphen", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "de-", sameBeat: false },
        { tick: 480, text: "struc-", sameBeat: false },
        { tick: 960, text: "tion", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("destruction")
    })
  })

  describe("complex real-world cases", () => {
    it("handles self-destruction pattern (4 separate syllables)", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "self", sameBeat: false },
        { tick: 480, text: "de", sameBeat: false },
        { tick: 960, text: "struct", sameBeat: false },
        { tick: 1440, text: "ion", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      // Without hyphens, these are 4 separate words
      expect(words).toHaveLength(4)
      expect(words.map(w => w.text)).toEqual(["self", "de", "struct", "ion"])
    })

    it("handles never-ending pattern with hyphens", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "Nev-", sameBeat: false },
        { tick: 480, text: "er-", sameBeat: false },
        { tick: 960, text: "end-", sameBeat: false },
        { tick: 1440, text: "ing", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("Neverending")
    })

    it("handles interjection pattern", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "Oh-", sameBeat: false },
        { tick: 480, text: "oh-", sameBeat: false },
        { tick: 960, text: "oh", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("Ohohoh")
    })
  })

  describe("edge cases", () => {
    it("handles empty input", () => {
      const words = buildWordTimings([], DEFAULT_TEMPO)
      expect(words).toHaveLength(0)
    })

    it("handles single syllable without hyphen", () => {
      const syllables: LyricSyllable[] = [{ tick: 0, text: "Yeah", sameBeat: false }]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("Yeah")
    })

    it("handles trailing incomplete word", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "some-", sameBeat: false },
        { tick: 480, text: "thing-", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      // Trailing hyphenated word should still be pushed
      expect(words).toHaveLength(1)
      expect(words[0]?.text).toBe("something")
    })

    it("ignores empty syllables", () => {
      const syllables: LyricSyllable[] = [
        { tick: 0, text: "Hello", sameBeat: false },
        { tick: 480, text: "", sameBeat: false },
        { tick: 960, text: "   ", sameBeat: false },
        { tick: 1440, text: "world", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(2)
      expect(words[0]?.text).toBe("Hello")
      expect(words[1]?.text).toBe("world")
    })
  })

  describe("timing", () => {
    it("uses first syllable tick for word start time", () => {
      const syllables: LyricSyllable[] = [
        { tick: 960, text: "Hel-", sameBeat: false },
        { tick: 1440, text: "lo", sameBeat: false },
      ]

      const words = buildWordTimings(syllables, DEFAULT_TEMPO)

      expect(words).toHaveLength(1)
      // At 120 BPM with PPQ=960, tick 960 = 500ms
      expect(words[0]?.startMs).toBe(500)
    })
  })
})
