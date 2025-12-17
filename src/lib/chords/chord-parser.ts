/**
 * Chord parser module
 *
 * Transforms raw ChordPro documents from Songsterr into a simplified structure
 * suitable for display in the lyrics view.
 */

import type {
  ChordData,
  ChordProElement,
  ChordProEntry,
  RawChordProDocument,
  SongsterrChordData,
  SongsterrChordLine,
} from "./songsterr-types"

/**
 * Convert ChordData to a human-readable chord name string
 *
 * @param chord - The chord data from Songsterr
 * @returns Formatted chord name (e.g., "Am", "G7", "Cmaj7", "D/F#")
 */
export function formatChordName(chord: ChordData): string {
  const baseName = chord.baseNote.name
  const suffix = chord.chordType.suffix
  const base = `${baseName}${suffix}`

  if (chord.firstNote.name !== chord.baseNote.name) {
    return `${base}/${chord.firstNote.name}`
  }

  return base
}

/**
 * Extract the text content from a line's elements
 *
 * @param elements - Array of ChordPro elements (text and chord)
 * @returns The joined text content, trimmed
 */
export function extractLineText(elements: ChordProElement[]): string {
  return elements
    .filter((el): el is { type: "text"; text: string } => el.type === "text")
    .map(el => el.text)
    .join("")
    .trim()
}

/**
 * Extract chord names from a line's elements
 *
 * @param elements - Array of ChordPro elements (text and chord)
 * @returns Array of formatted chord names
 */
export function extractLineChords(elements: ChordProElement[]): string[] {
  return elements
    .filter((el): el is { type: "chord"; chord: ChordData } => el.type === "chord")
    .map(el => formatChordName(el.chord))
}

/**
 * Parse a ChordPro document into simplified chord data
 *
 * @param doc - The raw ChordPro document from Songsterr
 * @param songId - The Songsterr song ID
 * @param artist - The artist name
 * @param title - The song title
 * @returns Simplified chord data structure
 */
export function parseChordProDocument(
  doc: RawChordProDocument,
  songId: number,
  artist: string,
  title: string,
): SongsterrChordData {
  let capo: number | undefined
  let tuning: string | undefined
  const lines: SongsterrChordLine[] = []

  for (const entry of doc) {
    switch (entry.type) {
      case "capo": {
        const parsed = Number.parseInt(entry.text, 10)
        if (!Number.isNaN(parsed)) {
          capo = parsed
        }
        break
      }
      case "tuning":
        tuning = entry.text
        break
      case "line":
        processLineEntry(entry, lines)
        break
    }
  }

  return {
    songId,
    artist,
    title,
    ...(capo !== undefined && { capo }),
    ...(tuning !== undefined && { tuning }),
    lines,
  }
}

/**
 * Process a line entry and add to lines array if not empty
 */
function processLineEntry(
  entry: Extract<ChordProEntry, { type: "line" }>,
  lines: SongsterrChordLine[],
): void {
  // Use only entry.line - blocks contains duplicate content
  const allElements = entry.line
  const text = extractLineText(allElements)

  if (text.length === 0) {
    return
  }

  const chords = extractLineChords(allElements)
  lines.push({ text, chords })
}
