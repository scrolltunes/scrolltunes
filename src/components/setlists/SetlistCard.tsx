"use client"

import { MusicNotesSimple } from "@phosphor-icons/react"
import { memo } from "react"

export interface SetlistCardProps {
  readonly id: string
  readonly name: string
  readonly songCount: number
  readonly color?: string
  readonly icon?: string
  readonly onClick?: () => void
}

export const SetlistCard = memo(function SetlistCard({
  name,
  songCount,
  color,
  onClick,
}: SetlistCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors text-left relative overflow-hidden"
      aria-label={`${name}, ${songCount} ${songCount === 1 ? "song" : "songs"}`}
    >
      {color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
        <MusicNotesSimple size={20} weight="fill" className="text-neutral-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{name}</p>
        <p className="text-sm text-neutral-500">
          {songCount} {songCount === 1 ? "song" : "songs"}
        </p>
      </div>
    </button>
  )
})
