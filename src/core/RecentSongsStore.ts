"use client"

import { loadCachedLyrics, saveCachedLyrics } from "@/lib/lyrics-cache"
import { MAX_RECENT_SONGS, type RecentSong } from "@/lib/recent-songs-types"
import { recentSongToHistorySyncItem, syncHistory } from "@/lib/sync-service"
import { useSyncExternalStore } from "react"
import { accountStore } from "./AccountStore"

const STORAGE_KEY = "scrolltunes:recents"

class RecentSongsStore {
  private listeners = new Set<() => void>()
  private albumArtListeners = new Set<() => void>()
  private syncListeners = new Set<() => void>()
  private initializedListeners = new Set<() => void>()
  private expectedCountListeners = new Set<() => void>()
  private state: readonly RecentSong[] = []
  private loadingAlbumArtIds = new Set<number>()
  private isSyncingFromServer = false
  private isInitializedState = false
  private hadLocalCache = false
  private expectedCount: number | null = null

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

  getSnapshot = (): readonly RecentSong[] => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private notifyAlbumArtListeners(): void {
    for (const listener of this.albumArtListeners) {
      listener()
    }
  }

  subscribeAlbumArt = (listener: () => void): (() => void) => {
    this.albumArtListeners.add(listener)
    return () => this.albumArtListeners.delete(listener)
  }

  getAlbumArtLoadingSnapshot = (): ReadonlySet<number> => this.loadingAlbumArtIds

  setLoadingAlbumArt(id: number, loading: boolean): void {
    if (loading) {
      this.loadingAlbumArtIds.add(id)
    } else {
      this.loadingAlbumArtIds.delete(id)
    }
    this.loadingAlbumArtIds = new Set(this.loadingAlbumArtIds)
    this.notifyAlbumArtListeners()
  }

  isLoadingAlbumArt(id: number): boolean {
    return this.loadingAlbumArtIds.has(id)
  }

  subscribeSyncing = (listener: () => void): (() => void) => {
    this.syncListeners.add(listener)
    return () => this.syncListeners.delete(listener)
  }

  getSyncingSnapshot = (): boolean => this.isSyncingFromServer

  private notifySyncListeners(): void {
    for (const listener of this.syncListeners) {
      listener()
    }
  }

  setSyncing(syncing: boolean): void {
    this.isSyncingFromServer = syncing
    this.notifySyncListeners()
  }

  subscribeInitialized = (listener: () => void): (() => void) => {
    this.initializedListeners.add(listener)
    return () => this.initializedListeners.delete(listener)
  }

  getInitializedSnapshot = (): boolean => this.isInitializedState

  private notifyInitializedListeners(): void {
    for (const listener of this.initializedListeners) {
      listener()
    }
  }

  setInitialized(initialized: boolean): void {
    this.isInitializedState = initialized
    this.notifyInitializedListeners()
  }

  subscribeExpectedCount = (listener: () => void): (() => void) => {
    this.expectedCountListeners.add(listener)
    return () => this.expectedCountListeners.delete(listener)
  }

  getExpectedCountSnapshot = (): number | null => this.expectedCount

  private notifyExpectedCountListeners(): void {
    for (const listener of this.expectedCountListeners) {
      listener()
    }
  }

