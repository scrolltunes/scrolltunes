/**
 * Tests for word alignment algorithm.
 *
 * Run with: bun run test src/lib/gp/align-words.test.ts
 */

import { describe, expect, it } from "vitest"
import {
  alignWords,
  estimateGlobalOffset,
  parseLrcToLines,
  recoverUnmatchedLrcLines,
} from "./align-words"
import type { WordTiming } from "./types"

describe("parseLrcToLines", () => {
  it("parses standard LRC format", () => {
    const lrc = `[00:05.00] Hello world
[00:10.50] How are you`

    const lines = parseLrcToLines(lrc)

    expect(lines).toHaveLength(2)
    expect(lines[0]?.startMs).toBe(5000)
    expect(lines[0]?.text).toBe("Hello world")
    expect(lines[0]?.words).toEqual(["Hello", "world"])
    expect(lines[1]?.startMs).toBe(10500)
  })

  it("handles millisecond format", () => {
    const lrc = "[00:05.123] Test line"

    const lines = parseLrcToLines(lrc)

    expect(lines[0]?.startMs).toBe(5123)
  })

  it("skips empty lines and metadata", () => {
    const lrc = `[ti:Test Song]
[ar:Artist]
[00:05.00] Hello
[00:10.00]
[00:15.00] World`

    const lines = parseLrcToLines(lrc)

    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe("Hello")
    expect(lines[1]?.text).toBe("World")
  })

  it("splits words correctly", () => {
    const lrc = "[00:05.00] One two  three   four"

    const lines = parseLrcToLines(lrc)

    expect(lines[0]?.words).toEqual(["One", "two", "three", "four"])
  })
})

