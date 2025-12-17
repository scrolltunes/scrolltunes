import { describe, expect, it } from "vitest"
import {
  extractLineChords,
  extractLineText,
  formatChordName,
  parseChordProDocument,
} from "./chord-parser"
import type { ChordData, ChordProElement, RawChordProDocument } from "./songsterr-types"

describe("formatChordName", () => {
  it("formats major chord", () => {
    const chord: ChordData = {
      baseNote: { name: "C" },
      firstNote: { name: "C" },
      chordType: { suffix: "" },
    }
    expect(formatChordName(chord)).toBe("C")
  })

  it("formats minor chord", () => {
    const chord: ChordData = {
      baseNote: { name: "A" },
      firstNote: { name: "A" },
      chordType: { suffix: "m" },
    }
    expect(formatChordName(chord)).toBe("Am")
  })

  it("formats seventh chord", () => {
    const chord: ChordData = {
      baseNote: { name: "G" },
      firstNote: { name: "G" },
      chordType: { suffix: "7" },
    }
    expect(formatChordName(chord)).toBe("G7")
  })

  it("formats slash chord", () => {
    const chord: ChordData = {
      baseNote: { name: "D" },
      firstNote: { name: "F#" },
      chordType: { suffix: "" },
    }
    expect(formatChordName(chord)).toBe("D/F#")
  })
})

describe("extractLineText", () => {
  it("joins only text elements", () => {
    const elements: ChordProElement[] = [
      { type: "text", text: "Hello " },
      {
        type: "chord",
        chord: { baseNote: { name: "C" }, firstNote: { name: "C" }, chordType: { suffix: "" } },
      },
      { type: "text", text: "world" },
    ]
    expect(extractLineText(elements)).toBe("Hello world")
  })

  it("returns empty string for empty elements", () => {
    expect(extractLineText([])).toBe("")
  })
})

describe("extractLineChords", () => {
  it("returns chord names in order", () => {
    const elements: ChordProElement[] = [
      { type: "text", text: "Hello " },
      {
        type: "chord",
        chord: { baseNote: { name: "C" }, firstNote: { name: "C" }, chordType: { suffix: "" } },
      },
      { type: "text", text: "world" },
      {
        type: "chord",
        chord: { baseNote: { name: "G" }, firstNote: { name: "G" }, chordType: { suffix: "7" } },
      },
    ]
    expect(extractLineChords(elements)).toEqual(["C", "G7"])
  })

  it("returns empty array when no chords", () => {
    const elements: ChordProElement[] = [{ type: "text", text: "Hello world" }]
    expect(extractLineChords(elements)).toEqual([])
  })
})

describe("parseChordProDocument", () => {
  it("extracts capo number", () => {
    const doc: RawChordProDocument = [{ type: "capo", text: "3" }]
    const result = parseChordProDocument(doc, 123, "Artist", "Title")
    expect(result.capo).toBe(3)
  })

  it("extracts tuning string", () => {
    const doc: RawChordProDocument = [{ type: "tuning", text: "Drop D" }]
    const result = parseChordProDocument(doc, 123, "Artist", "Title")
    expect(result.tuning).toBe("Drop D")
  })

  it("produces SongsterrChordLine array from line entries", () => {
    const doc: RawChordProDocument = [
      {
        type: "line",
        line: [
          { type: "text", text: "First line" },
          {
            type: "chord",
            chord: {
              baseNote: { name: "Am" },
              firstNote: { name: "Am" },
              chordType: { suffix: "" },
            },
          },
        ],
        blocks: [],
      },
      {
        type: "line",
        line: [
          {
            type: "chord",
            chord: {
              baseNote: { name: "G" },
              firstNote: { name: "G" },
              chordType: { suffix: "" },
            },
          },
          { type: "text", text: "Second line" },
        ],
        blocks: [],
      },
    ]
    const result = parseChordProDocument(doc, 123, "Artist", "Title")
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toEqual({
      text: "First line",
      chords: ["Am"],
      positionedChords: [{ charIndex: 10, name: "Am" }],
    })
    expect(result.lines[1]).toEqual({
      text: "Second line",
      chords: ["G"],
      positionedChords: [{ charIndex: 0, name: "G" }],
    })
  })

  it("returns empty lines array for empty document", () => {
    const doc: RawChordProDocument = []
    const result = parseChordProDocument(doc, 123, "Artist", "Title")
    expect(result.lines).toEqual([])
  })

  it("skips lines with no text content", () => {
    const doc: RawChordProDocument = [
      {
        type: "line",
        line: [
          {
            type: "chord",
            chord: { baseNote: { name: "C" }, firstNote: { name: "C" }, chordType: { suffix: "" } },
          },
        ],
        blocks: [],
      },
    ]
    const result = parseChordProDocument(doc, 123, "Artist", "Title")
    expect(result.lines).toEqual([])
  })
})
