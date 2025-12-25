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

export type Score = alphaTab.model.Score

const KEY_SIGNATURE_MAJOR: Record<number, string> = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  [0]: "C",
  [1]: "G",
  [2]: "D",
  [3]: "A",
  [4]: "E",
  [5]: "B",
  [6]: "F#",
  [7]: "C#",
}

const KEY_SIGNATURE_MINOR: Record<number, string> = {
  [-7]: "Abm",
  [-6]: "Ebm",
  [-5]: "Bbm",
  [-4]: "Fm",
  [-3]: "Cm",
  [-2]: "Gm",
  [-1]: "Dm",
  [0]: "Am",
  [1]: "Em",
  [2]: "Bm",
  [3]: "F#m",
  [4]: "C#m",
  [5]: "G#m",
  [6]: "D#m",
  [7]: "A#m",
}

const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]
const DROP_D_TUNING = [64, 59, 55, 50, 45, 38]
const HALF_STEP_DOWN = [63, 58, 54, 49, 44, 39]
const DROP_C_TUNING = [62, 57, 53, 48, 43, 36]
const DADGAD_TUNING = [62, 57, 55, 50, 45, 38]
const OPEN_G_TUNING = [62, 59, 55, 50, 47, 38]
const OPEN_D_TUNING = [62, 57, 54, 50, 45, 38]

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function detectTuning(tuningNotes: number[]): string | null {
  if (tuningNotes.length === 0) return null

  if (arraysEqual(tuningNotes, STANDARD_TUNING)) return "Standard"
  if (arraysEqual(tuningNotes, DROP_D_TUNING)) return "Drop D"
  if (arraysEqual(tuningNotes, HALF_STEP_DOWN)) return "Half Step Down"
  if (arraysEqual(tuningNotes, DROP_C_TUNING)) return "Drop C"
  if (arraysEqual(tuningNotes, DADGAD_TUNING)) return "DADGAD"
  if (arraysEqual(tuningNotes, OPEN_G_TUNING)) return "Open G"
  if (arraysEqual(tuningNotes, OPEN_D_TUNING)) return "Open D"

  return null
}

function extractKeySignature(score: Score): string | null {
  const firstMasterBar = score.masterBars[0]
  if (!firstMasterBar) return null

  const keySig = firstMasterBar.keySignature
  const isMinor = firstMasterBar.keySignatureType === alphaTab.model.KeySignatureType.Minor

  const lookup = isMinor ? KEY_SIGNATURE_MINOR : KEY_SIGNATURE_MAJOR
  return lookup[keySig] ?? null
}

function extractTuning(score: Score): string | null {
  for (const track of score.tracks) {
    const isGuitar =
      track.playbackInfo.program >= 24 && track.playbackInfo.program <= 31

    if (!isGuitar) continue

    for (const staff of track.staves) {
      if (staff.tuning && staff.tuning.length > 0) {
        const tuningNotes = [...staff.tuning]
        return detectTuning(tuningNotes)
      }
    }
  }

  return null
}

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
    bpm: score.tempo,
    keySignature: extractKeySignature(score),
    tuning: extractTuning(score),
  }
}
