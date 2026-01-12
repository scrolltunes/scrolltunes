"use client"

import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// ============================================================================
// Setlist Errors
// ============================================================================

/**
 * Error during setlist API operations
 */
export class SetlistError extends Data.TaggedClass("SetlistError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

export interface SetlistSong {
  readonly id: string
  readonly songId: string
  readonly songProvider: string
  readonly songTitle: string
  readonly songArtist: string
  readonly songAlbum?: string
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

const STORAGE_KEY = "scrolltunes:setlists"

export class SetlistsStore {
  private listeners = new Set<() => void>()
  private state: SetlistsState = DEFAULT_STATE

  constructor() {
    this.loadFromStorage()
  }

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

  private loadFromStorage(): void {
    if (typeof window === "undefined") return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as readonly Setlist[]
        if (Array.isArray(parsed)) {
          this.state = { ...this.state, setlists: parsed }
        }
      }
    } catch {
      // Failed to load from localStorage
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.setlists))
    } catch {
      // Failed to save to localStorage
    }
  }

  private readonly fetchAllEffect: Effect.Effect<void, SetlistError> = Effect.gen(
    this,
    function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch("/api/user/setlists"),
        catch: cause => new SetlistError({ operation: "fetchAll", cause }),
      })

      if (!response.ok) {
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ setlists: Setlist[] }>,
        catch: cause => new SetlistError({ operation: "fetchAll", cause }),
      })

      this.setState({
        setlists: data.setlists,
        isLoading: false,
      })
      this.saveToStorage()
    },
  )

  fetchAll(): void {
    const hasCachedData = this.state.setlists.length > 0
    if (!hasCachedData) {
      this.setState({ isLoading: true })
    }

    Effect.runFork(
      this.fetchAllEffect.pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            this.setState({ isLoading: false })
          }),
        ),
      ),
    )
  }

  private createEffect(
    name: string,
    options?: { description?: string; color?: string; icon?: string },
  ): Effect.Effect<Setlist | null, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("/api/user/setlists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: options?.description,
              color: options?.color,
              icon: options?.icon,
            }),
          }),
        catch: cause => new SetlistError({ operation: "create", cause }),
      })

      if (!response.ok) {
        return null
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ setlist: Setlist }>,
        catch: cause => new SetlistError({ operation: "create", cause }),
      })

      const newSetlist = { ...data.setlist, songCount: 0, songs: [] as const }

      this.setState({
        setlists: [...this.state.setlists, newSetlist],
      })
      this.saveToStorage()

      return newSetlist
    })
  }

  async create(
    name: string,
    options?: { description?: string; color?: string; icon?: string },
  ): Promise<Setlist | null> {
    return Effect.runPromise(
      this.createEffect(name, options).pipe(Effect.catchAll(() => Effect.succeed(null))),
    )
  }

  private updateEffect(
    id: string,
    updates: { name?: string; description?: string; color?: string | null; icon?: string },
  ): Effect.Effect<boolean, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`/api/user/setlists/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }),
        catch: cause => new SetlistError({ operation: "update", cause }),
      })

      if (!response.ok) {
        return false
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ setlist: Setlist }>,
        catch: cause => new SetlistError({ operation: "update", cause }),
      })

      this.setState({
        setlists: this.state.setlists.map(s => (s.id === id ? { ...s, ...data.setlist } : s)),
      })
      this.saveToStorage()

      return true
    })
  }

  async update(
    id: string,
    updates: { name?: string; description?: string; color?: string | null; icon?: string },
  ): Promise<boolean> {
    return Effect.runPromise(
      this.updateEffect(id, updates).pipe(Effect.catchAll(() => Effect.succeed(false))),
    )
  }

  private deleteEffect(id: string): Effect.Effect<boolean, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`/api/user/setlists/${id}`, {
            method: "DELETE",
          }),
        catch: cause => new SetlistError({ operation: "delete", cause }),
      })

      if (!response.ok) {
        return false
      }

      this.setState({
        setlists: this.state.setlists.filter(s => s.id !== id),
        activeSetlistId: this.state.activeSetlistId === id ? null : this.state.activeSetlistId,
      })
      this.saveToStorage()

      return true
    })
  }

  async delete(id: string): Promise<boolean> {
    return Effect.runPromise(
      this.deleteEffect(id).pipe(Effect.catchAll(() => Effect.succeed(false))),
    )
  }

  private fetchSongsEffect(setlistId: string): Effect.Effect<void, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(`/api/user/setlists/${setlistId}`),
        catch: cause => new SetlistError({ operation: "fetchSongs", cause }),
      })

      if (!response.ok) {
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ setlist: Setlist & { songs: SetlistSong[] } }>,
        catch: cause => new SetlistError({ operation: "fetchSongs", cause }),
      })

      this.setState({
        setlists: this.state.setlists.map(s =>
          s.id === setlistId ? { ...s, songs: data.setlist.songs } : s,
        ),
      })
      this.saveToStorage()
    })
  }

  fetchSongs(setlistId: string): void {
    Effect.runFork(this.fetchSongsEffect(setlistId).pipe(Effect.ignore))
  }

  private addSongEffect(
    setlistId: string,
    song: { songId: string; songProvider: string; title: string; artist: string; album?: string },
  ): Effect.Effect<SetlistSong | null, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`/api/user/setlists/${setlistId}/songs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(song),
          }),
        catch: cause => new SetlistError({ operation: "addSong", cause }),
      })

      if (!response.ok) {
        return null
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ song: SetlistSong }>,
        catch: cause => new SetlistError({ operation: "addSong", cause }),
      })

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
      this.saveToStorage()

      return data.song
    })
  }

  async addSong(
    setlistId: string,
    song: { songId: string; songProvider: string; title: string; artist: string; album?: string },
  ): Promise<SetlistSong | null> {
    return Effect.runPromise(
      this.addSongEffect(setlistId, song).pipe(Effect.catchAll(() => Effect.succeed(null))),
    )
  }

  private removeSongEffect(
    setlistId: string,
    compositeId: string,
  ): Effect.Effect<boolean, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`/api/user/setlists/${setlistId}/songs/${compositeId}`, {
            method: "DELETE",
          }),
        catch: cause => new SetlistError({ operation: "removeSong", cause }),
      })

      if (!response.ok) {
        return false
      }

      // Parse the composite ID to match the songs array format
      const [provider, ...idParts] = compositeId.split(":")
      const songId = idParts.join(":")

      this.setState({
        setlists: this.state.setlists.map(s => {
          if (s.id !== setlistId) return s
          const currentSongs = s.songs ?? []
          return {
            ...s,
            songs: currentSongs.filter(
              song => !(song.songId === songId && song.songProvider === provider),
            ),
            songCount: Math.max(0, s.songCount - 1),
          }
        }),
      })
      this.saveToStorage()

      return true
    })
  }

  async removeSong(setlistId: string, compositeId: string): Promise<boolean> {
    return Effect.runPromise(
      this.removeSongEffect(setlistId, compositeId).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
      ),
    )
  }

  private reorderSongsEffect(
    setlistId: string,
    songIds: string[],
  ): Effect.Effect<boolean, SetlistError> {
    return Effect.gen(this, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`/api/user/setlists/${setlistId}/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ songIds }),
          }),
        catch: cause => new SetlistError({ operation: "reorderSongs", cause }),
      })

      if (!response.ok) {
        return false
      }

      this.setState({
        setlists: this.state.setlists.map(s => {
          if (s.id !== setlistId || !s.songs) return s
          const reorderedSongs = songIds
            .map((recordId, index) => {
              const song = s.songs?.find(song => song.id === recordId)
              return song ? { ...song, sortOrder: index } : null
            })
            .filter((song): song is SetlistSong => song !== null)
          return { ...s, songs: reorderedSongs }
        }),
      })
      this.saveToStorage()

      return true
    })
  }

  async reorderSongs(setlistId: string, songIds: string[]): Promise<boolean> {
    return Effect.runPromise(
      this.reorderSongsEffect(setlistId, songIds).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
      ),
    )
  }

  setActiveSetlist(id: string | null): void {
    this.setState({ activeSetlistId: id })
  }

  clear(): void {
    this.setState({ setlists: [], activeSetlistId: null })
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Failed to clear localStorage
      }
    }
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

export function useSetlistsContainingSong(songId: number): readonly Setlist[] {
  const state = useSyncExternalStore(
    setlistsStore.subscribe,
    setlistsStore.getSnapshot,
    () => DEFAULT_STATE,
  )
  const songIdStr = String(songId)
  return state.setlists.filter(
    s =>
      s.songs?.some(song => song.songId === songIdStr && song.songProvider === "lrclib") ?? false,
  )
}
