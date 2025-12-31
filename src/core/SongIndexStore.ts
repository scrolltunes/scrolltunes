"use client"

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "scrolltunes:song-index"
const TTL_MS = 24 * 60 * 60 * 1000

export interface SongIndexEntry {
  id: number
  t: string
  a: string
  al?: string
  art?: string
  dur?: number
  pop?: number
}

export interface SongIndex {
  version: number
  updatedAt: number
  songs: SongIndexEntry[]
}

export interface SongIndexState {
  readonly isLoading: boolean
  readonly isInitialized: boolean
  readonly index: SongIndex | null
  readonly lastFetchedAt: number | null
}

const EMPTY_STATE: SongIndexState = {
  isLoading: false,
  isInitialized: false,
  index: null,
  lastFetchedAt: null,
}

class SongIndexStore {
  private listeners = new Set<() => void>()
  private state: SongIndexState = { ...EMPTY_STATE }

  constructor() {
    this.loadFromStorage()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SongIndexState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private updateState(partial: Partial<SongIndexState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { index: SongIndex; lastFetchedAt: number }
        if (parsed.index && Array.isArray(parsed.index.songs)) {
          this.state = {
            ...this.state,
            index: parsed.index,
            lastFetchedAt: parsed.lastFetchedAt,
            isInitialized: true,
          }
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
    if (!this.state.index) return

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          index: this.state.index,
          lastFetchedAt: this.state.lastFetchedAt,
        }),
      )
    } catch {
      // Failed to save to localStorage
    }
  }

  shouldRefresh(): boolean {
    if (!this.state.lastFetchedAt) return true
    return Date.now() - this.state.lastFetchedAt > TTL_MS
  }

  async fetchIndex(): Promise<void> {
    if (this.state.isLoading) return

    this.updateState({ isLoading: true })

    try {
      const response = await fetch("/api/songs/index")
      if (!response.ok) {
        this.updateState({ isLoading: false })
        return
      }

      const serverIndex = (await response.json()) as SongIndex
      const now = Date.now()

      this.updateState({
        index: serverIndex,
        lastFetchedAt: now,
        isLoading: false,
        isInitialized: true,
      })
      this.saveToStorage()
    } catch {
      this.updateState({ isLoading: false })
    }
  }

  mergeLocalEntries(localEntries: SongIndexEntry[]): void {
    if (!this.state.index) {
      this.updateState({
        index: {
          version: 1,
          updatedAt: Date.now(),
          songs: localEntries,
        },
      })
      this.saveToStorage()
      return
    }

    const existingIds = new Set(this.state.index.songs.map(s => s.id))
    const newEntries = localEntries.filter(e => !existingIds.has(e.id))

    if (newEntries.length === 0) return

    const mergedSongs = [...this.state.index.songs, ...newEntries]

    this.updateState({
      index: {
        ...this.state.index,
        songs: mergedSongs,
        updatedAt: Date.now(),
      },
    })
    this.saveToStorage()
  }

  getIndex(): SongIndex | null {
    return this.state.index
  }

  getSongs(): SongIndexEntry[] {
    return this.state.index?.songs ?? []
  }

  private prefetchedArtists = new Set<string>()

  async prefetchArtistSongs(artist: string): Promise<void> {
    const artistLower = artist.toLowerCase()
    if (this.prefetchedArtists.has(artistLower)) return

    this.prefetchedArtists.add(artistLower)

    try {
      const response = await fetch(
        `/api/songs/by-artist?artist=${encodeURIComponent(artist)}&limit=20`,
      )
      if (!response.ok) return

      const data = (await response.json()) as {
        songs: Array<{ id: number; t: string; a: string; al?: string; dur?: number }>
      }

      if (data.songs.length > 0) {
        this.mergeLocalEntries(data.songs)
      }
    } catch {
      this.prefetchedArtists.delete(artistLower)
    }
  }

  hasPrefetchedArtist(artist: string): boolean {
    return this.prefetchedArtists.has(artist.toLowerCase())
  }
}

export const songIndexStore = new SongIndexStore()

export function useSongIndexState(): SongIndexState {
  return useSyncExternalStore(
    songIndexStore.subscribe,
    songIndexStore.getSnapshot,
    () => EMPTY_STATE,
  )
}

export function useSongIndex(): SongIndexEntry[] {
  return useSongIndexState().index?.songs ?? []
}

export function useIsSongIndexLoading(): boolean {
  return useSongIndexState().isLoading
}
