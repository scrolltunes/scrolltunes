/**
 * Guitar Pro lyrics extraction using alphaTab.
 *
 * This module parses Guitar Pro files (.gp, .gp3, .gp4, .gp5, .gpx) and
 * extracts lyrics with precise timing information.
 *
 * NOTE: alphaTab is browser-only. This code must run client-side.
 */

import * as alphaTab from "@coderline/alphatab"
import { tickToMs } from "./timing"
import type { ExtractedLyrics, LyricSyllable, TempoEvent } from "./types"

type Score = alphaTab.model.Score

/**
 * Parse a Guitar Pro file and return the alphaTab Score object.
 *
 * @param file - File object from file input or drag-drop
 * @returns Parsed Score containing tracks, bars, and lyrics
 */
export async function parseGuitarProFile(file: File): Promise<Score> {
  const arrayBuffer = await file.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  // alphaTab auto-detects format (GP3-7)
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(uint8Array)
  return score
}

/**
 * Extract lyrics and timing information from a parsed Guitar Pro score.
 *
 * Walks through all tracks to find lyrics attached to beats, collecting
 * syllables with their tick positions. Also extracts tempo changes.
 *
 * @param score - Parsed alphaTab Score object
 * @returns Extracted lyrics with syllables, tempo events, and metadata
 */
export function extractLyrics(score: Score): ExtractedLyrics {
  const syllables: LyricSyllable[] = []
  const tempoEvents: TempoEvent[] = [{ tick: 0, bpm: score.tempo }]

  // Collect tempo changes from master bars
  for (const masterBar of score.masterBars) {
    if (masterBar.tempoAutomation) {
      tempoEvents.push({
        tick: masterBar.start,
        bpm: masterBar.tempoAutomation.value,
      })
    }
  }

  // Sort tempo events by tick position
  tempoEvents.sort((a, b) => a.tick - b.tick)

  // Walk through tracks to find lyrics
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
        const bar = staff.bars[barIdx]
        const masterBar = score.masterBars[barIdx]

        if (!bar || !masterBar) continue

        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            // Extract lyrics from this beat
            if (beat.lyrics && beat.lyrics.length > 0) {
              for (const lyricText of beat.lyrics) {
                // Preserve original text with spaces for word boundary detection
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

    // Only process first track with lyrics
    if (syllables.length > 0) break
  }

  // Sort syllables by tick position
  syllables.sort((a, b) => a.tick - b.tick)

  // Calculate duration from last master bar
  const lastMasterBar = score.masterBars.at(-1)
  const durationMs = lastMasterBar
    ? tickToMs(lastMasterBar.start + lastMasterBar.calculateDuration(), tempoEvents)
    : 0

  return {
    meta: {
      title: score.title || "",
      artist: score.artist || "",
      album: score.album || undefined,
    },
    tempo: tempoEvents,
    syllables,
    durationMs,
  }
}
