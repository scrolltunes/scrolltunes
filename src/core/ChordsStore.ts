"use client"

import { type SongsterrChordData, transposeChord } from "@/lib/chords"
import { userApi } from "@/lib/user-api"
import { Data, Effect } from "effect"
import { useMemo, useSyncExternalStore } from "react"

// ============================================================================
// Chords Errors
// ============================================================================

/**
 * Error during chords API operations
 */
export class ChordsError extends Data.TaggedClass("ChordsError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CACHE_KEY_PREFIX = "scrolltunes:chords:"
const SHOW_CHORDS_KEY = "scrolltunes:showChords"
const TRANSPOSE_KEY = "scrolltunes:transpose"
const VARIABLE_SPEED_KEY = "scrolltunes:variableSpeedPainting"
const CACHE_VERSION = 2 // Increment when data format changes

interface CachedChords {
  data: SongsterrChordData
  fetchedAt: number
  version?: number
}

interface ChordsState {
  status: "idle" | "loading" | "ready" | "error" | "not-found"
  songId: number | null
  data: SongsterrChordData | null
  error: string | null
  errorUrl: string | null
  transposeSemitones: number
  showChords: boolean
  variableSpeedPainting: boolean
}

const EMPTY_STATE: ChordsState = {
  status: "idle",
  songId: null,
  data: null,
  error: null,
  errorUrl: null,
  transposeSemitones: 0,
  showChords: false,
  variableSpeedPainting: true,
}

function getCacheKey(songId: number): string {
  return `${CACHE_KEY_PREFIX}${songId}`
}

function loadFromCache(songId: number): SongsterrChordData | null {
  if (typeof window === "undefined") return null

  try {
    const stored = localStorage.getItem(getCacheKey(songId))
    if (!stored) return null

    const cached = JSON.parse(stored) as CachedChords
    const age = Date.now() - cached.fetchedAt

    // Invalidate cache if expired or outdated version (missing positionedChords)
    if (age > CACHE_TTL_MS || cached.version !== CACHE_VERSION) {
      localStorage.removeItem(getCacheKey(songId))
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

function saveToCache(songId: number, data: SongsterrChordData): void {
  if (typeof window === "undefined") return

  try {
    const cached: CachedChords = {
      data,
      fetchedAt: Date.now(),
      version: CACHE_VERSION,
    }
    localStorage.setItem(getCacheKey(songId), JSON.stringify(cached))
  } catch {
    // Failed to save to localStorage
  }
}

function loadShowChordsPreference(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem(SHOW_CHORDS_KEY)
    return stored === null ? false : stored === "true"
  } catch {
    return false
  }
}

function saveShowChordsPreference(show: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SHOW_CHORDS_KEY, String(show))
  } catch {
    // Failed to save
  }
}

function loadVariableSpeedPreference(): boolean {
  if (typeof window === "undefined") return true
  try {
    const stored = localStorage.getItem(VARIABLE_SPEED_KEY)
    return stored === null ? true : stored === "true"
  } catch {
    return true
  }
}

function saveVariableSpeedPreference(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(VARIABLE_SPEED_KEY, String(enabled))
  } catch {
    // Failed to save
  }
}

interface TransposePreferences {
  [songId: string]: number
}

function getTransposePreferences(): TransposePreferences {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(TRANSPOSE_KEY)
    return stored ? (JSON.parse(stored) as TransposePreferences) : {}
  } catch {
    return {}
  }
}

function saveTransposePreferences(prefs: TransposePreferences): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TRANSPOSE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage full or unavailable
  }
}

function loadTransposeForSong(songId: number): number | null {
  const prefs = getTransposePreferences()
  const key = String(songId)
  return key in prefs ? (prefs[key] ?? 0) : null
}

function saveTransposeForSong(songId: number, semitones: number): void {
  const prefs = getTransposePreferences()
  prefs[String(songId)] = semitones
  saveTransposePreferences(prefs)
}

