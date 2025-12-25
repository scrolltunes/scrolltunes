/**
 * GP Chord extraction types.
 *
 * NOTE: This module is client-only (imports alphaTab indirectly).
 */

import type { TempoEvent } from "./types"

/** Offset-based transform: shift all GP times by a fixed amount */
export interface TimeTransformOffset {
  readonly kind: "offset"
  readonly ms: number
}

/** Piecewise linear transform: interpolate between anchor points */
export interface TimeTransformPiecewise {
  readonly kind: "piecewise_linear"
  readonly anchors: ReadonlyArray<{ readonly gpMs: number; readonly lrcMs: number }>
}

export type TimeTransformV1 = TimeTransformOffset | TimeTransformPiecewise

/** Track suitability analysis for chord extraction */
export interface TrackAnalysis {
  readonly trackIndex: number
  readonly trackName: string
  readonly score: number
  readonly chordEventCount: number
  /** Number of explicit chord markers (beat.chord) in the track */
  readonly explicitChordCount: number
  readonly isPercussion: boolean
}

/** A chord event extracted from GP, in GP time */
export interface ChordEvent {
  readonly startMs: number
  readonly durationMs: number
  readonly chord: string
  readonly confidence: number
}

/** Result of chord extraction from a GP file */
export interface ExtractedChords {
  readonly meta: {
    readonly title: string
    readonly artist: string
  }
  readonly tracks: readonly TrackAnalysis[]
  readonly selectedTrackIndex: number
  readonly chords: readonly ChordEvent[]
  readonly tempo: readonly TempoEvent[]
  readonly durationMs: number
}

/** Track metadata for debugging/reproducibility */
export interface PayloadTrackInfo {
  readonly index: number
  readonly name: string
  readonly score: number
}

/** A chord within a line (relative timing) */
export interface LineChord {
  readonly start: number
  readonly dur?: number | undefined
  readonly chord: string
  readonly wordIdx?: number | undefined
}

/** A line with chord enhancements */
export interface EnhancedChordLine {
  readonly idx: number
  readonly chords: readonly LineChord[]
}

/** The payload stored in chord_enhancements.payload */
export interface ChordEnhancementPayloadV1 {
  readonly patchFormatVersion: "chords-json-v1"
  readonly algoVersion: string
  readonly timeTransform?: TimeTransformV1 | undefined
  readonly track?: PayloadTrackInfo | undefined
  readonly lines: readonly EnhancedChordLine[]
}

/** A chord positioned by time (used at runtime) */
export interface TimedChord {
  readonly absoluteMs: number
  readonly durationMs?: number | undefined
  readonly chord: string
  readonly source: "gp" | "songsterr"
}

/** A line with merged chords from both sources */
export interface MergedChordLine {
  readonly lineIndex: number
  readonly chords: readonly TimedChord[]
  readonly source: "gp" | "songsterr" | "none"
}
