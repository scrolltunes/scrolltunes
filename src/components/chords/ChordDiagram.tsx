"use client"

import Chord from "@tombatossals/react-chords/lib/Chord"
import { memo, useMemo, useState } from "react"

import {
  type ChordPosition,
  getAllPositions,
  guitarInstrument,
  lookupChord,
} from "@/lib/chordDiagrams"

export interface ChordDiagramProps {
  readonly chord: string
  readonly size?: "sm" | "md" | "lg"
  readonly showPositionSelector?: boolean
}

const sizeConfig = {
  sm: "w-20",
  md: "w-28",
  lg: "w-40",
} as const

export const ChordDiagram = memo(function ChordDiagram({
  chord,
  size = "md",
  showPositionSelector = false,
}: ChordDiagramProps) {
  const [positionIndex, setPositionIndex] = useState(0)

  const chordData = useMemo(() => lookupChord(chord), [chord])
  const allPositions = useMemo(
    () => (showPositionSelector ? getAllPositions(chord) : []),
    [chord, showPositionSelector],
  )

  if (!chordData) {
    return (
      <div className={`${sizeConfig[size]} flex flex-col items-center justify-center text-center`}>
        <span className="text-2xl font-bold text-white">{chord}</span>
        <p className="mt-2 text-xs text-neutral-400">Diagram not available</p>
      </div>
    )
  }

  const currentPosition: ChordPosition =
    showPositionSelector && allPositions[positionIndex]
      ? allPositions[positionIndex]
      : chordData.chord

  return (
    <div className={`${sizeConfig[size]} flex flex-col items-center`}>
      <div className="w-full chord-diagram-svg">
        <Chord chord={currentPosition} instrument={guitarInstrument} lite={false} />
      </div>

      {showPositionSelector && allPositions.length > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPositionIndex(i => (i > 0 ? i - 1 : allPositions.length - 1))}
            className="h-6 w-6 rounded bg-neutral-700 text-sm text-white hover:bg-neutral-600"
            aria-label="Previous position"
          >
            ‹
          </button>
          <span className="text-xs text-neutral-400">
            {positionIndex + 1} / {allPositions.length}
          </span>
          <button
            type="button"
            onClick={() => setPositionIndex(i => (i < allPositions.length - 1 ? i + 1 : 0))}
            className="h-6 w-6 rounded bg-neutral-700 text-sm text-white hover:bg-neutral-600"
            aria-label="Next position"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
})
