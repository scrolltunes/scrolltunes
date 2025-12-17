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
  PositionedChord,
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
  const allElements = entry.line

  let rawText = ""
  const chords: string[] = []
  const positionedChords: PositionedChord[] = []

  for (const el of allElements) {
    // Treat visible text and "noise" as part of the line text
    if (el.type === "text" || el.type === "noise") {
      rawText += el.text ?? ""
    } else if (el.type === "chord" && el.chord) {
      const name = formatChordName(el.chord)
      chords.push(name)

      // Position is "just before the next character we will append"
      const charIndexInRaw = rawText.length
      positionedChords.push({ name, charIndex: charIndexInRaw })
    }
    // ignore other element types
  }

  const leadingWsLen = rawText.length - rawText.trimStart().length
  const text = rawText.trim()
  if (text.length === 0) {
    return
  }

  // Adjust positions to account for trimmed leading whitespace
  const adjustedPositionedChords: PositionedChord[] = positionedChords.map(chord => {
    const adjustedIndex = Math.max(0, chord.charIndex - leadingWsLen)
    return {
      ...chord,
      charIndex: Math.min(text.length, adjustedIndex),
    }
  })

  lines.push({ text, chords, positionedChords: adjustedPositionedChords })
}
