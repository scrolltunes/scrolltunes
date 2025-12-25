// Types
export type {
  SongsterrSearchResult,
  ChordProLine,
  ChordProDocument,
  ChordData,
  ChordProElement,
  ChordProEntry,
  RawChordProDocument,
  PositionedChord,
  SongsterrChordLine,
  SongsterrChordData,
} from "./songsterr-types"

export {
  SongsterrError,
  SongsterrNotFoundError,
  SongsterrParseError,
} from "./songsterr-types"

// Client functions
export {
  searchSongs,
  searchSongsAsync,
  getRawChordProData,
  getChordData,
  getChordDataAsync,
} from "./songsterr-client"

// Parser functions
export {
  parseChordProDocument,
  formatChordName,
  extractLineText,
  extractLineChords,
} from "./chord-parser"

// Matcher functions
export type { LyricLineWithChords, LyricChordPosition } from "./lyrics-matcher"

export {
  matchChordsToLyrics,
  calculateSimilarity,
  normalizeText,
  findBestMatch,
} from "./lyrics-matcher"

// Transpose functions
export { transposeChord, transposeChordLine } from "./transpose"

// Merge functions
export type { MergedChordResult } from "./merge-chords"

export {
  mergeChordSources,
  findBaselineChordsForLine,
  estimateChordTimeFromCharIndex,
} from "./merge-chords"
