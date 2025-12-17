/**
 * Songsterr API types
 */

import { Data } from "effect"

export class SongsterrError extends Data.TaggedError("SongsterrError")<{
  readonly status: number
  readonly message: string
}> {}

export class SongsterrNotFoundError extends Data.TaggedError("SongsterrNotFoundError")<{
  readonly songId: number
  readonly artist: string
  readonly title: string
}> {}

export class SongsterrParseError extends Data.TaggedError("SongsterrParseError")<{
  readonly message: string
}> {}

export interface SongsterrSearchResult {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly hasChords: boolean
}

export interface ChordProLine {
  readonly type: "lyrics" | "chord" | "section" | "comment"
  readonly content: string
  readonly chord?: string | undefined
}

export interface ChordProDocument {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly lines: readonly ChordProLine[]
}

/**
 * Raw ChordPro types from Songsterr's HTML state
 */

export interface ChordData {
  readonly baseNote: { readonly name: string }
  readonly firstNote: { readonly name: string }
  readonly chordType: { readonly suffix: string }
}

export type ChordProElement =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "chord"; readonly chord: ChordData }
  | { readonly type: "noise"; readonly text: string }
  | { readonly type: string; readonly text?: string; readonly chord?: ChordData }

export type ChordProEntry =
  | { readonly type: "capo"; readonly text: string }
  | { readonly type: "tuning"; readonly text: string }
  | {
      readonly type: "line"
      readonly line: ChordProElement[]
      readonly blocks: ChordProElement[][]
    }

export type RawChordProDocument = ChordProEntry[]

export interface SongsterrChordLine {
  readonly text: string
  readonly chords: readonly string[]
}

export interface SongsterrChordData {
  readonly songId: number
  readonly artist: string
  readonly title: string
  readonly capo?: number
  readonly tuning?: string
  readonly lines: readonly SongsterrChordLine[]
}
