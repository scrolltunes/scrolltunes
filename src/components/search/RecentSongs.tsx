"use client"

import { type RecentSong, recentSongsStore, useRecentSongs } from "@/core"
import { makeCanonicalPath } from "@/lib/slug"
import { ClockCounterClockwise, MusicNote, Play } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { memo, useCallback } from "react"

export interface RecentSongsProps {
  readonly className?: string
}

function formatTimeRemaining(position: number, duration: number): string {
  const remaining = Math.max(0, duration - position)
  const minutes = Math.floor(remaining / 60)
  const seconds = Math.floor(remaining % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")} remaining`
}

export const RecentSongs = memo(function RecentSongs({ className = "" }: RecentSongsProps) {
  const recents = useRecentSongs()
  const router = useRouter()

  const handleClick = useCallback(
    (song: RecentSong) => {
      const path = makeCanonicalPath({ id: song.id, title: song.title, artist: song.artist })
      const hasValidPosition = recentSongsStore.isPositionValidForResume(song)
      router.push(hasValidPosition ? `${path}?resume=1` : path)
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
          const hasValidPosition = recentSongsStore.isPositionValidForResume(song)

          return (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => handleClick(song)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 transition-colors text-left"
                aria-label={`${song.title} by ${song.artist}${hasValidPosition ? ", has resume position" : ""}`}
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
                  <p className="text-sm text-neutral-500 truncate">
                    {song.artist}
                    {hasValidPosition && song.lastPositionSeconds !== undefined && (
                      <span className="text-indigo-400 ml-2">
                        • {formatTimeRemaining(song.lastPositionSeconds, song.durationSeconds)}
                      </span>
                    )}
                  </p>
                </div>

                {hasValidPosition && (
                  <div className="flex-shrink-0 text-indigo-400">
                    <Play size={16} weight="fill" />
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
