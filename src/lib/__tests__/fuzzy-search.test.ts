import { describe, expect, test } from "vitest"
import { fuzzyMatchSongs } from "../fuzzy-search"

interface TestSong {
  readonly id: string
  readonly title: string
  readonly artist: string
}

const testSongs: readonly TestSong[] = [
  { id: "1", title: "Yellow", artist: "Coldplay" },
  { id: "2", title: "Fix You", artist: "Coldplay" },
  { id: "3", title: "Viva la Vida", artist: "Coldplay" },
  { id: "4", title: "Bohemian Rhapsody", artist: "Queen" },
  { id: "5", title: "Don't Stop Me Now", artist: "Queen" },
  { id: "6", title: "Hotel California", artist: "Eagles" },
  { id: "7", title: "Take It Easy", artist: "Eagles" },
  { id: "8", title: "Stairway to Heaven", artist: "Led Zeppelin" },
  { id: "9", title: "Let It Be", artist: "The Beatles" },
  { id: "10", title: "Yesterday", artist: "The Beatles" },
]

describe("fuzzyMatchSongs", () => {
  test("returns empty array for empty query", () => {
    const results = fuzzyMatchSongs("", testSongs)
    expect(results).toHaveLength(0)
  })

  test("returns empty array for whitespace query", () => {
    const results = fuzzyMatchSongs("   ", testSongs)
    expect(results).toHaveLength(0)
  })

  test("matches exact title", () => {
    const results = fuzzyMatchSongs("Yellow", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Yellow")
    expect(results[0]?.score).toBe(1)
  })

  test("matches case-insensitively", () => {
    const results = fuzzyMatchSongs("yellow", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Yellow")
  })

  test("matches partial artist name", () => {
    const results = fuzzyMatchSongs("cold", testSongs)
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.item.artist).toBe("Coldplay")
    }
  })

  test("matches partial title", () => {
    const results = fuzzyMatchSongs("bohemian", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Bohemian Rhapsody")
  })

  test("matches artist - title format", () => {
    const results = fuzzyMatchSongs("coldplay yellow", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Yellow")
    expect(results[0]?.item.artist).toBe("Coldplay")
  })

  test("scores are between 0 and 1", () => {
    const results = fuzzyMatchSongs("cold", testSongs)
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    }
  })

  test("results are sorted by score descending", () => {
    const results = fuzzyMatchSongs("the", testSongs)
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1]
      const curr = results[i]
      if (prev && curr) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score)
      }
    }
  })

  test("respects threshold parameter", () => {
    const lowThreshold = fuzzyMatchSongs("z", testSongs, 0.1)
    const highThreshold = fuzzyMatchSongs("z", testSongs, 0.9)
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length)
  })

  test("filters results below default threshold", () => {
    const results = fuzzyMatchSongs("xyz123", testSongs)
    expect(results).toHaveLength(0)
  })

  test("matches words across title and artist", () => {
    const results = fuzzyMatchSongs("beatles let", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Let It Be")
  })

  test("handles special characters in query", () => {
    const results = fuzzyMatchSongs("don't stop", testSongs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.item.title).toBe("Don't Stop Me Now")
  })

  test("handles empty items array", () => {
    const results = fuzzyMatchSongs("test", [])
    expect(results).toHaveLength(0)
  })

  test("preserves original item reference", () => {
    const results = fuzzyMatchSongs("yellow", testSongs)
    expect(results[0]?.item).toBe(testSongs[0])
  })
})
