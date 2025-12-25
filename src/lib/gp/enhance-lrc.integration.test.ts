/**
 * Integration tests for the LRC enhancement round-trip.
 *
 * Verifies: LRC + GP words → payload → apply payload → same enhanced LRC
 *
 * Run with: bun run test src/lib/gp/enhance-lrc.integration.test.ts
 */

import { describe, expect, it } from "vitest"
import { enhanceLrc, generateEnhancedLrc } from "./enhance-lrc"
import type { WordTiming } from "./types"

describe("LRC enhancement round-trip", () => {
  it("payload can reconstruct enhanced LRC from original", () => {
    const lrcContent = `[00:05.00] Hello world
[00:10.00] How are you today`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
      { startMs: 10000, text: "How" },
      { startMs: 10300, text: "are" },
      { startMs: 10600, text: "you" },
      { startMs: 10900, text: "today" },
    ]

    // Step 1: Generate enhanced LRC and payload
    const result = enhanceLrc(lrcContent, gpWords)

    // Step 2: Apply payload to original LRC
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    // Step 3: Verify round-trip produces same output
    expect(reconstructed).toBe(result.enhancedLrc)
  })

  it("handles partial matches in round-trip", () => {
    const lrcContent = `[00:05.00] Hello beautiful world
[00:10.00] Goodbye cruel world`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      // "beautiful" missing in GP
      { startMs: 6000, text: "world" },
      { startMs: 10000, text: "Goodbye" },
      { startMs: 10500, text: "cruel" },
      { startMs: 11000, text: "world" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
    expect(result.matchedWords).toBeLessThan(result.totalWords)
  })

  it("handles punctuation differences in round-trip", () => {
    const lrcContent = `[00:05.00] "Hello," world!
[00:10.00] It's a test...`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
      { startMs: 10000, text: "It's" },
      { startMs: 10300, text: "a" },
      { startMs: 10600, text: "test" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
  })

  it("handles split words (syllables joined into words)", () => {
    const lrcContent = "[00:05.00] Control yourself"

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Con" },
      { startMs: 5200, text: "trol" },
      { startMs: 5500, text: "your" },
      { startMs: 5700, text: "self" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
    expect(result.coverage).toBe(100)
  })

  it("handles empty lines in round-trip", () => {
    const lrcContent = `[00:05.00] Hello world
[00:07.00]
[00:10.00] Second verse`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
      { startMs: 10000, text: "Second" },
      { startMs: 10500, text: "verse" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
    // Empty line should be preserved
    expect(reconstructed).toContain("[00:07.00]")
  })

  it("handles metadata lines in round-trip", () => {
    const lrcContent = `[ti:Test Song]
[ar:Test Artist]
[al:Test Album]
[00:05.00] Hello world`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
    expect(reconstructed).toContain("[ti:Test Song]")
    expect(reconstructed).toContain("[ar:Test Artist]")
    expect(reconstructed).toContain("[al:Test Album]")
  })

  it("preserves timing precision in round-trip", () => {
    const lrcContent = "[01:23.45] Word with precise timing"

    const gpWords: WordTiming[] = [
      { startMs: 83450, text: "Word" },
      { startMs: 83700, text: "with" },
      { startMs: 83950, text: "precise" },
      { startMs: 84300, text: "timing" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)
    const reconstructed = generateEnhancedLrc(lrcContent, result.payload)

    expect(reconstructed).toBe(result.enhancedLrc)
    // Verify timing format
    expect(reconstructed).toMatch(/\[01:23\.45\]/)
  })

  it("payload structure is correct for storage", () => {
    const lrcContent = `[00:05.00] Hello world
[00:10.00] Test line`

    const gpWords: WordTiming[] = [
      { startMs: 5000, text: "Hello" },
      { startMs: 5500, text: "world" },
      { startMs: 10000, text: "Test" },
      { startMs: 10400, text: "line" },
    ]

    const result = enhanceLrc(lrcContent, gpWords)

    // Verify payload structure
    expect(result.payload.version).toBe(1)
    expect(result.payload.algoVersion).toBe(1)
    expect(result.payload.lines).toHaveLength(2)

    // First line
    const line0 = result.payload.lines[0]
    expect(line0?.idx).toBe(0)
    expect(line0?.words).toHaveLength(2)
    expect(line0?.words[0]?.idx).toBe(0)
    expect(line0?.words[0]?.start).toBe(0) // First word offset is 0
    expect(line0?.words[1]?.idx).toBe(1)
    expect(line0?.words[1]?.start).toBe(500) // 5500 - 5000

    // Second line
    const line1 = result.payload.lines[1]
    expect(line1?.idx).toBe(1)
    expect(line1?.words).toHaveLength(2)
    expect(line1?.words[0]?.start).toBe(0)
    expect(line1?.words[1]?.start).toBe(400) // 10400 - 10000
  })
})
