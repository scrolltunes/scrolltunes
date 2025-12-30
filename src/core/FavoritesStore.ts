"use client"

import { useSyncExternalStore } from "react"
import { accountStore } from "./AccountStore"

export interface FavoriteItem {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string
  readonly addedAt: number
}

export interface ServerFavorite {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string
  readonly addedAt: string
}

const STORAGE_KEY = "scrolltunes:favorites"

class FavoritesStore {
  private listeners = new Set<() => void>()
  private state: readonly FavoriteItem[] = []

  constructor() {
    this.loadFromStorage()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): readonly FavoriteItem[] => this.state

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
        const parsed = JSON.parse(stored) as readonly FavoriteItem[]
        if (Array.isArray(parsed)) {
          this.state = [...parsed].sort((a, b) => b.addedAt - a.addedAt)
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

  private setState(updater: (prev: readonly FavoriteItem[]) => readonly FavoriteItem[]): void {
    this.state = updater(this.state)
    this.saveToStorage()
    this.notify()
  }

  private async syncAddToServer(item: FavoriteItem): Promise<void> {
    if (!accountStore.isAuthenticated()) return

    try {
      const response = await fetch("/api/user/favorites/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          favorites: [
            {
              songId: `lrclib:${item.id}`,
              songProvider: "lrclib",
              title: item.title,
              artist: item.artist,
              album: item.album,
              albumArt: item.albumArt,
              addedAt: new Date(item.addedAt).toISOString(),
            },
          ],
        }),
      })

      if (response.ok) {
        accountStore.setLastSyncAt(new Date())
      }
    } catch {
      // Failed to sync favorite to server
    }
  }

  private async syncRemoveFromServer(id: number): Promise<void> {
    if (!accountStore.isAuthenticated()) return

    try {
      const response = await fetch(`/api/user/favorites/lrclib:${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        accountStore.setLastSyncAt(new Date())
      }
    } catch {
      // Failed to remove favorite from server
    }
  }

  add(song: Omit<FavoriteItem, "addedAt">, addedAt?: number): void {
    if (this.isFavorite(song.id)) return

    const item: FavoriteItem = {
      ...song,
      addedAt: addedAt ?? Date.now(),
    }

    this.setState(prev => [...prev, item].sort((a, b) => b.addedAt - a.addedAt))
    this.syncAddToServer(item)
  }

  remove(id: number): void {
    if (!this.isFavorite(id)) return

    this.setState(prev => prev.filter(item => item.id !== id))
    this.syncRemoveFromServer(id)
  }

  isFavorite(id: number): boolean {
    return this.state.some(item => item.id === id)
  }

  toggle(song: Omit<FavoriteItem, "addedAt">): void {
    if (this.isFavorite(song.id)) {
      this.remove(song.id)
    } else {
      this.add(song)
    }
  }

  /**
   * Update metadata for an existing favorite without changing addedAt.
   * Only updates if the song is already a favorite.
   * Does not sync to server (metadata updates are local-only).
   */
  updateMetadata(id: number, updates: { album?: string; albumArt?: string }): void {
    if (!this.isFavorite(id)) return

    this.setState(prev =>
      prev.map(item => {
        if (item.id !== id) return item
        const updated: FavoriteItem = { ...item }
        if (updates.album !== undefined) {
          ;(updated as { album?: string }).album = updates.album
        }
        if (updates.albumArt !== undefined) {
          ;(updated as { albumArt?: string }).albumArt = updates.albumArt
        }
        return updated
      }),
    )
  }

  async syncAllToServer(): Promise<void> {
    if (!accountStore.isAuthenticated()) return
    if (this.state.length === 0) return

    try {
      const favorites = this.state.map(item => ({
        songId: `lrclib:${item.id}`,
        songProvider: "lrclib",
        title: item.title,
        artist: item.artist,
        album: item.album,
        albumArt: item.albumArt,
        addedAt: new Date(item.addedAt).toISOString(),
      }))

      const response = await fetch("/api/user/favorites/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites }),
      })

      if (response.ok) {
        accountStore.setLastSyncAt(new Date())
      }
    } catch {
      // Failed to sync all favorites to server
    }
  }

  replaceFromServer(songs: ServerFavorite[]): void {
    const favorites: FavoriteItem[] = songs
      .map(s => {
        const numericId = Number.parseInt(s.songId.replace("lrclib:", ""), 10)
        if (Number.isNaN(numericId)) return null

        const item: FavoriteItem = {
          id: numericId,
          title: s.title,
          artist: s.artist,
          album: s.album ?? "",
          ...(s.albumArt !== undefined && { albumArt: s.albumArt }),
          addedAt: new Date(s.addedAt).getTime(),
        }
        return item
      })
      .filter((s): s is FavoriteItem => s !== null)
      .sort((a, b) => b.addedAt - a.addedAt)

    this.state = favorites
    this.saveToStorage()
    this.notify()
  }

  clear(): void {
    this.setState(() => [])
  }
}

export const favoritesStore = new FavoritesStore()

const EMPTY_FAVORITES: readonly FavoriteItem[] = []

export function useFavorites(): readonly FavoriteItem[] {
  return useSyncExternalStore(
    favoritesStore.subscribe,
    favoritesStore.getSnapshot,
    () => EMPTY_FAVORITES,
  )
}

export function useIsFavorite(id: number): boolean {
  const favorites = useFavorites()
  return favorites.some(item => item.id === id)
}
