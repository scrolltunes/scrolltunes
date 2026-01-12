"use client"

import { applyEnhancement } from "@/lib/enhancement"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { MAX_RECENT_SONGS, type RecentSong } from "@/lib/recent-songs-types"
import { recentSongToHistorySyncItem, syncHistory } from "@/lib/sync-service"
import { userApi } from "@/lib/user-api"
import { runPrefetchSongs } from "@/services/lyrics-prefetch"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// ============================================================================
// RecentSongs Errors
// ============================================================================

/**
 * Error during album art fetch operations
 */
export class RecentSongsError extends Data.TaggedClass("RecentSongsError")<{
  readonly operation: string
  readonly songId: number
  readonly cause?: unknown
}> {}

const STORAGE_KEY = "scrolltunes:recents"

interface RecentSongsState {
  readonly recents: readonly RecentSong[]
  readonly isLoading: boolean
  readonly isInitialized: boolean
  readonly expectedCount: number | null
  readonly loadingAlbumArtIds: ReadonlySet<number>
}

const EMPTY_STATE: RecentSongsState = {
  recents: [],
  isLoading: false,
  isInitialized: false,
  expectedCount: null,
  loadingAlbumArtIds: new Set(),
}

class RecentSongsStore {
  private listeners = new Set<() => void>()
  private state: RecentSongsState = { ...EMPTY_STATE }
  private hadLocalCache = false

  constructor() {
    this.loadFromStorage()
  }

