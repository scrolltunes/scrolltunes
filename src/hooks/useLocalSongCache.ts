"use client"

import { useFavorites, useRecentSongs, useSetlists } from "@/core"
import { loadCachedLyrics } from "@/lib/lyrics-cache"
import { useMemo } from "react"

export interface LocalCachedSong {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album?: string | undefined
  readonly albumArt?: string | undefined
  readonly durationMs: number
  readonly source: "favorite" | "setlist" | "recent"
}

export function useLocalSongCache(): readonly LocalCachedSong[] {
  const favorites = useFavorites()
  const setlists = useSetlists()
  const recentSongs = useRecentSongs()

  return useMemo(() => {
    const seen = new Set<number>()
    const result: LocalCachedSong[] = []

    for (const fav of favorites) {
      if (!seen.has(fav.id)) {
        seen.add(fav.id)
        const cached = loadCachedLyrics(fav.id)
        const title = cached?.lyrics.title ?? fav.title
        const artist = cached?.lyrics.artist ?? fav.artist
        // Skip entries with missing title or artist
        if (!title || !artist) continue
        result.push({
          id: fav.id,
          title,
          artist,
          album: fav.album,
          albumArt: fav.albumArt ?? cached?.albumArt,
          durationMs: (cached?.lyrics.duration ?? 0) * 1000,
          source: "favorite",
        })
      }
    }

    for (const setlist of setlists) {
      if (setlist.songs) {
        for (const song of setlist.songs) {
          if (song.songProvider === "lrclib") {
            const numericId = Number(song.songId)
            if (!seen.has(numericId)) {
              seen.add(numericId)
              const cached = loadCachedLyrics(numericId)
              const title = cached?.lyrics.title ?? song.songTitle
              const artist = cached?.lyrics.artist ?? song.songArtist
              // Skip entries with missing title or artist
              if (!title || !artist) continue
              result.push({
                id: numericId,
                title,
                artist,
                albumArt: cached?.albumArt,
                durationMs: (cached?.lyrics.duration ?? 0) * 1000,
                source: "setlist",
              })
            }
          }
        }
      }
    }

    for (const recent of recentSongs) {
      if (!seen.has(recent.id)) {
        seen.add(recent.id)
        const cached = loadCachedLyrics(recent.id)
        const title = cached?.lyrics.title ?? recent.title
        const artist = cached?.lyrics.artist ?? recent.artist
        // Skip entries with missing title or artist
        if (!title || !artist) continue
        const durationSec = cached?.lyrics.duration ?? recent.durationSeconds
        result.push({
          id: recent.id,
          title,
          artist,
          album: recent.album,
          albumArt: recent.albumArt ?? cached?.albumArt,
          durationMs: (durationSec ?? 0) * 1000,
          source: "recent",
        })
      }
    }

    return result
  }, [favorites, setlists, recentSongs])
}
