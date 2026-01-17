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
      className="w-full flex items-center gap-3 p-4 rounded-xl transition-colors text-left relative overflow-hidden group hover:brightness-110"
      style={{ background: "var(--color-surface1)" }}
      aria-label={`${name}, ${songCount} ${songCount === 1 ? "song" : "songs"}`}
    >
      {color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: color }}
        />
      )}

      <div
        className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden"
        style={{
          background: "var(--color-surface2)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        {albumArts && albumArts.length > 0 ? (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px">
            {gridItems.map((art, i) => (
              <div key={i} style={{ background: "var(--color-surface3)" }}>
                {art ? (
                  <img src={art} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: "var(--color-surface3)" }} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MusicNotesSimple
              size={20}
              weight="fill"
              style={{ color: "var(--color-text-muted)" }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
          {name}
        </p>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
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
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:brightness-110"
          style={{ background: "var(--color-surface2)" }}
          aria-label="Edit setlist"
        >
          <PencilSimple size={16} style={{ color: "var(--color-text3)" }} />
        </div>
      )}
    </button>
  )
})
