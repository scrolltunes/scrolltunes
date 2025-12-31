import { describe, expect, it } from "vitest"
import {
  classifyAlbum,
  normalizeAlbumName,
  normalizeTrackName,
  selectBestAlbum,
} from "./normalize-track"
import {
  normalizeAlbum,
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
    expect(normalizeArtist("Main Artist with Guest")).toBe("main artist")
  })

  it("removes band qualifiers", () => {
    expect(normalizeArtist("Bruce Springsteen Band")).toBe("bruce springsteen")
    expect(normalizeArtist("London Symphony Orchestra")).toBe("london symphony")
    expect(normalizeArtist("Dave Brubeck Quartet")).toBe("dave brubeck")
  })

  it("handles simple artist names", () => {
    expect(normalizeArtist("The Beatles")).toBe("the beatles")
  })
})

describe("prepareCatalogSong", () => {
  it("prepares song with all fields including albumLower", () => {
    const result = prepareCatalogSong({
      title: "Bohemian Rhapsody (Remastered 2011)",
      artist: "Queen feat. David Bowie",
      album: "Greatest Hits (Deluxe Edition)",
      durationMs: 354000,
      spotifyId: "spotify:123",
      lrclibId: 456,
      hasSyncedLyrics: true,
    })

    expect(result).toEqual({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      album: "Greatest Hits (Deluxe Edition)",
      durationMs: 354000,
      spotifyId: "spotify:123",
      titleLower: "bohemian rhapsody",
      artistLower: "queen",
      albumLower: "greatest hits",
      hasSyncedLyrics: true,
      bpm: null,
      musicalKey: null,
      bpmSource: null,
      bpmSourceUrl: null,
    })
  })

  it("handles minimal input with null albumLower", () => {
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
      albumLower: null,
      hasSyncedLyrics: false,
      bpm: null,
      musicalKey: null,
      bpmSource: null,
      bpmSourceUrl: null,
    })
  })
})

describe("normalizeTrackName", () => {
  it("removes remaster suffixes with year", () => {
    expect(normalizeTrackName("Nothing Else Matters - Remastered 2021")).toBe(
      "Nothing Else Matters",
    )
    expect(normalizeTrackName("Enter Sandman (Remastered 2016)")).toBe("Enter Sandman")
  })

  it("removes live variants", () => {
    expect(normalizeTrackName("Master of Puppets (Live at Wembley)")).toBe("Master of Puppets")
    expect(normalizeTrackName("Fade to Black - Live")).toBe("Fade to Black")
    expect(normalizeTrackName("Creeping Death (Unplugged)")).toBe("Creeping Death")
  })

  it("removes edition variants", () => {
    expect(normalizeTrackName("Battery (Deluxe Edition)")).toBe("Battery")
    expect(normalizeTrackName("One (Anniversary Edition)")).toBe("One")
    expect(normalizeTrackName("Fuel (Collector's Edition)")).toBe("Fuel")
  })

  it("removes format variants", () => {
    expect(normalizeTrackName("Enter Sandman (Album Version)")).toBe("Enter Sandman")
    expect(normalizeTrackName("The Unforgiven (Extended Mix)")).toBe("The Unforgiven")
    expect(normalizeTrackName("Sad but True (Mono)")).toBe("Sad but True")
  })

  it("removes demo and alternate", () => {
    expect(normalizeTrackName("Nothing Else Matters (Demo)")).toBe("Nothing Else Matters")
    expect(normalizeTrackName("Fade to Black (Alternate Take)")).toBe("Fade to Black")
  })

  it("removes year suffixes", () => {
    expect(normalizeTrackName("Enter Sandman - 2021")).toBe("Enter Sandman")
    expect(normalizeTrackName("Master of Puppets - 2016 Version")).toBe("Master of Puppets")
  })

  it("preserves clean titles", () => {
    expect(normalizeTrackName("Enter Sandman")).toBe("Enter Sandman")
    expect(normalizeTrackName("Nothing Else Matters")).toBe("Nothing Else Matters")
  })
})

