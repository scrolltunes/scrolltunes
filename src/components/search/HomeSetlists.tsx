"use client"

import { setlistsStore, useSetlists, useSetlistsLoading } from "@/core"
import { MusicNotesSimple, Queue } from "@phosphor-icons/react"
import Link from "next/link"
import { memo, useEffect } from "react"

export interface HomeSetlistsProps {
  readonly className?: string
}

export const HomeSetlists = memo(function HomeSetlists({ className = "" }: HomeSetlistsProps) {
  const setlists = useSetlists()
  const isLoading = useSetlistsLoading()

  // Fetch setlists on mount
  useEffect(() => {
    setlistsStore.fetchAll()
  }, [])

  // Only show first 3 setlists on homepage
  const displaySetlists = setlists.slice(0, 3)

  if (!isLoading && setlists.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 h-6">
        <div className="flex items-center gap-2" style={{ color: "var(--color-text3)" }}>
          <Queue size={16} weight="bold" />
          <span className="text-sm font-medium uppercase tracking-wider">Setlists</span>
        </div>
        {setlists.length > 0 && (
          <Link
            href="/setlists"
            className="text-sm transition-colors hover:brightness-125"
            style={{ color: "var(--color-text-muted)" }}
          >
            Manage
          </Link>
        )}
      </div>

      {isLoading && setlists.length === 0 ? (
        <div className="space-y-2" aria-label="Loading setlists">
          {[0, 1].map(i => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl animate-pulse"
              style={{ background: "var(--color-surface1)" }}
            >
              <div
                className="w-10 h-10 rounded-lg"
                style={{ background: "var(--color-surface2)" }}
              />
              <div className="flex-1 space-y-2">
                <div
                  className="h-4 w-32 rounded"
                  style={{ background: "var(--color-surface2)" }}
                />
                <div
                  className="h-3 w-20 rounded"
                  style={{ background: "var(--color-surface2)" }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : displaySetlists.length > 0 ? (
        <ul className="space-y-2" aria-label="Setlists">
          {displaySetlists.map(setlist => (
            <li key={setlist.id}>
              <Link
                href={`/setlists/${setlist.id}`}
                className="flex items-center gap-3 p-4 rounded-xl transition-colors hover:brightness-105 relative overflow-hidden"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                }}
                aria-label={`${setlist.name}, ${setlist.songCount} ${setlist.songCount === 1 ? "song" : "songs"}`}
              >
                {setlist.color && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: setlist.color }}
                  />
                )}
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center"
                  style={{ background: "var(--color-surface2)" }}
                >
                  <MusicNotesSimple size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                    {setlist.name}
                  </p>
                  <p className="text-sm" style={{ color: "var(--color-text3)" }}>
                    {setlist.songCount} {setlist.songCount === 1 ? "song" : "songs"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
})
