/**
 * Guitar Pro chord extraction using alphaTab.
 *
 * This module analyzes Guitar Pro files to extract chord events
 * using pitch-class histogram analysis.
 *
 * NOTE: alphaTab is browser-only. This code must run client-side.
 */

import type * as alphaTab from "@coderline/alphatab"
import type { ChordEvent, TrackAnalysis } from "./chord-types"
import { tickToMs } from "./timing"
import type { TempoEvent } from "./types"

type Score = alphaTab.model.Score

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

const CHORD_TEMPLATES = {
  major: new Set([0, 4, 7]),
  minor: new Set([0, 3, 7]),
  dim: new Set([0, 3, 6]),
  dom7: new Set([0, 4, 7, 10]),
  min7: new Set([0, 3, 7, 10]),
} as const

type ChordQuality = keyof typeof CHORD_TEMPLATES

const MIN_SCORE = 2.0
const SMOOTHING_THRESHOLD = 1.15

interface NoteEvent {
  tick: number
  pitch: number
  duration: number
}

interface MeasureWindow {
  startTick: number
  endTick: number
  notes: NoteEvent[]
}

interface ChordCandidate {
  rootPc: number
  quality: ChordQuality
  score: number
}

/**
 * Extract chord events from explicit GP chord markers (beat.chord).
 * This is preferred over pitch-class analysis when available.
 */
export function extractExplicitChords(
  score: Score,
  trackIndex: number,
  tempoEvents: TempoEvent[],
): ChordEvent[] {
  const track = score.tracks[trackIndex]
  if (!track) return []

  const chordEvents: ChordEvent[] = []
  let prevChordName: string | null = null
  let prevChordStart = 0

  for (const staff of track.staves) {
    for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
      const bar = staff.bars[barIdx]
      const masterBar = score.masterBars[barIdx]
      if (!bar || !masterBar) continue

      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (!beat.chord) continue

          const chordName = beat.chord.name || formatChordFromStrings(beat.chord)
          if (!chordName) continue

          const tick = masterBar.start + beat.playbackStart
          const startMs = tickToMs(tick, tempoEvents)

          // Only emit on chord change (deduplicate consecutive same chords)
          if (chordName !== prevChordName) {
            // Update duration of previous chord
            if (chordEvents.length > 0) {
              const lastEvent = chordEvents[chordEvents.length - 1]
              if (lastEvent) {
                chordEvents[chordEvents.length - 1] = {
                  ...lastEvent,
                  durationMs: startMs - prevChordStart,
                }
              }
            }

            chordEvents.push({
              startMs,
              durationMs: 0, // Will be updated when next chord appears
              chord: chordName,
              confidence: 1.0, // Explicit chords have high confidence
            })

            prevChordName = chordName
            prevChordStart = startMs
          }
        }
      }
    }
  }

  return chordEvents
}

/**
 * Format a chord name from string fingerings if no explicit name is present.
 */
function formatChordFromStrings(chord: { strings?: number[] }): string | null {
  // If chord has string fingerings but no name, we can't easily determine the name
  // This would require reverse-engineering the chord from the fret positions
  return null
}

/**
 * Count explicit chord markers in a track.
 */
function countExplicitChords(track: {
  staves: { bars: { voices: { beats: { chord?: unknown }[] }[] }[] }[]
}): number {
  let count = 0
  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (beat.chord) count++
        }
      }
    }
  }
  return count
}

/**
 * Analyze tracks for chord extraction suitability.
 *
 * Scoring (per spec §2):
 * - +2 if ≥3 notes frequently start at same tick (chordal)
 * - +1 if note onsets align to regular beat grid
 * - −2 if most events are monophonic runs
 */
export function analyzeTracksForChords(score: Score): TrackAnalysis[] {
  const results: TrackAnalysis[] = []

  for (let trackIndex = 0; trackIndex < score.tracks.length; trackIndex++) {
    const track = score.tracks[trackIndex]
    if (!track) continue

    const isPercussion = track.playbackInfo?.primaryChannel === 9
    const explicitChordCount = countExplicitChords(track)

    if (isPercussion) {
      results.push({
        trackIndex,
        trackName: track.name || `Track ${trackIndex + 1}`,
        score: -5,
        chordEventCount: 0,
        explicitChordCount,
        isPercussion: true,
      })
      continue
    }

    const notes = collectTrackNotes(track, score)
    const trackScore = scoreTrackForChords(notes, score)
    const chordEventCount = estimateChordEventCount(notes)

    results.push({
      trackIndex,
      trackName: track.name || `Track ${trackIndex + 1}`,
      score: trackScore,
      chordEventCount,
      explicitChordCount,
      isPercussion: false,
    })
  }

  return results
}

const GUITAR_KEYWORDS = ["guitar", "gtr", "acoustic", "electric", "rhythm"]
const VOICE_KEYWORDS = ["vocal", "voice", "lead vocal", "singer"]

