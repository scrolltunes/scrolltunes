"use client"

import { MAX_RECENT_SONGS, type RecentSong } from "@/lib/recent-songs-types"
import { useSyncExternalStore } from "react"

const STORAGE_KEY = "scrolltunes:recents"

class RecentSongsStore {
  private listeners = new Set<() => void>()
  private state: readonly RecentSong[] = []

  constructor() {
    this.loadFromStorage()
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

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as readonly RecentSong[]
        if (Array.isArray(parsed)) {
          this.state = [...parsed]
            .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
            .slice(0, MAX_RECENT_SONGS)
        }
      }
    } catch {
      console.warn("Failed to load recent songs from localStorage")
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      console.warn("Failed to save recent songs to localStorage")
    }
  }

  private setState(updater: (prev: readonly RecentSong[]) => readonly RecentSong[]): void {
    this.state = updater(this.state)
    this.saveToStorage()
    this.notify()
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
  }

  /**
   * Get a specific recent song by ID
   */
  getRecent(id: number): RecentSong | undefined {
    return this.state.find(s => s.id === id)
  }

  /**
   * Clear all recent songs
   */
  clear(): void {
    this.setState(() => [])
  }

  /**
   * Remove a specific song from recents
   */
  remove(id: number): void {
    this.setState(prev => prev.filter(s => s.id !== id))
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

export type { RecentSong }
