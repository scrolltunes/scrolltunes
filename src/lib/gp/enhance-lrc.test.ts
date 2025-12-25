/**
 * Tests for Enhanced LRC generation pipeline.
 *
 * Run with: bun run test src/lib/gp/enhance-lrc.test.ts
 *
 * To test with real files, use the CLI script:
 *   bun run scripts/test-enhance-lrc.ts <lrclib-id> <path-to-gp-file>
 */

import { describe, expect, it } from "vitest"
import { enhanceLrc, formatTimeMs, generateEnhancedLrc, parseTimestamp } from "./enhance-lrc"
import type { WordTiming } from "./types"

describe("formatTimeMs", () => {
  it("formats zero", () => {
    expect(formatTimeMs(0)).toBe("00:00.00")
  })

  it("formats seconds", () => {
    expect(formatTimeMs(5000)).toBe("00:05.00")
  })

  it("formats minutes and seconds", () => {
    expect(formatTimeMs(65000)).toBe("01:05.00")
  })

  it("formats with centiseconds", () => {
    expect(formatTimeMs(12340)).toBe("00:12.34")
  })

  it("formats complex time", () => {
    expect(formatTimeMs(185670)).toBe("03:05.67")
  })
})

describe("parseTimestamp", () => {
  it("parses standard format", () => {
    expect(parseTimestamp("01:23.45")).toBe(83450)
  })

  it("parses with milliseconds", () => {
    expect(parseTimestamp("00:05.123")).toBe(5123)
  })

  it("parses zero", () => {
    expect(parseTimestamp("00:00.00")).toBe(0)
  })

  it("returns 0 for invalid format", () => {
    expect(parseTimestamp("invalid")).toBe(0)
  })
})

describe("enhanceLrc", () => {
  it("aligns simple lyrics", () => {
    const lrcContent = `[00:05.00] Hello world
[00:10.00] How are you`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
      { startMs: 10000, text: "How" },
      { startMs: 10300, text: "are" },
      { startMs: 10600, text: "you" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    expect(result.coverage).toBe(100)
    expect(result.matchedWords).toBe(5)
    expect(result.totalWords).toBe(5)
    expect(result.enhancedLrc).toContain("[00:05.00]")
    expect(result.enhancedLrc).toContain("<00:05.50>world")
  })

  it("handles partial matches", () => {
    const lrcContent = "[00:05.00] Hello beautiful world"

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 6000, text: "world" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    expect(result.matchedWords).toBe(2)
    expect(result.totalWords).toBe(3)
    expect(result.coverage).toBeCloseTo(66.67, 0)
  })

  it("handles leading/trailing punctuation", () => {
    const lrcContent = `[00:05.00] "Hello" world!`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    expect(result.matchedWords).toBe(2)
    expect(result.coverage).toBe(100)
  })

  it("does not match words with internal punctuation differences", () => {
    // "Don't" and "Dont" are treated as different words
    const lrcContent = `[00:05.00] Don't stop`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Dont" },
      { startMs: 5500, text: "stop" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    // Only "stop" matches, "Don't" != "Dont"
    expect(result.matchedWords).toBe(1)
  })

  it("handles case differences", () => {
    const lrcContent = "[00:05.00] HELLO World"

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "hello" },
      { startMs: 5500, text: "WORLD" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    expect(result.matchedWords).toBe(2)
    expect(result.coverage).toBe(100)
  })
})

describe("generateEnhancedLrc", () => {
  it("preserves metadata lines", () => {
    const lrcContent = `[ti:Test Song]
[ar:Test Artist]
[00:05.00] Hello world`

    const payload = {
      version: 1,
      algoVersion: 1,
      lines: [
        {
          idx: 0,
          words: [
            { idx: 0, start: 0, dur: 400 },
            { idx: 1, start: 500, dur: 400 },
          ],
        },
      ],
    }

    const result = generateEnhancedLrc(lrcContent, payload)

    expect(result).toContain("[ti:Test Song]")
    expect(result).toContain("[ar:Test Artist]")
  })

  it("skips first word timing when offset is 0", () => {
    const lrcContent = "[00:05.00] Hello world"

    const payload = {
      version: 1,
      algoVersion: 1,
      lines: [
        {
          idx: 0,
          words: [
            { idx: 0, start: 0, dur: 400 },
            { idx: 1, start: 500, dur: 400 },
          ],
        },
      ],
    }

    const result = generateEnhancedLrc(lrcContent, payload)

    // First word should NOT have timing prefix
    expect(result).toBe("[00:05.00] Hello <00:05.50>world")
  })

  it("includes timing for first word when offset is non-zero", () => {
    const lrcContent = "[00:05.00] Hello world"

    const payload = {
      version: 1,
      algoVersion: 1,
      lines: [
        {
          idx: 0,
          words: [
            { idx: 0, start: 200, dur: 300 },
            { idx: 1, start: 500, dur: 400 },
          ],
        },
      ],
    }

    const result = generateEnhancedLrc(lrcContent, payload)

    expect(result).toBe("[00:05.00] <00:05.20>Hello <00:05.50>world")
  })
})