describe("normalizeAlbumName", () => {
  it("removes remaster suffixes", () => {
    expect(normalizeAlbumName("Metallica (Remastered)")).toBe("Metallica")
    expect(normalizeAlbumName("Black Album - Remastered 2021")).toBe("Black Album")
  })

  it("removes edition variants", () => {
    expect(normalizeAlbumName("Metallica (Deluxe Edition)")).toBe("Metallica")
    expect(normalizeAlbumName("Master of Puppets (Anniversary Edition)")).toBe("Master of Puppets")
    expect(normalizeAlbumName("Ride the Lightning (Super Deluxe)")).toBe("Ride the Lightning")
  })

  it("removes explicit/clean labels", () => {
    expect(normalizeAlbumName("Kill 'Em All (Explicit)")).toBe("Kill 'Em All")
  })

  it("preserves clean album names", () => {
    expect(normalizeAlbumName("Metallica")).toBe("Metallica")
    expect(normalizeAlbumName("Master of Puppets")).toBe("Master of Puppets")
  })
})

describe("classifyAlbum", () => {
  it("identifies live albums", () => {
    expect(classifyAlbum("S&M Live")).toBe("live")
    expect(classifyAlbum("Live at Wembley")).toBe("live")
    expect(classifyAlbum("MTV Unplugged")).toBe("live")
    expect(classifyAlbum("World Tour 2024")).toBe("live")
  })

  it("identifies compilations", () => {
    expect(classifyAlbum("Greatest Hits")).toBe("compilation")
    expect(classifyAlbum("Best of Metallica")).toBe("compilation")
    expect(classifyAlbum("The Essential Collection")).toBe("compilation")
    expect(classifyAlbum("Anthology")).toBe("compilation")
  })

  it("identifies soundtracks", () => {
    expect(classifyAlbum("Mission: Impossible II OST")).toBe("soundtrack")
    expect(classifyAlbum("Original Motion Picture Soundtrack")).toBe("soundtrack")
  })

  it("identifies remasters", () => {
    expect(classifyAlbum("Metallica (Remastered)")).toBe("remaster")
    expect(classifyAlbum("Black Album Reissue")).toBe("remaster")
  })

  it("identifies deluxe editions", () => {
    expect(classifyAlbum("Metallica (Deluxe Edition)")).toBe("deluxe")
    expect(classifyAlbum("Master of Puppets (Expanded)")).toBe("deluxe")
    expect(classifyAlbum("25th Anniversary Edition")).toBe("deluxe")
    expect(classifyAlbum("Special Edition")).toBe("deluxe")
  })

  it("defaults to studio for clean albums", () => {
    expect(classifyAlbum("Metallica")).toBe("studio")
    expect(classifyAlbum("Master of Puppets")).toBe("studio")
    expect(classifyAlbum("Kill 'Em All")).toBe("studio")
  })
})

describe("selectBestAlbum", () => {
  it("returns empty string for empty array", () => {
    expect(selectBestAlbum([])).toBe("")
  })

  it("prefers studio over all others", () => {
    expect(selectBestAlbum(["Metallica", "Greatest Hits", "S&M Live"])).toBe("Metallica")
  })

  it("prefers remaster over deluxe", () => {
    expect(selectBestAlbum(["Black Album (Deluxe)", "Black Album (Remastered)"])).toBe(
      "Black Album (Remastered)",
    )
  })

  it("prefers deluxe over compilation", () => {
    expect(selectBestAlbum(["Greatest Hits", "Metallica (Deluxe Edition)"])).toBe(
      "Metallica (Deluxe Edition)",
    )
  })

  it("prefers compilation over live", () => {
    expect(selectBestAlbum(["S&M Live", "Best of Metallica"])).toBe("Best of Metallica")
  })

  it("prefers live over soundtrack", () => {
    expect(selectBestAlbum(["Mission Impossible OST", "Live at Wembley"])).toBe("Live at Wembley")
  })
})

describe("normalizeAlbum", () => {
  it("normalizes album for search", () => {
    expect(normalizeAlbum("Metallica (Deluxe Edition)")).toBe("metallica")
    expect(normalizeAlbum("Black Album - Remastered 2021")).toBe("black album")
  })
})
