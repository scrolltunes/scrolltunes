const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

const CHORD_ROOT_REGEX = /^([A-G])([#b])?(.*)$/

function parseChordRoot(chord: string): { root: string; suffix: string } | null {
  const match = chord.match(CHORD_ROOT_REGEX)
  if (!match) return null

  const [, letter, accidental, suffix] = match
  if (!letter) return null

  const root = accidental ? `${letter}${accidental}` : letter
  return { root, suffix: suffix ?? "" }
}

function getNoteIndex(note: string): number {
  const sharpIndex = NOTES_SHARP.indexOf(note)
  if (sharpIndex !== -1) return sharpIndex

  const flatIndex = NOTES_FLAT.indexOf(note)
  if (flatIndex !== -1) return flatIndex

  return -1
}

function usesFlats(note: string): boolean {
  return note.includes("b")
}

function transposeNote(note: string, semitones: number, preferFlats = false): string {
  const index = getNoteIndex(note)
  if (index === -1) return note

  const newIndex = (((index + semitones) % 12) + 12) % 12
  const shouldUseFlats = preferFlats || usesFlats(note)

  const notes = shouldUseFlats ? NOTES_FLAT : NOTES_SHARP
  return notes[newIndex] ?? note
}

export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord

  const noChordMarkers = ["N.C.", "NC", "N/C", "n.c.", "nc"]
  if (noChordMarkers.includes(chord)) return chord

  if (chord.includes("/")) {
    const [mainChord, bassNote] = chord.split("/")
    if (!mainChord || !bassNote) return chord

    const transposedMain = transposeChord(mainChord, semitones)
    const bassRoot = parseChordRoot(bassNote)
    if (!bassRoot) return `${transposedMain}/${bassNote}`

    const transposedBass = transposeNote(bassRoot.root, semitones, usesFlats(bassRoot.root))
    return `${transposedMain}/${transposedBass}${bassRoot.suffix}`
  }

  const parsed = parseChordRoot(chord)
  if (!parsed) return chord

  const transposedRoot = transposeNote(parsed.root, semitones, usesFlats(parsed.root))
  return `${transposedRoot}${parsed.suffix}`
}

export function transposeChordLine(chords: readonly string[], semitones: number): string[] {
  return chords.map(c => transposeChord(c, semitones))
}