function getTrackBonus(trackName: string): number {
  const lower = trackName.toLowerCase()
  // Prefer guitar tracks
  if (GUITAR_KEYWORDS.some(kw => lower.includes(kw))) return 2
  // Deprioritize vocal tracks (usually melody, not chords)
  if (VOICE_KEYWORDS.some(kw => lower.includes(kw))) return -2
  return 0
}

/**
 * Select the best track for chord extraction.
 * Only considers tracks with explicit chord markers.
 * Returns null if no track has explicit chords.
 *
 * Sorting priority:
 * 1. Guitar tracks (via name heuristics)
 * 2. Higher explicit chord count
 */
export function selectBestTrack(tracks: TrackAnalysis[]): number | null {
  const withExplicitChords = tracks.filter(t => !t.isPercussion && t.explicitChordCount > 0)
  if (withExplicitChords.length === 0) return null

  const sorted = [...withExplicitChords].sort((a, b) => {
    // Primary: prefer guitar tracks
    const aBonus = getTrackBonus(a.trackName)
    const bBonus = getTrackBonus(b.trackName)
    if (bBonus !== aBonus) return bBonus - aBonus

    // Secondary: more explicit chords
    return b.explicitChordCount - a.explicitChordCount
  })
  return sorted[0]?.trackIndex ?? null
}

/**
 * Extract chord events from a GP score.
 *
 * Algorithm (per spec §3):
 * 1. Define windows (per measure)
 * 2. Collect pitch-class histogram per window
 * 3. Score chord candidates
 * 4. Apply temporal smoothing
 * 5. Filter by confidence threshold
 */
export function extractChordEvents(
  score: Score,
  trackIndex: number,
  tempoEvents: TempoEvent[],
  options?: {
    minConfidence?: number
    smoothingThreshold?: number
    /** Use beat-based windows instead of measure-based for finer granularity */
    useBeatWindows?: boolean
  },
): ChordEvent[] {
  const track = score.tracks[trackIndex]
  if (!track) return []

  const smoothingThreshold = options?.smoothingThreshold ?? SMOOTHING_THRESHOLD
  const useBeatWindows = options?.useBeatWindows ?? false

  const notes = collectTrackNotes(track, score)
  const windows = useBeatWindows
    ? buildBeatWindows(score, notes)
    : buildMeasureWindows(score, notes)

  const chordEvents: ChordEvent[] = []
  let prevChord: ChordCandidate | null = null

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    if (!window || window.notes.length === 0) continue

    const nextWindow = windows[i + 1]
    const windowEndMs = nextWindow
      ? tickToMs(nextWindow.startTick, tempoEvents)
      : tickToMs(window.endTick, tempoEvents)

    const hist = buildPitchClassHistogram(window.notes)
    const bassPc = findBassPitchClass(window.notes)
    const candidate = findBestChord(hist, bassPc)

    if (!candidate) continue

    const shouldChange =
      !prevChord || candidate.rootPc !== prevChord.rootPc || candidate.quality !== prevChord.quality

    const meetsThreshold = !prevChord || candidate.score > prevChord.score * smoothingThreshold

    if (shouldChange && meetsThreshold && candidate.score >= MIN_SCORE) {
      const startMs = tickToMs(window.startTick, tempoEvents)
      const durationMs = windowEndMs - startMs

      const maxPossible = hist.reduce((a, b) => a + b, 0)
      const confidence = maxPossible > 0 ? Math.min(1, candidate.score / maxPossible) : 0

      chordEvents.push({
        startMs,
        durationMs,
        chord: formatExtractedChord(candidate.rootPc, candidate.quality),
        confidence,
      })

      prevChord = candidate
    }
  }

  return chordEvents
}

/**
 * Format a chord name from root pitch class and quality.
 * Uses sharp notation for consistency with transposeChord().
 */
export function formatExtractedChord(rootPc: number, quality: ChordQuality): string {
  const root = NOTE_NAMES[rootPc % 12]
  switch (quality) {
    case "major":
      return root ?? "C"
    case "minor":
      return `${root}m`
    case "dim":
      return `${root}dim`
    case "dom7":
      return `${root}7`
    case "min7":
      return `${root}m7`
  }
}

function collectTrackNotes(track: alphaTab.model.Track, score: Score): NoteEvent[] {
  const notes: NoteEvent[] = []

  for (const staff of track.staves) {
    for (let barIdx = 0; barIdx < staff.bars.length; barIdx++) {
      const bar = staff.bars[barIdx]
      const masterBar = score.masterBars[barIdx]
      if (!bar || !masterBar) continue

      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          const beatTick = masterBar.start + beat.playbackStart
          const beatDuration = beat.playbackDuration

          for (const note of beat.notes) {
            if (note.isTieDestination) continue
            notes.push({
              tick: beatTick,
              pitch: note.realValue,
              duration: beatDuration,
            })
          }
        }
      }
    }
  }

  return notes.sort((a, b) => a.tick - b.tick)
}