describe("alignWords", () => {
  describe("basic alignment", () => {
    it("aligns exact matches", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Hello world")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "Hello" },
        { startMs: 5500, text: "world" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(2)
      expect(result.totalWords).toBe(2)
      expect(result.coverage).toBe(100)
    })

    it("handles case differences", () => {
      const lrcLines = parseLrcToLines("[00:05.00] HELLO World")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "hello" },
        { startMs: 5500, text: "WORLD" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(2)
      expect(result.coverage).toBe(100)
    })

    it("strips leading/trailing punctuation", () => {
      const lrcLines = parseLrcToLines('[00:05.00] "Hello" world!')
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "Hello" },
        { startMs: 5500, text: "world" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(2)
      expect(result.coverage).toBe(100)
    })
  })

  describe("hyphen handling", () => {
    it("matches hyphenated words by removing hyphens", () => {
      const lrcLines = parseLrcToLines("[00:05.00] self-destruction")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "self" },
        { startMs: 5200, text: "de" },
        { startMs: 5400, text: "struc" },
        { startMs: 5600, text: "tion" },
      ]

      const result = alignWords(lrcLines, gpWords)

      // "selfdestruction" matches joined "self" + "de" + "struc" + "tion"
      expect(result.matchedWords).toBe(1)
      expect(result.coverage).toBe(100)
    })

    it("matches never-ending pattern", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Never-ending maze")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "Neverending" },
        { startMs: 5500, text: "maze" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(2)
      expect(result.coverage).toBe(100)
    })
  })

  describe("word joining", () => {
    it("joins consecutive GP words to match LRC word", () => {
      const lrcLines = parseLrcToLines("[00:05.00] control")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "con" },
        { startMs: 5200, text: "trol" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
      expect(result.coverage).toBe(100)
    })

    it("joins up to 5 consecutive GP words", () => {
      const lrcLines = parseLrcToLines("[00:05.00] marionettes")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "ma" },
        { startMs: 5100, text: "ri" },
        { startMs: 5200, text: "o" },
        { startMs: 5300, text: "net" },
        { startMs: 5400, text: "tes" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
      expect(result.coverage).toBe(100)
    })
  })

  describe("interjection normalization", () => {
    it("normalizes oh variations", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Ooh")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "oh" }]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })

    it("normalizes repeated vowels", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Oooooh")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "oh" }]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })

    it("normalizes whoa variants", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Whoa")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "o" }]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })
  })

  describe("GP prolongation markers", () => {
    it("removes prolongation markers like (o)", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Yeah")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "Yeah(o)" }]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })

    it("removes +word suffixes", () => {
      const lrcLines = parseLrcToLines("[00:05.00] all")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "all+yeah" }]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })
  })

  describe("lookahead window", () => {
    it("finds matches within lookahead window", () => {
      const lrcLines = parseLrcToLines("[00:05.00] target")
      const gpWords: WordTiming[] = [
        { startMs: 4000, text: "skip1" },
        { startMs: 4500, text: "skip2" },
        { startMs: 5000, text: "target" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(1)
    })

    it("handles partial line matches", () => {
      const lrcLines = parseLrcToLines("[00:05.00] Hello beautiful world")
      const gpWords: WordTiming[] = [
        { startMs: 5000, text: "Hello" },
        { startMs: 6000, text: "world" },
      ]

      const result = alignWords(lrcLines, gpWords)

      expect(result.matchedWords).toBe(2)
      expect(result.totalWords).toBe(3)
    })
  })

  describe("split GP word detection", () => {
    it("detects and splits concatenated GP words", () => {
      // When GP has "pulseBefore" which should be "pulse" + "Before"
      const lrcLines = parseLrcToLines("[00:05.00] pulse Before")
      const gpWords: WordTiming[] = [{ startMs: 5000, text: "pulseBefore" }]

      const result = alignWords(lrcLines, gpWords)

      // Should match both words by splitting
      expect(result.matchedWords).toBe(2)
      expect(result.coverage).toBe(100)
    })
  })
})

describe("estimateGlobalOffset", () => {
  it("returns null for empty patches", () => {
    const lrcLines = parseLrcToLines("[00:05.00] Hello")
    const offset = estimateGlobalOffset(lrcLines, [])

    expect(offset).toBeNull()
  })

  it("calculates median offset from patches", () => {
    const lrcLines = parseLrcToLines(`[00:05.00] Hello world
[00:10.00] How are you`)

    const patches = [
      { lineIndex: 0, wordIndex: 0, startMs: 5100, durationMs: 400 },
      { lineIndex: 0, wordIndex: 1, startMs: 5600, durationMs: 400 },
      { lineIndex: 1, wordIndex: 0, startMs: 10100, durationMs: 300 },
      { lineIndex: 1, wordIndex: 1, startMs: 10400, durationMs: 300 },
    ]

    const offset = estimateGlobalOffset(lrcLines, patches)

    // Offset is calculated as GP startMs - LRC line startMs
    // Line 0: patches at 5100, 5600 → offsets: 100, 600
    // Line 1: patches at 10100, 10400 → offsets: 100, 400
    // Sorted: [100, 100, 400, 600] → median is avg of 100 and 400 = 250
    expect(offset).toBe(250)
  })

  it("uses median to handle outliers", () => {
    const lrcLines = parseLrcToLines("[00:05.00] One two three four")

    const patches = [
      { lineIndex: 0, wordIndex: 0, startMs: 5100, durationMs: 200 }, // +100
      { lineIndex: 0, wordIndex: 1, startMs: 5200, durationMs: 200 }, // +200
      { lineIndex: 0, wordIndex: 2, startMs: 5300, durationMs: 200 }, // +300
      { lineIndex: 0, wordIndex: 3, startMs: 10000, durationMs: 200 }, // +5000 (outlier)
    ]

    const offset = estimateGlobalOffset(lrcLines, patches)

    // Median should ignore the outlier
    expect(offset).toBeLessThan(1000)
  })
})

describe("recoverUnmatchedLrcLines", () => {
  it("recovers words from unmatched lines", () => {
    const lrcLines = parseLrcToLines(`[00:05.00] Matched line
[00:10.00] Unmatched line`)

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Matched" },
      { startMs: 5500, text: "line" },
      { startMs: 15000, text: "Unmatched" },
      { startMs: 15500, text: "line" },
    ]

    // Only first line has patches
    const basePatches = [
      { lineIndex: 0, wordIndex: 0, startMs: 5000, durationMs: 400 },
      { lineIndex: 0, wordIndex: 1, startMs: 5500, durationMs: 400 },
    ]

    const recovered = recoverUnmatchedLrcLines(lrcLines, gpWords, basePatches)

    // Should recover words from line 1
    expect(recovered.length).toBeGreaterThan(0)
    expect(recovered.some(p => p.lineIndex === 1)).toBe(true)
  })

  it("returns empty array when all lines are matched", () => {
    const lrcLines = parseLrcToLines("[00:05.00] Hello world")
    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
    ]

    const basePatches = [
      { lineIndex: 0, wordIndex: 0, startMs: 5000, durationMs: 400 },
      { lineIndex: 0, wordIndex: 1, startMs: 5500, durationMs: 400 },
    ]

    const recovered = recoverUnmatchedLrcLines(lrcLines, gpWords, basePatches)

    expect(recovered).toHaveLength(0)
  })

  it("requires minimum match ratio for recovery", () => {
    const lrcLines = parseLrcToLines(`[00:05.00] Matched
[00:10.00] Completely different words here`)

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Matched" },
      { startMs: 10000, text: "NotMatching" },
    ]

    const basePatches = [{ lineIndex: 0, wordIndex: 0, startMs: 5000, durationMs: 400 }]

    const recovered = recoverUnmatchedLrcLines(lrcLines, gpWords, basePatches)

    // Should not recover if match ratio is too low
    expect(recovered.filter(p => p.lineIndex === 1)).toHaveLength(0)
  })
})
