"use client"

import { useSyncExternalStore } from "react"

export interface SetlistSong {
  readonly songId: string
  readonly songProvider: string
  readonly title: string
  readonly artist: string
  readonly sortOrder: number
}

export interface Setlist {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly color?: string
  readonly icon?: string
  readonly sortOrder: number
  readonly songCount: number
  readonly songs?: readonly SetlistSong[]
}

export interface SetlistsState {
  readonly setlists: readonly Setlist[]
  readonly isLoading: boolean
  readonly activeSetlistId: string | null
}

const DEFAULT_STATE: SetlistsState = {
  setlists: [],
  isLoading: false,
  activeSetlistId: null,
}

export class SetlistsStore {
  private listeners = new Set<() => void>()
  private state: SetlistsState = DEFAULT_STATE

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SetlistsState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<SetlistsState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  async fetchAll(): Promise<void> {
    this.setState({ isLoading: true })

    try {
      const response = await fetch("/api/user/setlists")

      if (!response.ok) {
        this.setState({ isLoading: false })
        return
      }

      const data = (await response.json()) as { setlists: Setlist[] }

      this.setState({
        setlists: data.setlists,
        isLoading: false,
      })
    } catch {
      this.setState({ isLoading: false })
    }
  }

  async create(
    name: string,
    options?: { description?: string; color?: string; icon?: string },
  ): Promise<Setlist | null> {
    try {
      const response = await fetch("/api/user/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: options?.description,
          color: options?.color,
          icon: options?.icon,
        }),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as { setlist: Setlist }
      const newSetlist = { ...data.setlist, songCount: 0 }

      this.setState({
        setlists: [...this.state.setlists, newSetlist],
      })

      return newSetlist
    } catch {
      return null
    }
  }

  async update(
    id: string,
    updates: { name?: string; description?: string; color?: string; icon?: string },
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/user/setlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as { setlist: Setlist }

      this.setState({
        setlists: this.state.setlists.map(s => (s.id === id ? { ...s, ...data.setlist } : s)),
      })

      return true
    } catch {
      return false
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/user/setlists/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        return false
      }

      this.setState({
        setlists: this.state.setlists.filter(s => s.id !== id),
        activeSetlistId: this.state.activeSetlistId === id ? null : this.state.activeSetlistId,
      })

      return true
    } catch {
      return false
    }
  }

  async fetchSongs(setlistId: string): Promise<void> {
    try {
      const response = await fetch(`/api/user/setlists/${setlistId}`)

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as { setlist: Setlist & { songs: SetlistSong[] } }

      this.setState({
        setlists: this.state.setlists.map(s =>
          s.id === setlistId ? { ...s, songs: data.setlist.songs } : s,
        ),
      })
    } catch {
      // Failed to fetch songs
    }
  }

  async addSong(
    setlistId: string,
    song: { songId: string; songProvider: string; title: string; artist: string },
  ): Promise<boolean> {
    try {
      const response = await fetch(`/api/user/setlists/${setlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(song),
      })

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as { song: SetlistSong }

      this.setState({
        setlists: this.state.setlists.map(s => {
          if (s.id !== setlistId) return s
          const currentSongs = s.songs ?? []
          return {
            ...s,
            songs: [...currentSongs, data.song],
            songCount: s.songCount + 1,
          }
        }),
      })

      return true
    } catch {
      return false
    }
  }

  async removeSong(setlistId: string, songId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/user/setlists/${setlistId}/songs/${songId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        return false
      }

      this.setState({
        setlists: this.state.setlists.map(s => {
          if (s.id !== setlistId) return s
          const currentSongs = s.songs ?? []
          return {
            ...s,
            songs: currentSongs.filter(song => song.songId !== songId),
            songCount: Math.max(0, s.songCount - 1),
          }
        }),
      })

      return true
    } catch {
      return false
    }
  }

  async reorderSongs(setlistId: string, songIds: string[]): Promise<boolean> {
    try {
      const response = await fetch(`/api/user/setlists/${setlistId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds }),
      })

      if (!response.ok) {
        return false
      }

      this.setState({
        setlists: this.state.setlists.map(s => {
          if (s.id !== setlistId || !s.songs) return s
          const reorderedSongs = songIds
            .map((id, index) => {
              const song = s.songs?.find(song => song.songId === id)
              return song ? { ...song, sortOrder: index } : null
            })
            .filter((song): song is SetlistSong => song !== null)
          return { ...s, songs: reorderedSongs }
        }),
      })

      return true
    } catch {
      return false
    }
  }

  setActiveSetlist(id: string | null): void {
    this.setState({ activeSetlistId: id })
  }

  getSetlist(id: string): Setlist | undefined {
    return this.state.setlists.find(s => s.id === id)
  }

  getActiveSetlist(): Setlist | undefined {
    if (!this.state.activeSetlistId) return undefined
    return this.getSetlist(this.state.activeSetlistId)
  }
}

export const setlistsStore = new SetlistsStore()

const EMPTY_SETLISTS: readonly Setlist[] = []

export function useSetlists(): readonly Setlist[] {
  const state = useSyncExternalStore(
    setlistsStore.subscribe,
    setlistsStore.getSnapshot,
    () => DEFAULT_STATE,
  )
  return state.setlists.length > 0 ? state.setlists : EMPTY_SETLISTS
}

export function useSetlistsLoading(): boolean {
  const state = useSyncExternalStore(
    setlistsStore.subscribe,
    setlistsStore.getSnapshot,
    () => DEFAULT_STATE,
  )
  return state.isLoading
}

export function useActiveSetlist(): Setlist | undefined {
  const state = useSyncExternalStore(
    setlistsStore.subscribe,
    setlistsStore.getSnapshot,
    () => DEFAULT_STATE,
  )
  if (!state.activeSetlistId) return undefined
  return state.setlists.find(s => s.id === state.activeSetlistId)
}

export function useSetlist(id: string): Setlist | undefined {
  const state = useSyncExternalStore(
    setlistsStore.subscribe,
    setlistsStore.getSnapshot,
    () => DEFAULT_STATE,
  )
  return state.setlists.find(s => s.id === id)
}
