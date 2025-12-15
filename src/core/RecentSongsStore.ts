"use client"

import {
  MAX_RECENT_SONGS,
  POSITION_END_BUFFER_SECONDS,
  POSITION_MAX_AGE_MS,
  POSITION_MIN_SECONDS,
  type RecentSong,
} from "@/lib/recent-songs-types"
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
          this.state = parsed.slice(0, MAX_RECENT_SONGS)
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
        // Preserve existing data if not provided
        albumArt: song.albumArt ?? existing?.albumArt,
        lastPositionSeconds: existing?.lastPositionSeconds,
        lastPositionUpdatedAt: existing?.lastPositionUpdatedAt,
      }
      return [newSong, ...filtered].slice(0, MAX_RECENT_SONGS)
    })
  }

  /**
   * Update the last position for a song
   * Pass undefined to clear position (e.g., when song finished)
   */
  updatePosition(id: number, positionSeconds: number | undefined): void {
    this.setState(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              lastPositionSeconds: positionSeconds,
              lastPositionUpdatedAt: positionSeconds !== undefined ? Date.now() : undefined,
            }
          : s,
      ),
    )
  }

  /**
   * Get a specific recent song by ID
   */
  getRecent(id: number): RecentSong | undefined {
    return this.state.find(s => s.id === id)
  }

  /**
   * Check if a song's position is valid for resume
   * Valid if: within max age, position > min, position < duration - buffer
   */
  isPositionValidForResume(song: RecentSong): boolean {
    const lastPosition = song.lastPositionSeconds
    const lastUpdated = song.lastPositionUpdatedAt
    if (lastPosition == null || lastUpdated == null) {
      return false
    }

    const age = Date.now() - lastUpdated
    if (age > POSITION_MAX_AGE_MS) {
      return false
    }

    if (lastPosition < POSITION_MIN_SECONDS) {
      return false
    }

    if (lastPosition > song.durationSeconds - POSITION_END_BUFFER_SECONDS) {
      return false
    }

    return true
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
