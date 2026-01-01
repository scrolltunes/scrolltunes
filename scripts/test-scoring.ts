#!/usr/bin/env bun
/**
 * Test the scoring logic on sample tracks without full extraction
 */

// Garbage title patterns (same as Rust)
const GARBAGE_TITLE_PATTERNS = [
  /^\d{1,4}\s*[-–—.]\s*/i, // Track numbers
  /^[^-–—]+ - [^-–—]+ - /i, // Double hyphen
  /^\d{1,2}\.\s+/i, // Numbered prefix
  /^[^'"]+\s+['"][^'"]+['"]$/i, // Artist 'Song' format
  /^[A-Za-z0-9\s]+ - [A-Za-z0-9\s]+$/i, // Artist - Song format
  /\s+\([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+\)$/i, // Cover attribution: "Song (Original Artist)"
]

function hasGarbageTitlePattern(title: string): boolean {
  return GARBAGE_TITLE_PATTERNS.some(p => p.test(title))
}

function titleContainsArtist(title: string, artist: string): boolean {
  if (artist.length < 3) return false
  return title.toLowerCase().includes(artist.toLowerCase())
}

function computeScore(title: string, artist: string, album: string): number {
  let score = 80 // Base score (studio album)

  if (hasGarbageTitlePattern(title)) {
    score -= 50
    console.log("  → Garbage pattern detected: -50")
  }

  if (titleContainsArtist(title, artist)) {
    score -= 40
    console.log("  → Title contains artist: -40")
  }

  return score
}

// Test cases
const testCases = [
  { title: "Everlong", artist: "Foo Fighters", album: "The Colour and the Shape" },
  { title: "Foo Fighters 'Everlong'", artist: "Various", album: "Greta Stanley" },
  { title: "Foo Fighters - Everlong", artist: "Foo Fighters", album: "rock bop" },
  { title: "Everlong (Foo Fighters)", artist: "Richard Cheese", album: "Supermassive Black Tux" },
  {
    title: "Foo Fighters - Everlong (Official HD Video)",
    artist: "Foo Fighters",
    album: "Foo Fighters",
  },
  { title: "0170. Foo Fighters - Everlong", artist: "VA", album: "NPO Radio 2 TOP 2000" },
  { title: "The Apparition", artist: "Sleep Token", album: "Take Me Back To Eden" },
  { title: "Родина", artist: "ДДТ", album: "Актриса Весна" },
]

console.log("\n=== Scoring Test ===\n")

for (const t of testCases) {
  console.log(`"${t.title}" by ${t.artist}`)
  const score = computeScore(t.title, t.artist, t.album)
  console.log(`  Final score: ${score}\n`)
}
