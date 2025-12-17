declare module "@tombatossals/react-chords/lib/Chord" {
  import type { ComponentType } from "react"

  interface ChordPosition {
    frets: number[]
    fingers?: number[]
    barres?: number[]
    baseFret?: number
    capo?: boolean
  }

  interface InstrumentConfig {
    strings: number
    fretsOnChord: number
    name: string
    tunings: {
      standard: string[]
    }
  }

  interface ChordProps {
    chord: ChordPosition
    instrument: InstrumentConfig
    lite?: boolean
  }

  const Chord: ComponentType<ChordProps>
  export default Chord
}
