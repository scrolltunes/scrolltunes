"use client"

import type { SongsterrChordData } from "@/lib/chords"
import { useSyncExternalStore } from "react"

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CACHE_KEY_PREFIX = "scrolltunes:chords:"
const SHOW_CHORDS_KEY = "scrolltunes:showChords"

interface CachedChords {
  data: SongsterrChordData
  fetchedAt: number
}

interface ChordsState {
  status: "idle" | "loading" | "ready" | "error" | "not-found"
  songId: number | null
  data: SongsterrChordData | null
  error: string | null
  transposeSemitones: number
  showChords: boolean
}

const EMPTY_STATE: ChordsState = {
  status: "idle",
  songId: null,
  data: null,
  error: null,
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

    const cached = loadFromCache(songsterrSongId)
    if (cached) {
      this.updateState({
        status: "ready",
        songId: songsterrSongId,
        data: cached,
        error: null,
        transposeSemitones: 0,
      })
      return
    }

    this.updateState({
      status: "loading",
      songId: songsterrSongId,
      data: null,
      error: null,
      transposeSemitones: 0,
    })

    try {
      const params = new URLSearchParams({ artist, title })
      const response = await fetch(`/api/chords/${songsterrSongId}?${params.toString()}`)

      if (response.status === 404) {
        this.updateState({
          status: "not-found",
          error: "Chords not found",
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
      })
    } catch (err) {
      this.updateState({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  setTranspose(semitones: number): void {
    const clamped = Math.max(-12, Math.min(12, semitones))
    this.updateState({ transposeSemitones: clamped })
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

export type { ChordsState }
