import type { LyricLine } from "@/core"
import { describe, expect, it } from "vitest"
import { calculateSimilarity, matchChordsToLyrics, normalizeText } from "./lyrics-matcher"
import type { SongsterrChordLine } from "./songsterr-types"

describe("normalizeText", () => {
  it("removes punctuation", () => {
    expect(normalizeText("Hello, world!")).toBe("hello world")
  })

  it("lowercases text", () => {
    expect(normalizeText("HELLO World")).toBe("hello world")
  })

  it("normalizes whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world")
  })

  it("handles combined transformations", () => {
    expect(normalizeText("  Hello,   WORLD!  ")).toBe("hello world")
  })
})

describe("calculateSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(calculateSimilarity("hello world", "hello world")).toBe(1.0)
  })

  it("returns 0.0 for completely different strings", () => {
    expect(calculateSimilarity("hello world", "foo bar")).toBe(0.0)
  })

  it("returns value between 0 and 1 for partial overlap", () => {
    const similarity = calculateSimilarity("hello world", "hello there")
    expect(similarity).toBeGreaterThan(0)
    expect(similarity).toBeLessThan(1)
  })

  it("handles empty strings", () => {
    expect(calculateSimilarity("", "hello")).toBe(0)
    expect(calculateSimilarity("hello", "")).toBe(0)
    expect(calculateSimilarity("", "")).toBe(0)
  })

  it("ignores case and punctuation", () => {
    expect(calculateSimilarity("Hello, World!", "hello world")).toBe(1.0)
  })
})

describe("matchChordsToLyrics", () => {
  const makeLyricLine = (id: string, text: string): LyricLine => ({
    id,
    text,
    startTime: 0,
    endTime: 5,
  })

  it("attaches chords to matching lines", () => {
    const chordLines: SongsterrChordLine[] = [{ text: "Hello world", chords: ["C", "G"] }]
    const lrclibLines: LyricLine[] = [
      makeLyricLine("1", "Hello world"),
      makeLyricLine("2", "Goodbye moon"),
    ]

    const result = matchChordsToLyrics(chordLines, lrclibLines)

    expect(result[0]?.chords).toEqual(["C", "G"])
    expect(result[1]?.chords).toBeUndefined()
  })

  it("leaves non-matching lines without chords", () => {
    const chordLines: SongsterrChordLine[] = [
      { text: "Something completely different", chords: ["Am"] },
    ]
    const lrclibLines: LyricLine[] = [makeLyricLine("1", "Hello world")]

    const result = matchChordsToLyrics(chordLines, lrclibLines)

    expect(result[0]?.chords).toBeUndefined()
  })

  it("skips chord lines with empty chords array", () => {
    const chordLines: SongsterrChordLine[] = [{ text: "Hello world", chords: [] }]
    const lrclibLines: LyricLine[] = [makeLyricLine("1", "Hello world")]

    const result = matchChordsToLyrics(chordLines, lrclibLines)

    expect(result[0]?.chords).toBeUndefined()
  })

  it("skips chord lines with empty text", () => {
    const chordLines: SongsterrChordLine[] = [{ text: "", chords: ["C"] }]
    const lrclibLines: LyricLine[] = [makeLyricLine("1", "Hello world")]

    const result = matchChordsToLyrics(chordLines, lrclibLines)

    expect(result[0]?.chords).toBeUndefined()
  })

  it("preserves original line properties", () => {
    const chordLines: SongsterrChordLine[] = [{ text: "Hello world", chords: ["C"] }]
    const lrclibLines: LyricLine[] = [{ id: "1", text: "Hello world", startTime: 10, endTime: 20 }]

    const result = matchChordsToLyrics(chordLines, lrclibLines)

    expect(result[0]).toMatchObject({
      id: "1",
      text: "Hello world",
      startTime: 10,
      endTime: 20,
      chords: ["C"],
    })
  })
})
