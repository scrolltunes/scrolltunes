"use client"

import { type SongsterrChordData, transposeChord } from "@/lib/chords"
import { useMemo, useSyncExternalStore } from "react"

import { accountStore } from "./AccountStore"

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CACHE_KEY_PREFIX = "scrolltunes:chords:"
const SHOW_CHORDS_KEY = "scrolltunes:showChords"
const TRANSPOSE_KEY = "scrolltunes:transpose"

interface CachedChords {
  data: SongsterrChordData
  fetchedAt: number
}

interface ChordsState {
  status: "idle" | "loading" | "ready" | "error" | "not-found"
  songId: number | null
  data: SongsterrChordData | null
  error: string | null
  errorUrl: string | null
  transposeSemitones: number
  showChords: boolean
}

const EMPTY_STATE: ChordsState = {
  status: "idle",
  songId: null,
  data: null,
  error: null,
  errorUrl: null,
  transposeSemitones: 0,
  showChords: true,
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
    if (age > CACHE_TTL_MS) {
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
    }
    localStorage.setItem(getCacheKey(songId), JSON.stringify(cached))
  } catch {
    // Failed to save to localStorage
  }
}

function loadShowChordsPreference(): boolean {
  if (typeof window === "undefined") return true
  try {
    const stored = localStorage.getItem(SHOW_CHORDS_KEY)
    return stored === null ? true : stored === "true"
  } catch {
    return true
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
  private state: ChordsState = { ...EMPTY_STATE, showChords: loadShowChordsPreference() }

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

  async fetchChords(songsterrSongId: number, artist: string, title: string): Promise<void> {
    if (this.state.songId === songsterrSongId && this.state.status === "ready") {
      return
    }

    const savedTranspose = await this.loadTranspose(songsterrSongId)

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
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${requestUrl}` : requestUrl

    try {
      const response = await fetch(requestUrl)

      if (response.status === 404) {
        this.updateState({
          status: "not-found",
          error: "Chords not found",
          errorUrl: null,
        })
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch chords: ${response.status}`)
      }

      const data = (await response.json()) as SongsterrChordData
      saveToCache(songsterrSongId, data)

      this.updateState({
        status: "ready",
        data,
        error: null,
        errorUrl: null,
      })
    } catch (err) {
      this.updateState({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
        errorUrl: fullUrl,
      })
    }
  }

  private async loadTranspose(songId: number): Promise<number> {
    const localTranspose = loadTransposeForSong(songId)
    if (localTranspose !== null) {
      return localTranspose
    }

    if (accountStore.isAuthenticated()) {
      try {
        const response = await fetch(`/api/user/transpose/${songId}`)
        if (response.ok) {
          const data = (await response.json()) as { transpose: number }
          saveTransposeForSong(songId, data.transpose)
          return data.transpose
        }
      } catch {
        // Failed to fetch from server, use default
      }
    }

    return 0
  }

  private async saveTranspose(songId: number, semitones: number): Promise<void> {
    saveTransposeForSong(songId, semitones)

    if (accountStore.isAuthenticated()) {
      try {
        await fetch(`/api/user/transpose/${songId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transpose: semitones }),
        })
      } catch {
        // Failed to sync to server, local storage is still updated
      }
    }
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
