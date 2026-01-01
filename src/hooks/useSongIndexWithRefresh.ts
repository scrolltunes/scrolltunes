"use client"

import { type SongIndexEntry, songIndexStore, useSongIndex, useSongIndexState } from "@/core"
import { useLocalSongCache } from "@/hooks/useLocalSongCache"
import { useEffect, useRef } from "react"

export function useSongIndexWithRefresh(): readonly SongIndexEntry[] {
  const indexState = useSongIndexState()
  const indexSongs = useSongIndex()
  const localCache = useLocalSongCache()
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    if (!indexState.isInitialized) return

    hasInitialized.current = true

    if (songIndexStore.shouldRefresh()) {
      songIndexStore.fetchIndex()
    }
  }, [indexState.isInitialized])

  useEffect(() => {
    if (localCache.length === 0) return
    if (!indexState.isInitialized) return

    const localEntries: SongIndexEntry[] = localCache.map(song => {
      const base: SongIndexEntry = {
        id: song.id,
        t: song.title.toLowerCase(),
        a: song.artist.toLowerCase(),
      }
      return {
        ...base,
        ...(song.album ? { al: song.album.toLowerCase() } : {}),
        ...(song.albumArt ? { art: song.albumArt } : {}),
        ...(song.durationMs ? { dur: Math.round(song.durationMs / 1000) } : {}),
      }
    })

    songIndexStore.mergeLocalEntries(localEntries)
  }, [localCache, indexState.isInitialized])

  return indexSongs
}

export function useSongIndexReady(): boolean {
  const state = useSongIndexState()
  return state.isInitialized && (state.index !== null || !state.isLoading)
}
