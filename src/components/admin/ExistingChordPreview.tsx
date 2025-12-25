"use client"

import { parseLrcToLines } from "@/lib/gp/align-words"
import type { ChordEnhancementPayloadV1 } from "@/lib/gp/chord-types"
import { MusicNotes } from "@phosphor-icons/react"
import { useMemo } from "react"

interface ExistingChordPreviewProps {
  readonly lrcContent: string
  readonly payload: ChordEnhancementPayloadV1
}

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

export function ExistingChordPreview({ lrcContent, payload }: ExistingChordPreviewProps) {
  const lrcLines = useMemo(() => parseLrcToLines(lrcContent), [lrcContent])

  const chordLineMap = useMemo(() => {
    const map = new Map<number, (typeof payload.lines)[number]>()
    for (const line of payload.lines) {
      map.set(line.idx, line)
    }
    return map
  }, [payload.lines])

  const linesWithChords = payload.lines.length
  const totalChords = payload.lines.reduce((sum, line) => sum + line.chords.length, 0)

  return (
    <div className="rounded-xl bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Chord Preview</h3>
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <span>{linesWithChords} lines with chords</span>
          <span>{totalChords} total chord events</span>
        </div>
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-sm">
        {lrcLines.map((line, lineIdx) => {
          const enhanced = chordLineMap.get(lineIdx)
          const chordCount = enhanced?.chords.length ?? 0
          const lineText = line.words.join(" ") || "(instrumental)"

          const bgColor = chordCount > 0 ? "bg-emerald-900/20" : "bg-neutral-800/30"

          return (
            <div key={lineIdx} className={`flex items-start gap-3 py-1.5 px-2 rounded ${bgColor}`}>
              <span className="text-neutral-500 flex-shrink-0 w-16">
                [{formatTime(line.startMs)}]
              </span>
              <div className="flex-1">
                <div className="text-neutral-200">{lineText}</div>
                {enhanced && enhanced.chords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {enhanced.chords.map((chord, chordIdx) => (
                      <span
                        key={chordIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-900/50 border border-indigo-700/50 rounded text-xs text-indigo-300"
                      >
                        <MusicNotes size={12} />
                        {chord.chord}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
