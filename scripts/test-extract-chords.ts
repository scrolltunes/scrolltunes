#!/usr/bin/env bun
/**
 * CLI script to test the GP chord extraction pipeline.
 *
 * Usage:
 *   bun run scripts/test-extract-chords.ts <lrclib-id> <path-to-gp-file>
 *
 * Example:
 *   bun run scripts/test-extract-chords.ts 12489920 "./song.gp"
 *
 * This script:
 * 1. Fetches LRC content from LRCLIB API
 * 2. Parses the Guitar Pro file to extract explicit chord markers
 * 3. Runs the chord alignment algorithm
 * 4. Outputs the aligned chords per line
 */

import * as alphaTab from "@coderline/alphatab"
import {
  alignChordsToLrc,
  calculateCoverage,
  generateChordPayload,
} from "../src/lib/gp/align-chords"
import { parseLrcToLines } from "../src/lib/gp/align-words"
import type { TrackAnalysis } from "../src/lib/gp/chord-types"
import {
  analyzeTracksForChords,
  extractExplicitChords,
  selectBestTrack,
} from "../src/lib/gp/extract-chords"
import type { TempoEvent } from "../src/lib/gp/types"

async function fetchLrcContent(lrclibId: number): Promise<string> {
  const response = await fetch(`https://lrclib.net/api/get/${lrclibId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch from LRCLIB: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as {
    syncedLyrics: string | null
    plainLyrics: string | null
    trackName: string
    artistName: string
  }
  if (!data.syncedLyrics) {
    throw new Error("No synced lyrics available for this LRCLIB ID")
  }
  console.error(`  ✓ Song: "${data.trackName}" by ${data.artistName}`)
  return data.syncedLyrics
}

function parseGpFile(buffer: ArrayBuffer): {
  score: alphaTab.model.Score
  tempoEvents: TempoEvent[]
  meta: { title: string; artist: string }
} {
  const uint8Array = new Uint8Array(buffer)
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(uint8Array)

  const tempoEvents: TempoEvent[] = [{ tick: 0, bpm: score.tempo }]

  for (const masterBar of score.masterBars) {
    if (masterBar.tempoAutomation) {
      tempoEvents.push({
        tick: masterBar.start,
        bpm: masterBar.tempoAutomation.value,
      })
    }
  }
  tempoEvents.sort((a, b) => a.tick - b.tick)

  return {
    score,
    tempoEvents,
    meta: {
      title: score.title || "Unknown",
      artist: score.artist || "Unknown",
    },
  }
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error("Usage: bun run scripts/test-extract-chords.ts <lrclib-id> <path-to-gp-file>")
    console.error("")
    console.error("Example:")
    console.error('  bun run scripts/test-extract-chords.ts 12489920 "./song.gp"')
    process.exit(1)
  }

  const lrclibId = Number.parseInt(args[0] ?? "", 10)
  const gpFilePath = args[1] ?? ""

  if (Number.isNaN(lrclibId)) {
    console.error("Error: Invalid LRCLIB ID")
    process.exit(1)
  }

  console.error(`Fetching LRC content for LRCLIB ID: ${lrclibId}...`)
  const lrcContent = await fetchLrcContent(lrclibId)
  const lrcLines = parseLrcToLines(lrcContent)
  console.error(`  ✓ Fetched ${lrcLines.length} lines`)

  console.error(`\nParsing GP file: ${gpFilePath}...`)
  const gpFile = Bun.file(gpFilePath)
  if (!(await gpFile.exists())) {
    console.error(`Error: File not found: ${gpFilePath}`)
    process.exit(1)
  }
  const gpBuffer = await gpFile.arrayBuffer()
  const { score, tempoEvents, meta } = parseGpFile(gpBuffer)
  console.error(`  ✓ GP: "${meta.title}" by ${meta.artist}`)
  console.error(`  ✓ Tempo events: ${tempoEvents.length}`)

  console.error("\nAnalyzing tracks for explicit chord markers...")
  const trackAnalyses = analyzeTracksForChords(score)
  console.error("  Tracks:")
  for (const track of trackAnalyses) {
    const marker = track.isPercussion ? " (percussion)" : ""
    const chordInfo =
      track.explicitChordCount > 0 ? ` [${track.explicitChordCount} chord markers]` : ""
    console.error(`    [${track.trackIndex}] ${track.trackName}${marker}${chordInfo}`)
  }

  const bestTrackIndex = selectBestTrack(trackAnalyses)

  if (bestTrackIndex === null) {
    console.error("\n  ✗ No tracks with explicit chord markers found!")
    console.error("    This GP file cannot be used for chord extraction.")
    process.exit(1)
  }

  const bestTrack = trackAnalyses[bestTrackIndex]
  console.error(`  ✓ Selected track: [${bestTrackIndex}] ${bestTrack?.trackName}`)

  console.error("\nExtracting explicit chords...")
  const chordEvents = extractExplicitChords(score, bestTrackIndex, tempoEvents)
  console.error(`  ✓ Extracted ${chordEvents.length} chord changes`)

  if (chordEvents.length > 0) {
    console.error("\n  First 20 chord events:")
    for (const chord of chordEvents.slice(0, 20)) {
      console.error(
        `    ${formatTime(chord.startMs)} - ${chord.chord} (${chord.durationMs.toFixed(0)}ms)`,
      )
    }
    if (chordEvents.length > 20) {
      console.error(`    ... and ${chordEvents.length - 20} more`)
    }
  }

  console.error("\nAligning chords to LRC lines...")
  const alignedLines = alignChordsToLrc(chordEvents, lrcLines)
  const coverage = calculateCoverage(alignedLines, lrcLines.length)
  console.error(
    `  ✓ Coverage: ${(coverage * 100).toFixed(1)}% (${alignedLines.length}/${lrcLines.length} lines with chords)`,
  )

  console.error("\n=== Aligned Chords ===\n")

  const alignedMap = new Map(alignedLines.map(l => [l.idx, l]))

  for (let i = 0; i < lrcLines.length; i++) {
    const line = lrcLines[i]
    if (!line) continue
    const aligned = alignedMap.get(i)
    const lineText = line.words.join(" ") || "(instrumental)"

    if (aligned && aligned.chords.length > 0) {
      const chordStr = aligned.chords.map(c => `${c.chord}@+${c.start}ms`).join(", ")
      console.log(`[${formatTime(line.startMs)}] ${lineText}`)
      console.log(`  Chords: ${chordStr}`)
    } else {
      console.log(`[${formatTime(line.startMs)}] ${lineText}`)
    }
  }

  console.error("\n=== Payload Preview ===\n")
  const payload = generateChordPayload(alignedLines, bestTrack)
  console.log(JSON.stringify(payload, null, 2))
}

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
