import guitarDb from "@tombatossals/chords-db/lib/guitar.json"

export interface ChordPosition {
  frets: number[]
  fingers: number[]
  barres: number[]
  baseFret: number
  capo?: boolean
  midi: number[]
}

export interface ChordData {
  key: string
  suffix: string
  positions: ChordPosition[]
}

export interface InstrumentConfig {
  strings: number
  fretsOnChord: number
  name: string
  tunings: {
    standard: string[]
  }
}

export const guitarInstrument: InstrumentConfig = {
  strings: guitarDb.main.strings,
  fretsOnChord: guitarDb.main.fretsOnChord,
  name: guitarDb.main.name,
  tunings: {
    standard: ["E", "A", "D", "G", "B", "E"],
  },
}

const chordsByKey = guitarDb.chords as Record<string, ChordData[]>

function parseChordName(chordName: string): { key: string; suffix: string } | null {
  const match = chordName.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return null

  let key = match[1]
  let suffix = match[2]
  if (!key) return null
  if (suffix === undefined) suffix = ""

  if (key === "Db") key = "C#"
  else if (key === "D#") key = "Eb"
  else if (key === "Gb") key = "F#"
  else if (key === "G#") key = "Ab"
  else if (key === "A#") key = "Bb"

  if (suffix === "" || suffix === "M") {
    suffix = "major"
  } else if (suffix === "m" || suffix === "min") {
    suffix = "minor"
  } else if (suffix === "7sus2") {
    suffix = "sus2"
  } else if (suffix === "dim" || suffix === "°" || suffix === "o") {
    suffix = "dim"
  } else if (suffix === "aug" || suffix === "+") {
    suffix = "aug"
  } else if (suffix === "M7" || suffix === "Maj7" || suffix === "Δ7" || suffix === "Δ") {
    suffix = "maj7"
  } else if (suffix === "M9" || suffix === "Maj9") {
    suffix = "maj9"
  } else if (suffix === "m7" || suffix === "min7" || suffix === "-7") {
    suffix = "m7"
  } else if (suffix === "m9" || suffix === "min9") {
    suffix = "m9"
  } else if (suffix === "m6" || suffix === "min6") {
    suffix = "m6"
  } else if (suffix === "m11" || suffix === "min11") {
    suffix = "m11"
  } else if (
    suffix === "mM7" ||
    suffix === "minMaj7" ||
    suffix === "m(M7)" ||
    suffix === "m(maj7)"
  ) {
    suffix = "mmaj7"
  } else if (suffix === "sus" || suffix === "4") {
    suffix = "sus4"
  } else if (suffix === "2") {
    suffix = "sus2"
  } else if (suffix === "7#9" || suffix === "7(#9)") {
    suffix = "7#9"
  } else if (suffix === "7b9" || suffix === "7(b9)") {
    suffix = "7b9"
  } else if (suffix === "7b5" || suffix === "7(b5)") {
    suffix = "7b5"
  } else if (suffix === "9#11" || suffix === "9(#11)") {
    suffix = "9#11"
  } else if (suffix === "maj7#5" || suffix === "M7#5" || suffix === "Maj7(#5)") {
    suffix = "maj7#5"
  } else if (suffix === "maj7b5" || suffix === "M7b5" || suffix === "Maj7(b5)") {
    suffix = "maj7b5"
  } else if (suffix === "7alt" || suffix === "alt") {
    suffix = "alt"
  } else if (suffix === "add9" || suffix === "(add9)" || suffix === "add2") {
    suffix = "add9"
  } else if (suffix === "madd9" || suffix === "m(add9)" || suffix === "madd2") {
    suffix = "madd9"
  }

  return { key, suffix }
}

export function lookupChord(chordName: string): { chord: ChordPosition; data: ChordData } | null {
  const parsed = parseChordName(chordName)
  if (!parsed) return null

  const { key, suffix } = parsed
  const keyChords = chordsByKey[key]
  if (!keyChords) return null

  const chordData = keyChords.find(c => c.suffix === suffix)
  if (!chordData || chordData.positions.length === 0) return null

  return {
    chord: chordData.positions[0] as ChordPosition,
    data: chordData,
  }
}

export function getAllPositions(chordName: string): ChordPosition[] {
  const parsed = parseChordName(chordName)
  if (!parsed) return []

  const { key, suffix } = parsed
  const keyChords = chordsByKey[key]
  if (!keyChords) return []

  const chordData = keyChords.find(c => c.suffix === suffix)
  if (!chordData) return []

  return chordData.positions as ChordPosition[]
}

export function isChordSupported(chordName: string): boolean {
  return lookupChord(chordName) !== null
}
