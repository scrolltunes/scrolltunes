"use client"

import { MusicNotesSimple, PencilSimple } from "@phosphor-icons/react"
import { memo, useCallback } from "react"

export interface SetlistCardProps {
  readonly id: string
  readonly name: string
  readonly songCount: number
  readonly color?: string
  readonly albumArts?: readonly (string | undefined)[]
  readonly onClick?: () => void
  readonly onEdit?: () => void
}

export const SetlistCard = memo(function SetlistCard({
  name,
  songCount,
  color,
  albumArts,
  onClick,
  onEdit,
}: SetlistCardProps) {
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onEdit?.()
    },
    [onEdit],
  )

  const gridItems = [0, 1, 2, 3].map(i => albumArts?.[i])

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors text-left relative overflow-hidden group"
      aria-label={`${name}, ${songCount} ${songCount === 1 ? "song" : "songs"}`}
    >
      {color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 overflow-hidden">
        {albumArts && albumArts.length > 0 ? (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2">
            {gridItems.map((art, i) => (
              <div key={i} className="bg-neutral-700">
                {art ? (
                  <img src={art} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-neutral-700" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MusicNotesSimple size={20} weight="fill" className="text-neutral-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{name}</p>
        <p className="text-sm text-neutral-500">
          {songCount} {songCount === 1 ? "song" : "songs"}
        </p>
      </div>

      {onEdit && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleEditClick}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation()
              onEdit()
            }
          }}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Edit setlist"
        >
          <PencilSimple size={16} className="text-neutral-400" />
        </div>
      )}
    </button>
  )
})