  setExpectedCount(count: number): void {
    this.expectedCount = count
    this.notifyExpectedCountListeners()
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as readonly RecentSong[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.state = [...parsed]
            .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
            .slice(0, MAX_RECENT_SONGS)
          this.hadLocalCache = true
        }
      }
    } catch {
      // Failed to load from localStorage
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // Failed to save to localStorage
    }
  }

  private setState(updater: (prev: readonly RecentSong[]) => readonly RecentSong[]): void {
    this.state = updater(this.state)
    this.saveToStorage()
    this.notify()
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
    this.setState(prev => {
      const existing = prev.find(s => s.id === song.id)
      const filtered = prev.filter(s => s.id !== song.id)
      const newSong: RecentSong = {
        ...song,
        lastPlayedAt: song.lastPlayedAt ?? Date.now(),
        albumArt: song.albumArt ?? existing?.albumArt,
      }
      return [newSong, ...filtered].slice(0, MAX_RECENT_SONGS)
    })

    const fullSong = this.state.find(s => s.id === song.id)
    if (fullSong) {
      this.syncToServer(fullSong)
    }
  }

  /**
   * Update song metadata without changing position in list.
   * Use this when loading a song page without actually playing it.
   * If the song doesn't exist yet, adds it to the front.
   */
  updateMetadata(song: Omit<RecentSong, "lastPlayedAt">): void {
    this.setState(prev => {
      const existingIndex = prev.findIndex(s => s.id === song.id)

      if (existingIndex >= 0) {
        // Update in place without reordering
        const existing = prev[existingIndex]
        if (!existing) return prev
        const updated: RecentSong = {
          ...existing,
          ...song,
          albumArt: song.albumArt ?? existing.albumArt,
        }
        return [...prev.slice(0, existingIndex), updated, ...prev.slice(existingIndex + 1)]
      }

      // Song not in list - add to front with current timestamp
      const newSong: RecentSong = {
        ...song,
        lastPlayedAt: Date.now(),
      }
      return [newSong, ...prev].slice(0, MAX_RECENT_SONGS)
    })
  }

  /**
   * Move an existing song to the top of the list (mark as played)
   */
  markAsPlayed(id: number): void {
    this.setState(prev => {
      const existing = prev.find(s => s.id === id)
      if (!existing) return prev

      const filtered = prev.filter(s => s.id !== id)
      const updated: RecentSong = {
        ...existing,
        lastPlayedAt: Date.now(),
      }
      return [updated, ...filtered]
    })

    const song = this.state.find(s => s.id === id)
    if (song) {
      this.syncToServer(song)
    }
  }

  /**
   * Get a specific recent song by ID
   */
  getRecent(id: number): RecentSong | undefined {
    return this.state.find(s => s.id === id)
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
    this.setState(() => [])
  }

  /**
   * Remove a specific song from recents
   */
  remove(id: number): void {
    this.setState(prev => prev.filter(s => s.id !== id))
  }

  async syncAllToServer(): Promise<void> {
    if (!accountStore.isAuthenticated()) return
    if (this.state.length === 0) return

    try {
      const items = this.state.map(recentSongToHistorySyncItem)
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

    this.state = recentSongs.slice(0, MAX_RECENT_SONGS)
    this.saveToStorage()
    this.notify()

    if (songsNeedingAlbumArt.length > 0) {
      this.fetchAlbumArtInBackground(songsNeedingAlbumArt)
    }
  }

  private async fetchAlbumArtInBackground(songIds: number[]): Promise<void> {
    for (const id of songIds) {
      this.setLoadingAlbumArt(id, true)
    }

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
        })

        if (albumArt) {
          this.setState(prev =>
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

// Stable empty array for SSR fallback (must be cached to avoid infinite loop)
const EMPTY_RECENTS: readonly RecentSong[] = []

// React hooks
export function useRecentSongs(): readonly RecentSong[] {
  return useSyncExternalStore(
    recentSongsStore.subscribe,
    recentSongsStore.getSnapshot,
    () => EMPTY_RECENTS,
  )
}

export function useRecentSong(id: number): RecentSong | undefined {
  const recents = useRecentSongs()
  return recents.find(s => s.id === id)
}

// Stable empty set for SSR fallback
const EMPTY_LOADING_SET: ReadonlySet<number> = new Set()

export function useAlbumArtLoadingIds(): ReadonlySet<number> {
  return useSyncExternalStore(
    recentSongsStore.subscribeAlbumArt,
    recentSongsStore.getAlbumArtLoadingSnapshot,
    () => EMPTY_LOADING_SET,
  )
}

export function useIsLoadingAlbumArt(id: number): boolean {
  const loadingIds = useAlbumArtLoadingIds()
  return loadingIds.has(id)
}

export function useIsRecentsLoading(): boolean {
  return useSyncExternalStore(
    recentSongsStore.subscribeSyncing,
    recentSongsStore.getSyncingSnapshot,
    () => false,
  )
}

export function useIsRecentsInitialized(): boolean {
  return useSyncExternalStore(
    recentSongsStore.subscribeInitialized,
    recentSongsStore.getInitializedSnapshot,
    () => false,
  )
}

export function useExpectedRecentsCount(): number | null {
  return useSyncExternalStore(
    recentSongsStore.subscribeExpectedCount,
    recentSongsStore.getExpectedCountSnapshot,
    () => null,
  )
}

export type { RecentSong }