  hasLoadedFromCache(): boolean {
    return this.hadLocalCache
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): RecentSongsState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private updateState(partial: Partial<RecentSongsState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  setLoadingAlbumArt(id: number, loading: boolean): void {
    const current = this.state.loadingAlbumArtIds
    const next = new Set(current)
    if (loading) {
      next.add(id)
    } else {
      next.delete(id)
    }
    this.updateState({ loadingAlbumArtIds: next })
  }

  isLoadingAlbumArt(id: number): boolean {
    return this.state.loadingAlbumArtIds.has(id)
  }

  setSyncing(syncing: boolean): void {
    this.updateState({ isLoading: syncing })
  }

  setInitialized(initialized: boolean): void {
    this.updateState({ isInitialized: initialized })
  }

  setExpectedCount(count: number): void {
    this.updateState({ expectedCount: count })
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as readonly RecentSong[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          const recents = [...parsed]
            .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
            .slice(0, MAX_RECENT_SONGS)
          this.hadLocalCache = true
          this.state = { ...this.state, recents, isInitialized: true }
          return
        }
      }
      this.state = { ...this.state, isInitialized: true }
    } catch {
      this.state = { ...this.state, isInitialized: true }
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.recents))
    } catch {
      // Failed to save to localStorage
    }
  }

  private setRecents(updater: (prev: readonly RecentSong[]) => readonly RecentSong[]): void {
    this.updateState({ recents: updater(this.state.recents) })
    this.saveToStorage()
  }

  private syncToServer(song: RecentSong): void {
    const item = recentSongToHistorySyncItem(song)
    syncHistory([item])
  }

  /**
   * Add or update a song in recents (moves to top if exists)
   */
  upsertRecent(song: Omit<RecentSong, "lastPlayedAt"> & { lastPlayedAt?: number }): void {
    this.setRecents(prev => {
      const existing = prev.find(s => s.id === song.id)
      const filtered = prev.filter(s => s.id !== song.id)
      const newSong: RecentSong = {
        ...song,
        lastPlayedAt: song.lastPlayedAt ?? Date.now(),
        albumArt: song.albumArt ?? existing?.albumArt,
      }
      return [newSong, ...filtered].slice(0, MAX_RECENT_SONGS)
    })

    const fullSong = this.state.recents.find(s => s.id === song.id)
    if (fullSong) {
      this.syncToServer(fullSong)
    }
  }

  /**
   * Update song metadata without changing position in list.
   * Use this when loading a song page without actually playing it.
   * Adds new songs to the front if not already in list, and syncs to server.
   */
  updateMetadata(song: Omit<RecentSong, "lastPlayedAt">): void {
    const isNew = !this.state.recents.some(s => s.id === song.id)

    this.setRecents(prev => {
      const existingIndex = prev.findIndex(s => s.id === song.id)

      if (existingIndex >= 0) {
        const existing = prev[existingIndex]
        if (!existing) return prev
        const updated: RecentSong = {
          ...existing,
          ...song,
          album: song.album || existing.album,
          albumArt: song.albumArt ?? existing.albumArt,
        }
        return [...prev.slice(0, existingIndex), updated, ...prev.slice(existingIndex + 1)]
      }

      const newSong: RecentSong = {
        ...song,
        lastPlayedAt: Date.now(),
      }
      return [newSong, ...prev].slice(0, MAX_RECENT_SONGS)
    })

    if (isNew) {
      const fullSong = this.state.recents.find(s => s.id === song.id)
      if (fullSong) {
        this.syncToServer(fullSong)
      }
    }
  }

  /**
   * Update only album metadata for an existing recent song.
   * Does not change position or add new songs.
   */
  updateAlbumInfo(id: number, updates: { album?: string; albumArt?: string }): void {
    const exists = this.state.recents.some(s => s.id === id)
    if (!exists) return

    this.setRecents(prev =>
      prev.map(song => {
        if (song.id !== id) return song
        return {
          ...song,
          album: updates.album ?? song.album,
          albumArt: updates.albumArt ?? song.albumArt,
        }
      }),
    )
  }

  /**
   * Move an existing song to the top of the list (mark as played)
   */
  markAsPlayed(id: number): void {
    this.setRecents(prev => {
      const existing = prev.find(s => s.id === id)
      if (!existing) return prev

      const filtered = prev.filter(s => s.id !== id)
      const updated: RecentSong = {
        ...existing,
        lastPlayedAt: Date.now(),
      }
      return [updated, ...filtered]
    })

    const song = this.state.recents.find(s => s.id === id)
    if (song) {
      this.syncToServer(song)
    }
  }

  /**
   * Get a specific recent song by ID
   */
  getRecent(id: number): RecentSong | undefined {
    return this.state.recents.find(s => s.id === id)
  }

  /**
   * Clear all recent songs (local and server-side if authenticated)
   */
  clear(): void {
    userApi.delete("/api/user/history")
    this.setRecents(() => [])
  }

  /**
   * Remove a specific song from recents (local and server-side if authenticated)
   * Note: Does not remove cached lyrics - they remain available for search
   */
  remove(id: number): void {
    this.setRecents(prev => prev.filter(s => s.id !== id))
    userApi.delete("/api/user/history", { songId: `lrclib:${id}` })
  }

  syncAllToServer(): void {
    if (this.state.recents.length === 0) return
    const items = this.state.recents.map(recentSongToHistorySyncItem)
    syncHistory(items)
  }

  replaceFromServer(
    songs: Array<{
      songId: string
      songProvider: string
      title: string
      artist: string
      lastPlayedAt: string | null
      playCount: number
    }>,
  ): void {
    const songsNeedingAlbumArt: number[] = []

    const recentSongs: RecentSong[] = songs
      .map(s => {
        const numericId = Number.parseInt(s.songId.replace("lrclib:", ""), 10)
        if (Number.isNaN(numericId)) return null

        const cached = loadCachedLyrics(numericId)
        const albumArt = cached?.albumArt

        if (!albumArt) {
          songsNeedingAlbumArt.push(numericId)
        }

        const song: RecentSong = {
          id: numericId,
          title: s.title,
          artist: s.artist,
          album: "",
          albumArt,
          durationSeconds: cached?.lyrics.duration ?? 0,
          lastPlayedAt: s.lastPlayedAt ? new Date(s.lastPlayedAt).getTime() : Date.now(),
        }
        return song
      })
      .filter((s): s is RecentSong => s !== null)

    // Set loading state for songs needing album art BEFORE updating recents
    // This ensures the skeleton shows immediately, not after a flash of MusicNote icon
    const loadingIds = new Set(songsNeedingAlbumArt)
    this.updateState({
      recents: recentSongs.slice(0, MAX_RECENT_SONGS),
      loadingAlbumArtIds: loadingIds,
    })
    this.saveToStorage()

    if (songsNeedingAlbumArt.length > 0) {
      this.fetchAlbumArtInBackground(songsNeedingAlbumArt)
    }
  }

  /**
   * Preload catalog songs to cache their lyrics and enhancements.
   * Uses Effect-based prefetch service for proper DI and error handling.
   */
  preloadCatalogSongs(
    songs: Array<{ lrclibId: number; title: string; artist: string; album: string | null }>,
  ): void {
    const idsToFetch = songs.filter(s => !loadCachedLyrics(s.lrclibId)).map(s => s.lrclibId)

    if (idsToFetch.length > 0) {
      runPrefetchSongs(idsToFetch)
    }
  }

  private fetchAlbumArtForSong(id: number): Effect.Effect<void, RecentSongsError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(`/api/lyrics/${id}`),
        catch: cause => new RecentSongsError({ operation: "fetchLyrics", songId: id, cause }),
      })

      if (!response.ok) {
        this.setLoadingAlbumArt(id, false)
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<LyricsApiSuccessResponse>,
        catch: cause => new RecentSongsError({ operation: "parseLyrics", songId: id, cause }),
      })

      if (!data.lyrics) {
        this.setLoadingAlbumArt(id, false)
        return
      }

      const albumArt = data.albumArt ?? undefined

      // Fetch enhancements separately if available
      let enhancement = null
      let chordEnhancement = null
      if (data.hasEnhancement || data.hasChordEnhancement) {
        const enhResult = yield* Effect.tryPromise({
          try: () => fetch(`/api/lyrics/${id}/enhancements`),
          catch: () => null,
        }).pipe(
          Effect.flatMap(enhResponse => {
            if (!enhResponse || !enhResponse.ok) return Effect.succeed(null)
            return Effect.tryPromise({
              try: () => enhResponse.json(),
              catch: () => null,
            })
          }),
          Effect.catchAll(() => Effect.succeed(null)),
        )

        if (enhResult) {
          enhancement = enhResult.enhancement ?? null
          chordEnhancement = enhResult.chordEnhancement ?? null
        }
      }

      // Apply enhancement to lyrics if available before caching
      const enhancedLyrics = enhancement ? applyEnhancement(data.lyrics, enhancement) : data.lyrics

      saveCachedLyrics(id, {
        lyrics: enhancedLyrics,
        bpm: data.bpm ?? null,
        key: data.key ?? null,
        albumArt,
        spotifyId: data.spotifyId ?? undefined,
        bpmSource: data.attribution?.bpm ?? undefined,
        lyricsSource: data.attribution?.lyrics ?? undefined,
        hasEnhancement: data.hasEnhancement ?? undefined,
        enhancement: enhancement ?? undefined,
        hasChordEnhancement: data.hasChordEnhancement ?? undefined,
        chordEnhancement: chordEnhancement ?? undefined,
      })

      if (albumArt) {
        this.setRecents(prev =>
          prev.map(song =>
            song.id === id
              ? {
                  ...song,
                  albumArt,
                  durationSeconds: data.lyrics.duration ?? song.durationSeconds,
                }
              : song,
          ),
        )
      }
      this.setLoadingAlbumArt(id, false)
    })
  }

  private fetchAlbumArtInBackground(songIds: number[]): void {
    const effects = songIds.map(id =>
      this.fetchAlbumArtForSong(id).pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            this.setLoadingAlbumArt(id, false)
          }),
        ),
      ),
    )

    Effect.runFork(Effect.all(effects, { concurrency: 5 }))
  }
}

export const recentSongsStore = new RecentSongsStore()

export function useRecentSongsState(): RecentSongsState {
  return useSyncExternalStore(
    recentSongsStore.subscribe,
    recentSongsStore.getSnapshot,
    () => EMPTY_STATE,
  )
}

export function useRecentSongs(): readonly RecentSong[] {
  return useRecentSongsState().recents
}

export function useRecentSong(id: number): RecentSong | undefined {
  const recents = useRecentSongs()
  return recents.find(s => s.id === id)
}

export function useAlbumArtLoadingIds(): ReadonlySet<number> {
  return useRecentSongsState().loadingAlbumArtIds
}

export function useIsLoadingAlbumArt(id: number): boolean {
  return useRecentSongsState().loadingAlbumArtIds.has(id)
}

export function useIsRecentsLoading(): boolean {
  return useRecentSongsState().isLoading
}

export function useIsRecentsInitialized(): boolean {
  return useRecentSongsState().isInitialized
}

export function useExpectedRecentsCount(): number | null {
  return useRecentSongsState().expectedCount
}

export type { RecentSong, RecentSongsState }