class ChordsStore {
  private listeners = new Set<() => void>()
  private state: ChordsState = {
    ...EMPTY_STATE,
    showChords: loadShowChordsPreference(),
    variableSpeedPainting: loadVariableSpeedPreference(),
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ChordsState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private updateState(partial: Partial<ChordsState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  private fetchChordsEffect(
    songsterrSongId: number,
    artist: string,
    title: string,
  ): Effect.Effect<void, ChordsError> {
    return Effect.gen(this, function* () {
      if (this.state.songId === songsterrSongId && this.state.status === "ready") {
        return
      }

      const savedTranspose = yield* this.loadTransposeEffect(songsterrSongId)

      const cached = loadFromCache(songsterrSongId)
      if (cached) {
        this.updateState({
          status: "ready",
          songId: songsterrSongId,
          data: cached,
          error: null,
          transposeSemitones: savedTranspose,
        })
        return
      }

      this.updateState({
        status: "loading",
        songId: songsterrSongId,
        data: null,
        error: null,
        transposeSemitones: savedTranspose,
      })

      const params = new URLSearchParams({ artist, title })
      const requestUrl = `/api/chords/${songsterrSongId}?${params.toString()}`
      const fullUrl =
        typeof window !== "undefined" ? `${window.location.origin}${requestUrl}` : requestUrl

      const response = yield* Effect.tryPromise({
        try: () => fetch(requestUrl),
        catch: cause => new ChordsError({ operation: "fetchChords", cause }),
      })

      if (response.status === 404) {
        this.updateState({
          status: "not-found",
          error: "Chords not found",
          errorUrl: null,
        })
        return
      }

      if (!response.ok) {
        this.updateState({
          status: "error",
          error: `Failed to fetch chords: ${response.status}`,
          errorUrl: fullUrl,
        })
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<SongsterrChordData>,
        catch: cause => new ChordsError({ operation: "fetchChords", cause }),
      })

      saveToCache(songsterrSongId, data)

      this.updateState({
        status: "ready",
        data,
        error: null,
        errorUrl: null,
      })
    })
  }

  fetchChords(songsterrSongId: number, artist: string, title: string): void {
    Effect.runFork(
      this.fetchChordsEffect(songsterrSongId, artist, title).pipe(
        Effect.catchAll(error =>
          Effect.sync(() => {
            const params = new URLSearchParams({ artist, title })
            const requestUrl = `/api/chords/${songsterrSongId}?${params.toString()}`
            const fullUrl =
              typeof window !== "undefined" ? `${window.location.origin}${requestUrl}` : requestUrl
            this.updateState({
              status: "error",
              error: error.cause instanceof Error ? error.cause.message : "Unknown error",
              errorUrl: fullUrl,
            })
          }),
        ),
      ),
    )
  }

  private loadTransposeEffect(songId: number): Effect.Effect<number, never> {
    return Effect.gen(this, function* () {
      const localTranspose = loadTransposeForSong(songId)
      if (localTranspose !== null) {
        return localTranspose
      }

      const data = yield* Effect.tryPromise({
        try: () => userApi.get<{ transpose: number }>(`/api/user/transpose/${songId}`),
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (data) {
        saveTransposeForSong(songId, data.transpose)
        return data.transpose
      }

      return 0
    })
  }

  private saveTranspose(songId: number, semitones: number): void {
    saveTransposeForSong(songId, semitones)
    userApi.put(`/api/user/transpose/${songId}`, { transpose: semitones })
  }

  setTranspose(semitones: number): void {
    const clamped = Math.max(-12, Math.min(12, semitones))
    this.updateState({ transposeSemitones: clamped })

    if (this.state.songId !== null) {
      this.saveTranspose(this.state.songId, clamped)
    }
  }

  transposeUp(): void {
    this.setTranspose(this.state.transposeSemitones + 1)
  }

  transposeDown(): void {
    this.setTranspose(this.state.transposeSemitones - 1)
  }

  resetTranspose(): void {
    this.updateState({ transposeSemitones: 0 })
  }

  toggleShowChords(): void {
    const newValue = !this.state.showChords
    saveShowChordsPreference(newValue)
    this.updateState({ showChords: newValue })
  }

  setShowChords(show: boolean): void {
    saveShowChordsPreference(show)
    this.updateState({ showChords: show })
  }

  toggleVariableSpeedPainting(): void {
    const newValue = !this.state.variableSpeedPainting
    saveVariableSpeedPreference(newValue)
    this.updateState({ variableSpeedPainting: newValue })
  }

  setVariableSpeedPainting(enabled: boolean): void {
    saveVariableSpeedPreference(enabled)
    this.updateState({ variableSpeedPainting: enabled })
  }

  clear(): void {
    this.state = { ...EMPTY_STATE, showChords: this.state.showChords }
    this.notify()
  }
}

export const chordsStore = new ChordsStore()

export function useChordsState(): ChordsState {
  return useSyncExternalStore(chordsStore.subscribe, chordsStore.getSnapshot, () => EMPTY_STATE)
}

export function useChordsData(): SongsterrChordData | null {
  return useChordsState().data
}

export function useTranspose(): number {
  return useChordsState().transposeSemitones
}

export function useShowChords(): boolean {
  return useChordsState().showChords
}

export function useVariableSpeedPainting(): boolean {
  return useChordsState().variableSpeedPainting
}

export function useUniqueChords(): string[] {
  const state = useChordsState()

  return useMemo(() => {
    if (!state.data) return []

    const allChords = state.data.lines.flatMap(line => line.chords)
    const unique = [...new Set(allChords)]

    if (state.transposeSemitones !== 0) {
      return unique.map(chord => transposeChord(chord, state.transposeSemitones)).sort()
    }

    return unique.sort()
  }, [state.data, state.transposeSemitones])
}

export type { ChordsState }
