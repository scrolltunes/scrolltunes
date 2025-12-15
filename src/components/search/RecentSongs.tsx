"use client"

import { useRecentSongs } from "@/core"
import { makeCanonicalPath } from "@/lib/slug"
import { ClockCounterClockwise, MusicNote } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { memo, useCallback } from "react"

export interface RecentSongsProps {
  readonly className?: string
}

export const RecentSongs = memo(function RecentSongs({ className = "" }: RecentSongsProps) {
  const recents = useRecentSongs()
  const router = useRouter()

  const handleClick = useCallback(
    (song: { id: number; title: string; artist: string }) => {
      const path = makeCanonicalPath({ id: song.id, title: song.title, artist: song.artist })
      router.push(path)
    },
    [router],
  )

  if (recents.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-neutral-400 mb-3">
        <ClockCounterClockwise size={16} weight="bold" />
        <span className="text-sm font-medium">Recently played</span>
      </div>

      <ul className="space-y-2" aria-label="Recently played songs">
        {recents.map(song => {
          return (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => handleClick(song)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors text-left"
                aria-label={`${song.title} by ${song.artist}`}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
                  {song.albumArt ? (
                    <img src={song.albumArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MusicNote size={20} weight="fill" className="text-neutral-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{song.title}</p>
                  <p className="text-sm text-neutral-500 truncate">{song.artist}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
