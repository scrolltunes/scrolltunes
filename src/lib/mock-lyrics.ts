/**
 * Mock lyrics data for development and testing
 */

import type { Lyrics } from "@/core"

/**
 * A simple demo song with basic timing
 */
export const DEMO_LYRICS: Lyrics = {
  songId: "demo-song",
  title: "Demo Song",
  artist: "ScrollTunes",
  duration: 60,
  lines: [
    { id: "1", text: "Welcome to ScrollTunes", startTime: 0, endTime: 5 },
    { id: "2", text: "Your live lyrics teleprompter", startTime: 5, endTime: 10 },
    { id: "3", text: "Just start singing", startTime: 10, endTime: 15 },
    { id: "4", text: "And watch the lyrics scroll", startTime: 15, endTime: 20 },
    { id: "5", text: "It detects your voice", startTime: 20, endTime: 25 },
    { id: "6", text: "And syncs automatically", startTime: 25, endTime: 30 },
    { id: "7", text: "No more losing your place", startTime: 30, endTime: 35 },
    { id: "8", text: "In the middle of a song", startTime: 35, endTime: 40 },
    { id: "9", text: "Perfect for musicians", startTime: 40, endTime: 45 },
    { id: "10", text: "And karaoke lovers", startTime: 45, endTime: 50 },
    { id: "11", text: "Try it now", startTime: 50, endTime: 55 },
    { id: "12", text: "And let the music flow", startTime: 55, endTime: 60 },
  ],
}

/**
 * A longer test song for testing scroll behavior
 */
export const LONG_TEST_LYRICS: Lyrics = {
  songId: "long-test",
  title: "Long Test Song",
  artist: "ScrollTunes Test",
  duration: 120,
  lines: [
    { id: "1", text: "This is line one of the test", startTime: 0, endTime: 5 },
    { id: "2", text: "Here comes line number two", startTime: 5, endTime: 10 },
    { id: "3", text: "And now we're on line three", startTime: 10, endTime: 15 },
    { id: "4", text: "Four lines down already", startTime: 15, endTime: 20 },
    { id: "5", text: "Five is the magic number", startTime: 20, endTime: 25 },
    { id: "6", text: "Six lines and counting", startTime: 25, endTime: 30 },
    { id: "7", text: "", startTime: 30, endTime: 35 },
    { id: "8", text: "After a pause we continue", startTime: 35, endTime: 40 },
    { id: "9", text: "Line nine keeps on going", startTime: 40, endTime: 45 },
    { id: "10", text: "Ten lines is a milestone", startTime: 45, endTime: 50 },
    { id: "11", text: "Eleven more to come", startTime: 50, endTime: 55 },
    { id: "12", text: "Twelve and we're halfway there", startTime: 55, endTime: 60 },
    { id: "13", text: "", startTime: 60, endTime: 65 },
    { id: "14", text: "Thirteen after the break", startTime: 65, endTime: 70 },
    { id: "15", text: "Fourteen lines of testing", startTime: 70, endTime: 75 },
    { id: "16", text: "Fifteen is looking good", startTime: 75, endTime: 80 },
    { id: "17", text: "Sixteen lines of scrolling text", startTime: 80, endTime: 85 },
    { id: "18", text: "Seventeen and still going strong", startTime: 85, endTime: 90 },
    { id: "19", text: "", startTime: 90, endTime: 95 },
    { id: "20", text: "Almost at the end now", startTime: 95, endTime: 100 },
    { id: "21", text: "Twenty one lines complete", startTime: 100, endTime: 105 },
    { id: "22", text: "This is the final line", startTime: 105, endTime: 110 },
    { id: "23", text: "Thank you for testing", startTime: 110, endTime: 120 },
  ],
}

/**
 * Get a mock lyrics by ID
 */
export function getMockLyrics(songId: string): Lyrics | null {
  switch (songId) {
    case "demo-song":
      return DEMO_LYRICS
    case "long-test":
      return LONG_TEST_LYRICS
    default:
      return null
  }
}

/**
 * List of available mock songs
 */
export const MOCK_SONGS = [
  { id: "demo-song", title: "Demo Song", artist: "ScrollTunes" },
  { id: "long-test", title: "Long Test Song", artist: "ScrollTunes Test" },
] as const

/**
 * BPM values for mock songs
 */
export const MOCK_BPM: Record<string, number> = {
  "demo-song": 120,
  "long-test": 100,
}

/**
 * Get BPM for a mock song by ID
 */
export function getMockBpmForSong(songId: string): number | null {
  return MOCK_BPM[songId] ?? null
}
