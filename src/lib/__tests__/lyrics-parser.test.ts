import { describe, test, expect } from "vitest"
import { parseLRC, parseTimestamp, formatTimestamp } from "../lyrics-parser"

describe("parseTimestamp", () => {
  test("parses [mm:ss.xx] format", () => {
    expect(parseTimestamp("[01:23.45]")).toBe(83.45)
  })

  test("parses [mm:ss] format without centiseconds", () => {
    expect(parseTimestamp("[02:30]")).toBe(150)
  })

  test("parses single digit minutes", () => {
    expect(parseTimestamp("[0:45.00]")).toBe(45)
  })

  test("returns 0 for invalid format", () => {
    expect(parseTimestamp("invalid")).toBe(0)
  })
})

describe("formatTimestamp", () => {
  test("formats seconds to [mm:ss.xx]", () => {
    expect(formatTimestamp(83.45)).toBe("[01:23.45]")
  })

  test("formats whole seconds", () => {
    expect(formatTimestamp(150)).toBe("[02:30.00]")
  })

  test("pads single digits", () => {
    expect(formatTimestamp(5)).toBe("[00:05.00]")
  })
})

describe("parseLRC", () => {
  test("parses basic LRC content", () => {
    const lrc = `[ti:Test Song]
[ar:Test Artist]
[00:05.00]First line
[00:10.00]Second line
[00:15.00]Third line`

    const result = parseLRC(lrc, "test-id")

    expect(result.title).toBe("Test Song")
    expect(result.artist).toBe("Test Artist")
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0]?.text).toBe("First line")
    expect(result.lines[0]?.startTime).toBe(5)
    expect(result.lines[0]?.endTime).toBe(10)
  })

  test("handles multiple timestamps on same line", () => {
    const lrc = `[00:10.00][00:30.00]Repeated chorus`

    const result = parseLRC(lrc, "test-id")

    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]?.startTime).toBe(10)
    expect(result.lines[1]?.startTime).toBe(30)
    expect(result.lines[0]?.text).toBe("Repeated chorus")
    expect(result.lines[1]?.text).toBe("Repeated chorus")
  })

  test("sorts lines by time", () => {
    const lrc = `[00:20.00]Third
[00:05.00]First
[00:10.00]Second`

    const result = parseLRC(lrc, "test-id")

    expect(result.lines[0]?.text).toBe("First")
    expect(result.lines[1]?.text).toBe("Second")
    expect(result.lines[2]?.text).toBe("Third")
  })

  test("uses default title and artist", () => {
    const lrc = `[00:05.00]Line`

    const result = parseLRC(lrc, "test-id", "Default Title", "Default Artist")

    expect(result.title).toBe("Default Title")
    expect(result.artist).toBe("Default Artist")
  })

  test("skips empty lines", () => {
    const lrc = `[00:05.00]First

[00:10.00]Second`

    const result = parseLRC(lrc, "test-id")

    expect(result.lines).toHaveLength(2)
  })

  test("calculates duration from last line", () => {
    const lrc = `[00:05.00]First
[00:10.00]Last`

    const result = parseLRC(lrc, "test-id")

    expect(result.duration).toBe(15) // last line endTime defaults to startTime + 5
  })

  test("parses length metadata for duration", () => {
    const lrc = `[length:3:30]
[00:05.00]Line`

    const result = parseLRC(lrc, "test-id")

    expect(result.duration).toBe(210)
  })
})
