#!/usr/bin/env bun
/**
 * CLI script to test the LRC enhancement pipeline.
 *
 * Usage:
 *   bun run scripts/test-enhance-lrc.ts <lrclib-id> <path-to-gp-file>
 *
 * Example:
 *   bun run scripts/test-enhance-lrc.ts 123456 ./song.gp5
 *
 * This script:
 * 1. Fetches LRC content from LRCLIB API
 * 2. Parses the Guitar Pro file to extract word timings
 * 3. Runs the alignment algorithm
 * 4. Outputs the enhanced LRC to stdout
 */

import * as alphaTab from "@coderline/alphatab"
import { buildWordTimings } from "../src/lib/gp/build-words"
import { enhanceLrc } from "../src/lib/gp/enhance-lrc"
import { tickToMs } from "../src/lib/gp/timing"
import type { LyricSyllable, TempoEvent } from "../src/lib/gp/types"

async function fetchLrcContent(lrclibId: number): Promise<string> {
  const response = await fetch(`https://lrclib.net/api/get/${lrclibId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch from LRCLIB: ${response.status} ${response.statusText}`)
  }
  const data = (await response.json()) as {
    syncedLyrics: string | null
    plainLyrics: string | null
  }
  if (!data.syncedLyrics) {
    throw new Error("No synced lyrics available for this LRCLIB ID")
  }
  return data.syncedLyrics
}

function parseGpFile(buffer: ArrayBuffer): {
  syllables: LyricSyllable[]
  tempoEvents: TempoEvent[]
  meta: { title: string; artist: string }
} {
  const uint8Array = new Uint8Array(buffer)
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(uint8Array)

  const syllables: LyricSyllable[] = []
  const tempoEvents: TempoEvent[] = [{ tick: 0, bpm: score.tempo }]

  // Collect tempo changes
  for (const masterBar of score.masterBars) {
    if (masterBar.tempoAutomation) {
      tempoEvents.push({
        tick: masterBar.start,
        bpm: masterBar.tempoAutomation.value,
      })
    }
  }
  tempoEvents.sort((a, b) => a.tick - b.tick)

  // Extract lyrics from tracks
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
        const bar = staff.bars[barIdx]
        const masterBar = score.masterBars[barIdx]
        if (!bar || !masterBar) continue

        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.lyrics && beat.lyrics.length > 0) {
              for (const lyricText of beat.lyrics) {
                if (lyricText.trim()) {
                  syllables.push({
                    tick: masterBar.start + beat.playbackStart,
                    text: lyricText,
                    sameBeat: false,
                  })
                }
              }
            }
          }
        }
      }
    }
    if (syllables.length > 0) break
  }

  syllables.sort((a, b) => a.tick - b.tick)

  return {
    syllables,
    tempoEvents,
    meta: {
      title: score.title || "Unknown",
      artist: score.artist || "Unknown",
    },
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error("Usage: bun run scripts/test-enhance-lrc.ts <lrclib-id> <path-to-gp-file>")
    console.error("")
    console.error("Example:")
    console.error("  bun run scripts/test-enhance-lrc.ts 123456 ./song.gp5")
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
  console.error(`  ✓ Fetched ${lrcContent.split("\n").length} lines`)

  console.error(`Parsing GP file: ${gpFilePath}...`)
  const gpFile = Bun.file(gpFilePath)
  if (!(await gpFile.exists())) {
    console.error(`Error: File not found: ${gpFilePath}`)
    process.exit(1)
  }
  const gpBuffer = await gpFile.arrayBuffer()
  const { syllables, tempoEvents, meta } = parseGpFile(gpBuffer)
  console.error(`  ✓ GP: "${meta.title}" by ${meta.artist}`)

  if (syllables.length === 0) {
    console.error("  ✗ No lyrics found in this GP file!")
    console.error("    This file cannot be used for LRC enhancement.")
    process.exit(1)
  }

  console.error(`  ✓ Extracted ${syllables.length} syllables`)

  const wordTimings = buildWordTimings(syllables, tempoEvents)
  console.error(`  ✓ Built ${wordTimings.length} word timings`)

  console.error("Running alignment...")
  const result = enhanceLrc(lrcContent, wordTimings)
  console.error(
    `  ✓ Coverage: ${result.coverage.toFixed(1)}% (${result.matchedWords}/${result.totalWords} words)`,
  )

  console.error("")
  console.error("=== Enhanced LRC ===")
  console.log(result.enhancedLrc)
}

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