function scoreTrackForChords(notes: NoteEvent[], score: Score): number {
  if (notes.length === 0) return -10

  let trackScore = 0

  const tickGroups = new Map<number, number>()
  for (const note of notes) {
    tickGroups.set(note.tick, (tickGroups.get(note.tick) ?? 0) + 1)
  }

  let chordalTicks = 0
  let monophonicRuns = 0
  let prevCount = 0

  for (const count of tickGroups.values()) {
    if (count >= 3) chordalTicks++
    if (count === 1 && prevCount === 1) monophonicRuns++
    prevCount = count
  }

  const chordalRatio = chordalTicks / tickGroups.size
  if (chordalRatio > 0.3) trackScore += 2

  const beatTicks = new Set<number>()
  for (const masterBar of score.masterBars) {
    const ticksPerBeat = masterBar.calculateDuration() / masterBar.timeSignatureNumerator
    for (let i = 0; i < masterBar.timeSignatureNumerator; i++) {
      beatTicks.add(masterBar.start + i * ticksPerBeat)
    }
  }

  let onBeatCount = 0
  for (const tick of tickGroups.keys()) {
    for (const beatTick of beatTicks) {
      if (Math.abs(tick - beatTick) < 60) {
        onBeatCount++
        break
      }
    }
  }

  const onBeatRatio = onBeatCount / tickGroups.size
  if (onBeatRatio > 0.5) trackScore += 1

  const monophonicRatio = monophonicRuns / tickGroups.size
  if (monophonicRatio > 0.5) trackScore -= 2

  return trackScore
}

function estimateChordEventCount(notes: NoteEvent[]): number {
  const tickGroups = new Map<number, number>()
  for (const note of notes) {
    tickGroups.set(note.tick, (tickGroups.get(note.tick) ?? 0) + 1)
  }

  let count = 0
  for (const noteCount of tickGroups.values()) {
    if (noteCount >= 3) count++
  }
  return count
}

function buildMeasureWindows(score: Score, notes: NoteEvent[]): MeasureWindow[] {
  const windows: MeasureWindow[] = []

  for (let i = 0; i < score.masterBars.length; i++) {
    const masterBar = score.masterBars[i]
    if (!masterBar) continue

    const startTick = masterBar.start
    const endTick = startTick + masterBar.calculateDuration()

    const windowNotes = notes.filter(n => n.tick >= startTick && n.tick < endTick)

    windows.push({ startTick, endTick, notes: windowNotes })
  }

  return windows
}

/**
 * Build beat-based windows for more granular chord detection.
 * Each beat in each measure becomes its own window.
 */
function buildBeatWindows(score: Score, notes: NoteEvent[]): MeasureWindow[] {
  const windows: MeasureWindow[] = []

  for (const masterBar of score.masterBars) {
    const measureStart = masterBar.start
    const measureDuration = masterBar.calculateDuration()
    const beatsInMeasure = masterBar.timeSignatureNumerator
    const ticksPerBeat = measureDuration / beatsInMeasure

    for (let beat = 0; beat < beatsInMeasure; beat++) {
      const startTick = measureStart + beat * ticksPerBeat
      const endTick = startTick + ticksPerBeat
      const windowNotes = notes.filter(n => n.tick >= startTick && n.tick < endTick)

      if (windowNotes.length > 0) {
        windows.push({ startTick, endTick, notes: windowNotes })
      }
    }
  }

  return windows
}

function buildPitchClassHistogram(notes: NoteEvent[]): number[] {
  const hist = Array<number>(12).fill(0)

  for (const note of notes) {
    const pc = note.pitch % 12
    const weight = Math.sqrt(note.duration / 960)
    hist[pc] = (hist[pc] ?? 0) + weight
  }

  return hist
}

function findBassPitchClass(notes: NoteEvent[]): number {
  if (notes.length === 0) return 0

  let lowestPitch = Number.POSITIVE_INFINITY
  let bassPc = 0

  for (const note of notes) {
    if (note.pitch < lowestPitch) {
      lowestPitch = note.pitch
      bassPc = note.pitch % 12
    }
  }

  return bassPc
}

function findBestChord(hist: number[], bassPc: number): ChordCandidate | null {
  let bestCandidate: ChordCandidate | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const [quality, template] of Object.entries(CHORD_TEMPLATES) as Array<
      [ChordQuality, Set<number>]
    >) {
      const transposed = new Set([...template].map(interval => (rootPc + interval) % 12))

      let inScore = 0
      let outScore = 0

      for (let pc = 0; pc < 12; pc++) {
        const weight = hist[pc] ?? 0
        if (transposed.has(pc)) {
          inScore += weight
        } else {
          outScore += weight
        }
      }

      let score = inScore - 0.4 * outScore

      if (bassPc === rootPc) {
        score += 0.8
      } else if (transposed.has(bassPc)) {
        score += 0.4
      }

      if (quality === "dom7" || quality === "min7") {
        score -= 0.5
      }

      if (score > bestScore) {
        bestScore = score
        bestCandidate = { rootPc, quality, score }
      }
    }
  }

  return bestCandidate
}
