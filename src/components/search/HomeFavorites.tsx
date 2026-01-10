"use client"

import { useFavorites } from "@/core"
import { makeCanonicalPath } from "@/lib/slug"
import { Heart, MusicNote } from "@phosphor-icons/react"
import Link from "next/link"
import { memo } from "react"

export interface HomeFavoritesProps {
  readonly className?: string
}

export const HomeFavorites = memo(function HomeFavorites({ className = "" }: HomeFavoritesProps) {
  const favorites = useFavorites()

  // Only show first 4 favorites on homepage
  const displayFavorites = favorites.slice(0, 4)

  if (favorites.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 h-6">
        <div className="flex items-center gap-2" style={{ color: "var(--color-text3)" }}>
          <Heart size={16} weight="fill" style={{ color: "var(--color-favorite)" }} />
          <span className="text-sm font-medium uppercase tracking-wider">Favorites</span>
        </div>
        {favorites.length > 4 && (
          <Link
            href="/favorites"
            className="text-sm transition-colors hover:brightness-125"
            style={{ color: "var(--color-text-muted)" }}
          >
            See all
          </Link>
        )}
      </div>

      <ul className="space-y-2" aria-label="Favorite songs">
        {displayFavorites.map(song => {
          const songPath = makeCanonicalPath({
            id: song.id,
            title: song.title,
            artist: song.artist,
          })
          return (
            <li key={song.id}>
              <Link
                href={songPath}
                className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:brightness-105"
                style={{
                  background: "var(--color-surface1)",
                  border: "1px solid var(--color-border)",
                }}
                aria-label={`${song.title} by ${song.artist}`}
              >
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center"
                  style={{ background: "var(--color-surface2)" }}
                >
                  {song.albumArt ? (
                    <img src={song.albumArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MusicNote
                      size={20}
                      weight="fill"
                      style={{ color: "var(--color-text-muted)" }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
                    {song.title}
                  </p>
                  <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
                    {song.artist}
                  </p>
                </div>
                <Heart
                  size={18}
                  weight="fill"
                  style={{ color: "var(--color-favorite)" }}
                  className="flex-shrink-0"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
})
