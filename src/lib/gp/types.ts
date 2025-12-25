/**
 * Guitar Pro timing types for LRC enhancement system.
 */

/** Pulses per quarter note (alphaTab standard) */
export const PPQ = 960

/** A tempo change event at a specific tick position */
export interface TempoEvent {
  /** MIDI tick position */
  tick: number
  /** Beats per minute */
  bpm: number
}

/** A lyric syllable extracted from Guitar Pro */
export interface LyricSyllable {
  /** MIDI tick position */
  tick: number
  /** Syllable text (may end with "-" for continuation) */
  text: string
  /** True if shares beat with previous syllable */
  sameBeat: boolean
}

/** Extracted lyrics data from a Guitar Pro file */
export interface ExtractedLyrics {
  meta: {
    title: string
    artist: string
    album?: string | undefined
  }
  tempo: TempoEvent[]
  syllables: LyricSyllable[]
  durationMs: number
  bpm: number
  keySignature: string | null
  tuning: string | null
}

/** Word with absolute timing in milliseconds */
export interface WordTiming {
  startMs: number
  text: string
}
