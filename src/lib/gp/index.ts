/**
 * Guitar Pro parsing and LRC enhancement utilities.
 *
 * This module provides client-side parsing of Guitar Pro files using alphaTab,
 * extraction of lyrics with timing, and alignment with LRCLIB lyrics.
 *
 * NOTE: alphaTab is browser-only. Import this module only in client components.
 */

export { extractLyrics, parseGuitarProFile } from "./extract-lyrics"
export { buildWordTimings } from "./build-words"
export { alignWords, parseLrcToLines, patchesToPayload } from "./align-words"
export type { AlignmentResult, LrcLine, WordPatch } from "./align-words"
export { ticksToMsAtBpm, tickToMs } from "./timing"
export type { ExtractedLyrics, LyricSyllable, TempoEvent, WordTiming } from "./types"
export { PPQ } from "./types"
