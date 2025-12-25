import { describe, expect, it } from "vitest"
import {
  normalizeArtist,
  normalizeSongKey,
  normalizeTitle,
  prepareCatalogSong,
} from "./song-catalog"

describe("normalizeSongKey", () => {
  it("lowercases text", () => {
    expect(normalizeSongKey("Hello World")).toBe("hello world")
  })

  it("normalizes whitespace", () => {
    expect(normalizeSongKey("Hello   World")).toBe("hello world")
  })

  it("removes punctuation", () => {
    expect(normalizeSongKey("Hello, World!")).toBe("hello world")
    expect(normalizeSongKey("Rock 'n' Roll")).toBe("rock n roll")
  })

  it("trims whitespace", () => {
    expect(normalizeSongKey("  Hello World  ")).toBe("hello world")
  })
})

describe("normalizeTitle", () => {
  it("removes remaster labels", () => {
    expect(normalizeTitle("Bohemian Rhapsody (Remastered 2011)")).toBe("bohemian rhapsody")
  })

  it("removes radio edit labels", () => {
    expect(normalizeTitle("Some Song (Radio Edit)")).toBe("some song")
  })

  it("handles clean titles", () => {
    expect(normalizeTitle("Hotel California")).toBe("hotel california")
  })
})

describe("normalizeArtist", () => {
  it("removes featured artists", () => {
    expect(normalizeArtist("Queen feat. David Bowie")).toBe("queen")
    expect(normalizeArtist("Artist ft. Another")).toBe("artist")
  })

  it("handles simple artist names", () => {
    expect(normalizeArtist("The Beatles")).toBe("the beatles")
  })
})

describe("prepareCatalogSong", () => {
  it("prepares song with all fields", () => {
    const result = prepareCatalogSong({
      title: "Bohemian Rhapsody (Remastered 2011)",
      artist: "Queen feat. David Bowie",
      album: "Greatest Hits",
      durationMs: 354000,
      spotifyId: "spotify:123",
      lrclibId: 456,
      hasSyncedLyrics: true,
    })

    expect(result).toEqual({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      album: "Greatest Hits",
      durationMs: 354000,
      spotifyId: "spotify:123",
      titleLower: "bohemian rhapsody",
      artistLower: "queen",
      hasSyncedLyrics: true,
    })
  })

  it("handles minimal input", () => {
    const result = prepareCatalogSong({
      title: "Hello",
      artist: "World",
    })

    expect(result).toEqual({
      title: "Hello",
      artist: "World",
      album: null,
      durationMs: null,
      spotifyId: null,
      titleLower: "hello",
      artistLower: "world",
      hasSyncedLyrics: false,
    })
  })
})
