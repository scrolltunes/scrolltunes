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
import {
  alignWords,
  estimateGlobalOffset,
  parseLrcToLines,
  patchesToPayload,
  recoverUnmatchedLrcLines,
} from "../src/lib/gp/align-words"
import { buildWordTimings } from "../src/lib/gp/build-words"
import { generateEnhancedLrc } from "../src/lib/gp/enhance-lrc"
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

function scanAllTracksForLyrics(buffer: ArrayBuffer): void {
  const uint8Array = new Uint8Array(buffer)
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(uint8Array)

  console.error(`\n=== Scanning ${score.tracks.length} tracks for lyrics ===`)

  for (let trackIdx = 0; trackIdx < score.tracks.length; trackIdx++) {
    const track = score.tracks[trackIdx]
    if (!track) continue

    let syllableCount = 0
    const firstFewSyllables: string[] = []

    for (const staff of track.staves) {
      for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
        const bar = staff.bars[barIdx]
        if (!bar) continue

        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.lyrics && beat.lyrics.length > 0) {
              for (const lyricText of beat.lyrics) {
                if (lyricText.trim()) {
                  syllableCount++
                  if (firstFewSyllables.length < 10) {
                    firstFewSyllables.push(lyricText.trim())
                  }
                }
              }
            }
          }
        }
      }
    }

    const status = syllableCount > 0 ? `✓ ${syllableCount} syllables` : "✗ no lyrics"
    console.error(`  Track ${trackIdx}: "${track.name}" - ${status}`)
    if (firstFewSyllables.length > 0) {
      console.error(`    Preview: ${firstFewSyllables.join(" ")}...`)
    }
  }
  console.error("")
}

function parseGpFile(buffer: ArrayBuffer): {
  syllables: LyricSyllable[]
  tempoEvents: TempoEvent[]
  meta: { title: string; artist: string; bpm: number }
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
      bpm: score.tempo,
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

  // Scan all tracks if SCAN_TRACKS is set
  if (process.env.SCAN_TRACKS) {
    scanAllTracksForLyrics(gpBuffer)
  }

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

  // Dump all extracted data if DUMP_ALL is set
  if (process.env.DUMP_ALL) {
    console.error(`\n=== ALL SYLLABLES (${syllables.length} total) ===`)
    for (const syl of syllables) {
      console.error(`  tick=${syl.tick} text="${syl.text}"`)
    }
    console.error(`\n=== ALL WORDS (${wordTimings.length} total) ===`)
    for (const w of wordTimings) {
      const sec = (w.startMs / 1000).toFixed(2)
      console.error(`  [${sec}s] "${w.text}"`)
    }
    console.error("")
  }

  // Debug: show GP words in time range
  const debugTimeRange = process.env.DEBUG_TIME
  if (debugTimeRange) {
    const [startSec, endSec] = debugTimeRange.split("-").map(Number)
    const startMs = (startSec ?? 0) * 1000
    const endMs = (endSec ?? 999) * 1000
    console.error(`\n=== GP Words ${startSec}s - ${endSec}s ===`)
    for (const w of wordTimings) {
      if (w.startMs >= startMs && w.startMs <= endMs) {
        const sec = (w.startMs / 1000).toFixed(2)
        console.error(`  [${sec}] "${w.text}"`)
      }
    }
    console.error("")
  }

  // Parse LRC and optionally scale to match GP tempo
  const rawLrcLines = parseLrcToLines(lrcContent)

  // BPM scaling: if GP tempo differs from recording, scale LRC times
  const recordingBpm = process.env.RECORDING_BPM ? Number(process.env.RECORDING_BPM) : null
  const gpBpm = meta.bpm
  let bpmScale = 1.0
  if (recordingBpm && recordingBpm !== gpBpm) {
    bpmScale = recordingBpm / gpBpm
    console.error(
      `  ⚡ BPM scaling: recording=${recordingBpm} → GP=${gpBpm} (scale=${bpmScale.toFixed(3)})`,
    )
  }

  const lrcLines = rawLrcLines.map(line => ({
    ...line,
    startMs: line.startMs * bpmScale,
  }))
  const baseAlignment = alignWords(lrcLines, wordTimings)
  const suggestedOffset = estimateGlobalOffset(lrcLines, baseAlignment.patches)

  let gpOffsetMs = 0
  if (suggestedOffset !== null && Math.abs(suggestedOffset) >= 150) {
    // Shift GP words by -offset to align with LRC/audio timing
    gpOffsetMs = -suggestedOffset
  }

  console.error("Running alignment...")
  if (gpOffsetMs !== 0) {
    console.error(
      `  ⚡ Shifting GP timing by ${gpOffsetMs > 0 ? "+" : ""}${gpOffsetMs}ms to match audio`,
    )
  }

  // Apply offset to GP words (GP is source of truth, shifted to match audio)
  const shiftedWordTimings = wordTimings.map(w => ({
    ...w,
    startMs: w.startMs + gpOffsetMs,
  }))

  // Run alignment with shifted GP words
  const alignment = alignWords(lrcLines, shiftedWordTimings)

  // Recovery pass: find unmatched lines and search entire GP stream for matches
  const recoveredPatches = recoverUnmatchedLrcLines(lrcLines, shiftedWordTimings, alignment.patches)
  const allPatches = [...alignment.patches, ...recoveredPatches]

  if (recoveredPatches.length > 0) {
    const recoveredLines = new Set(recoveredPatches.map(p => p.lineIndex)).size
    console.error(`  🔄 Recovered ${recoveredPatches.length} words across ${recoveredLines} lines`)
  }

  const payload = patchesToPayload(allPatches, lrcLines, 1, undefined, shiftedWordTimings)
  const enhancedLrc = generateEnhancedLrc(lrcContent, payload)

  const totalCoverage = (allPatches.length / alignment.totalWords) * 100
  console.error(
    `  ✓ Coverage: ${totalCoverage.toFixed(1)}% (${allPatches.length}/${alignment.totalWords} words)`,
  )

  // Show unmatched words
  const matchedSet = new Set(allPatches.map(p => `${p.lineIndex}-${p.wordIndex}`))
  const unmatchedWords: Array<{
    lineIdx: number
    wordIdx: number
    word: string
    lineText: string
  }> = []
  for (let lineIdx = 0; lineIdx < lrcLines.length; lineIdx++) {
    const line = lrcLines[lineIdx]
    if (!line) continue
    for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
      const word = line.words[wordIdx]
      if (!word) continue
      if (!matchedSet.has(`${lineIdx}-${wordIdx}`)) {
        unmatchedWords.push({ lineIdx, wordIdx, word, lineText: line.text })
      }
    }
  }

  if (unmatchedWords.length > 0) {
    console.error("")
    console.error(`=== Unmatched Words (${unmatchedWords.length}) ===`)
    let prevLineIdx = -1
    for (const { lineIdx, wordIdx, word, lineText } of unmatchedWords) {
      if (lineIdx !== prevLineIdx) {
        const line = lrcLines[lineIdx]
        const lineTimeStr = line ? `[${(line.startMs / 1000).toFixed(2)}s]` : ""
        console.error(`  Line ${lineIdx} ${lineTimeStr}: "${lineText}"`)
        prevLineIdx = lineIdx
      }
      console.error(`    - word ${wordIdx}: "${word}"`)
    }
  }

  console.error("")
  console.error("=== Enhanced LRC ===")
  console.log(enhancedLrc)
}

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
