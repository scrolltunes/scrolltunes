"use client"

import { useFavorites, useRecentSongs, useSetlists } from "@/core"
import { getAllCachedLyrics, loadCachedLyrics } from "@/lib/lyrics-cache"
import { runRefreshMissingAlbums } from "@/services/lyrics-prefetch"
import { useEffect, useMemo, useRef, useState } from "react"

export interface LocalCachedSong {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album?: string | undefined
  readonly albumArt?: string | undefined
  readonly durationMs: number
  readonly source: "favorite" | "setlist" | "recent" | "prefetched"
}

export function useLocalSongCache(): readonly LocalCachedSong[] {
  const favorites = useFavorites()
  const setlists = useSetlists()
  const recentSongs = useRecentSongs()
  const [prefetchedVersion, setPrefetchedVersion] = useState(0)
  const refreshedIdsRef = useRef(new Set<number>())

  // Re-scan prefetched cache periodically to pick up background fetches
  useEffect(() => {
    const interval = setInterval(() => {
      setPrefetchedVersion(v => v + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const songs = useMemo(() => {
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

    // Include all prefetched songs from localStorage cache
    // This makes background-prefetched top songs searchable immediately
    const allCached = getAllCachedLyrics()
    for (const { id, cached } of allCached) {
      if (!seen.has(id)) {
        seen.add(id)
        const { lyrics, albumArt } = cached
        // Skip entries with missing title or artist
        if (!lyrics.title || !lyrics.artist) continue
        result.push({
          id,
          title: lyrics.title,
          artist: lyrics.artist,
          album: lyrics.album,
          albumArt,
          durationMs: (lyrics.duration ?? 0) * 1000,
          source: "prefetched",
        })
      }
    }

    return result
  }, [favorites, setlists, recentSongs, prefetchedVersion])

  // Trigger background refresh for songs missing album info
  useEffect(() => {
    const allCached = getAllCachedLyrics()
    const songsNeedingAlbum = allCached
      .filter(({ id, cached }) => {
        // Skip if already refreshed this session
        if (refreshedIdsRef.current.has(id)) return false
        // Check if album is missing
        const album = cached.lyrics.album
        return !album || album.trim() === ""
      })
      .map(({ id, cached }) => ({ id, album: cached.lyrics.album }))

    if (songsNeedingAlbum.length > 0) {
      // Mark as refreshed to avoid repeated attempts
      for (const { id } of songsNeedingAlbum) {
        refreshedIdsRef.current.add(id)
      }
      // Trigger background refresh (fire and forget)
      runRefreshMissingAlbums(songsNeedingAlbum)
    }
  }, [prefetchedVersion])

  return songs
}
