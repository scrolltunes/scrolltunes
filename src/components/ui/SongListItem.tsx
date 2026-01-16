"use client"

import { springs } from "@/animations"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { makeCanonicalPath } from "@/lib/slug"
import { MusicNote, X } from "@phosphor-icons/react"
import { motion } from "motion/react"
import Link from "next/link"
import { memo, useEffect, useState } from "react"
import { FavoriteButton } from "./FavoriteButton"
import { AlbumArtSkeleton } from "./Skeleton"

export interface SongListItemProps {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album?: string | undefined
  readonly albumArt?: string | undefined
  readonly showFavorite?: boolean
  readonly showRemove?: boolean
  readonly onRemove?: (id: number, albumArt: string | undefined) => void
  readonly isLoadingAlbumArt?: boolean
  readonly renderAction?: (props: { albumArt: string | undefined }) => React.ReactNode
  readonly animationIndex?: number
  readonly animateExit?: boolean
}

export const SongListItem = memo(function SongListItem({
  id,
  title,
  artist,
  album,
  albumArt: initialAlbumArt,
  showFavorite = false,
  showRemove = false,
  onRemove,
  isLoadingAlbumArt: externalLoadingAlbumArt,
  renderAction,
  animationIndex,
  animateExit = false,
}: SongListItemProps) {
  const [albumArt, setAlbumArt] = useState<string | undefined>(initialAlbumArt)
  const [isLoading, setIsLoading] = useState(!initialAlbumArt && externalLoadingAlbumArt !== false)
  const [displayTitle, setDisplayTitle] = useState(title)
  const [displayArtist, setDisplayArtist] = useState(artist)
  const [displayAlbum, setDisplayAlbum] = useState(album)

  useEffect(() => {
    // Always try to load cached normalized titles
    const cached = loadCachedLyrics(id)
    if (cached) {
      if (cached.lyrics.title) setDisplayTitle(cached.lyrics.title)
      if (cached.lyrics.artist) setDisplayArtist(cached.lyrics.artist)
      if (cached.lyrics.album) setDisplayAlbum(cached.lyrics.album)
      if (cached.albumArt) setAlbumArt(cached.albumArt)
    }

    // If album art is provided externally or loading is managed externally, don't fetch
    if (initialAlbumArt) {
      setAlbumArt(initialAlbumArt)
      setIsLoading(false)
      return
    }

    if (externalLoadingAlbumArt !== undefined) {
      setIsLoading(externalLoadingAlbumArt)
      // Still fetch for title normalization if no cache
      if (cached) return
    }

    if (cached?.albumArt) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    fetch(`/api/lyrics/${id}`)
      .then(async response => {
        if (!response.ok || cancelled) {
          if (!cancelled) setIsLoading(false)
          return
        }

        const data = await response.json()
        if (cancelled) return

        const art = data.albumArt as string | undefined

        if (data.lyrics) {
          saveCachedLyrics(id, {
            lyrics: data.lyrics,
            bpm: data.bpm ?? null,
            key: data.key ?? null,
            albumArt: art,
            spotifyId: data.spotifyId ?? undefined,
            bpmSource: data.attribution?.bpm ?? undefined,
            lyricsSource: data.attribution?.lyrics ?? undefined,
          })
          if (data.lyrics.title) setDisplayTitle(data.lyrics.title)
          if (data.lyrics.artist) setDisplayArtist(data.lyrics.artist)
          if (data.lyrics.album) setDisplayAlbum(data.lyrics.album)
        }

        setAlbumArt(art)
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [id, initialAlbumArt, externalLoadingAlbumArt])

  const songPath = makeCanonicalPath({ id, title, artist })

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onRemove?.(id, albumArt)
  }

  const content = (
    <>
      <Link
        href={songPath}
        className="flex items-center gap-3 flex-1 min-w-0"
        aria-label={`${displayTitle} by ${displayArtist}`}
      >
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
          style={{ background: "var(--color-surface2)" }}
        >
          {isLoading ? (
            <AlbumArtSkeleton />
          ) : albumArt ? (
            <img src={albumArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <MusicNote size={20} weight="fill" style={{ color: "var(--color-text-muted)" }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" style={{ color: "var(--color-text)" }}>
            {displayTitle}
          </p>
          <p className="text-sm truncate" style={{ color: "var(--color-text3)" }}>
            {displayArtist}
            {displayAlbum && ` • ${displayAlbum}`}
          </p>
        </div>
      </Link>

      {(showFavorite || showRemove || renderAction) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {showFavorite && (
            <FavoriteButton
              songId={id}
              title={title}
              artist={artist}
              {...(album !== undefined && { album })}
              {...(albumArt !== undefined && { albumArt })}
              size="sm"
            />
          )}
          {showRemove && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="w-8 h-8 flex items-center justify-center rounded-sm transition-colors"
              style={{
                background: "var(--color-surface2)",
                color: "var(--color-text-muted)",
              }}
              aria-label="Remove"
            >
              <X size={16} />
            </button>
          )}
          {renderAction?.({ albumArt })}
        </div>
      )}
    </>
  )

  const cardStyle = {
    background: "var(--color-surface1)",
    border: "1px solid var(--color-border)",
  }

  if (animationIndex !== undefined) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        {...(animateExit && { exit: { opacity: 0, x: -100, transition: { duration: 0.2 } } })}
        transition={{ ...springs.default, delay: animationIndex * 0.03 }}
        className="w-full flex items-center gap-3 p-3 rounded-sm transition-colors hover:brightness-105"
        style={cardStyle}
      >
        {content}
      </motion.div>
    )
  }

  return (
    <div
      className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors hover:brightness-105"
      style={cardStyle}
    >
      {content}
    </div>
  )
})
