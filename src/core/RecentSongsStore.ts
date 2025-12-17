"use client"

import { loadCachedLyrics, removeCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { MAX_RECENT_SONGS, type RecentSong } from "@/lib/recent-songs-types"
import { recentSongToHistorySyncItem, syncHistory } from "@/lib/sync-service"
import { useSyncExternalStore } from "react"
import { accountStore } from "./AccountStore"

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

  private async syncToServer(song: RecentSong): Promise<void> {
    if (!accountStore.isAuthenticated()) {
      return
    }

    try {
      const item = recentSongToHistorySyncItem(song)
      await syncHistory([item])
      accountStore.setLastSyncAt(new Date())
    } catch {
      // Failed to sync song to server
    }
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
  async clear(): Promise<void> {
    if (accountStore.isAuthenticated()) {
      try {
        await fetch("/api/user/history", { method: "DELETE" })
      } catch {
        // Server delete failed, still clear localStorage
      }
    }
    this.setRecents(() => [])
  }

  /**
   * Remove a specific song from recents (local and server-side if authenticated)
   */
  async remove(id: number): Promise<void> {
    this.setRecents(prev => prev.filter(s => s.id !== id))
    removeCachedLyrics(id)

    if (accountStore.isAuthenticated()) {
      try {
        await fetch("/api/user/history", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songId: `lrclib:${id}` }),
        })
      } catch {
        // Server delete failed, already removed from localStorage
      }
    }
  }

  async syncAllToServer(): Promise<void> {
    if (!accountStore.isAuthenticated()) return
    if (this.state.recents.length === 0) return

    try {
      const items = this.state.recents.map(recentSongToHistorySyncItem)
      await syncHistory(items)
      accountStore.setLastSyncAt(new Date())
    } catch {
      // Failed to sync all songs to server
    }
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

  private async fetchAlbumArtInBackground(songIds: number[]): Promise<void> {

    const fetchPromises = songIds.map(async id => {
      try {
        const response = await fetch(`/api/lyrics/${id}`)
        if (!response.ok) {
          this.setLoadingAlbumArt(id, false)
          return
        }

        const data = await response.json()
        if (!data.lyrics) {
          this.setLoadingAlbumArt(id, false)
          return
        }

        const albumArt = data.albumArt as string | null | undefined

        saveCachedLyrics(id, {
          lyrics: data.lyrics,
          bpm: data.bpm ?? null,
          key: data.key ?? null,
          albumArt: albumArt ?? undefined,
          spotifyId: data.spotifyId ?? undefined,
          bpmSource: data.attribution?.bpm ?? undefined,
          lyricsSource: data.attribution?.lyrics ?? undefined,
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
      } catch {
        this.setLoadingAlbumArt(id, false)
      }
    })

    await Promise.allSettled(fetchPromises)
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
