import { beforeEach, describe, expect, test } from "vitest"
import { type Lyrics, LyricsPlayer } from "../LyricsPlayer"

const mockLyrics: Lyrics = {
  songId: "test-song",
  title: "Test Song",
  artist: "Test Artist",
  duration: 10,
  lines: [
    { id: "1", text: "Line one", startTime: 0, endTime: 3 },
    { id: "2", text: "Line two", startTime: 3, endTime: 6 },
    { id: "3", text: "Line three", startTime: 6, endTime: 10 },
  ],
}

describe("LyricsPlayer", () => {
  let player: LyricsPlayer
  let mockTime: number

  beforeEach(() => {
    mockTime = 0
    player = new LyricsPlayer(() => mockTime)
  })

  test("starts in Idle state", () => {
    expect(player.getSnapshot()._tag).toBe("Idle")
  })

  test("transitions to Ready after loading lyrics", () => {
    player.load(mockLyrics)
    expect(player.getSnapshot()._tag).toBe("Ready")
  })

  test("transitions to Playing when play is called", () => {
    player.load(mockLyrics)
    player.play()
    expect(player.getSnapshot()._tag).toBe("Playing")
  })

  test("returns correct line index at time 0", () => {
    player.load(mockLyrics, true)
    expect(player.getCurrentLineIndex()).toBe(0)
  })

  test("advances line index based on time", () => {
    player.load(mockLyrics, true)
    player.seek(4)
    expect(player.getCurrentLineIndex()).toBe(1)
  })

  test("advances to last line near end", () => {
    player.load(mockLyrics, true)
    player.seek(7)
    expect(player.getCurrentLineIndex()).toBe(2)
  })

  test("pauses correctly", () => {
    player.load(mockLyrics, true)
    player.pause()
    expect(player.getSnapshot()._tag).toBe("Paused")
  })

  test("reset returns to Ready state", () => {
    player.load(mockLyrics, true)
    player.reset()
    expect(player.getSnapshot()._tag).toBe("Ready")
  })

  test("hardReset returns to Idle state", () => {
    player.load(mockLyrics, true)
    player.hardReset()
    expect(player.getSnapshot()._tag).toBe("Idle")
  })

  test("jumpToLine seeks to correct time", () => {
    player.load(mockLyrics, true)
    player.jumpToLine(1)
    const state = player.getSnapshot()
    if (state._tag === "Playing" || state._tag === "Paused") {
      expect(state.currentTime).toBe(3)
    }
  })
})
