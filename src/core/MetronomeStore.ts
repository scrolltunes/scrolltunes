"use client"

import { userApi } from "@/lib/user-api"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// ============================================================================
// Metronome Errors
// ============================================================================

/**
 * Error during metronome API operations
 */
export class MetronomeError extends Data.TaggedClass("MetronomeError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

export type MetronomeMode = "click" | "visual" | "both"

export interface MetronomeState {
  readonly mode: MetronomeMode
  readonly isMuted: boolean
  readonly volume: number
  readonly bpm: number | null
  readonly isRunning: boolean
}

const STORAGE_KEY = "scrolltunes:metronome"

interface PersistedMetronomeSettings {
  mode: MetronomeMode
  isMuted: boolean
  volume: number
}

const DEFAULT_STATE: MetronomeState = {
  mode: "click",
  isMuted: false,
  volume: 0.5,
  bpm: null,
  isRunning: false,
}

function normalizeMode(mode: MetronomeMode): MetronomeMode {
  // "both" was removed from UI - treat as "click"
  return mode === "both" ? "click" : mode
}

function loadPersistedSettings(): Partial<MetronomeState> {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as PersistedMetronomeSettings
    return {
      mode: normalizeMode(parsed.mode),
      isMuted: parsed.isMuted,
      volume: parsed.volume,
    }
  } catch {
    return {}
  }
}

function savePersistedSettings(settings: PersistedMetronomeSettings): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage full or unavailable
  }
}

export interface MetronomeControls {
  readonly start: () => void
  readonly stop: () => void
  readonly setMode: (mode: MetronomeMode) => void
  readonly setMuted: (muted: boolean) => void
  readonly setVolume: (volume: number) => void
  readonly setBpm: (bpm: number | null) => void
}

export class MetronomeStore {
  private listeners = new Set<() => void>()
  private state: MetronomeState = DEFAULT_STATE
  private initialized = false

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MetronomeState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<MetronomeState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  private persistSettings(): void {
    const settings = {
      mode: this.state.mode,
      isMuted: this.state.isMuted,
      volume: this.state.volume,
    }
    savePersistedSettings(settings)
    this.syncToServer(settings)
  }

  private syncToServer(settings: PersistedMetronomeSettings): void {
    userApi.put("/api/user/metronome", { metronome: settings })
  }

  private readonly initializeEffect: Effect.Effect<void, MetronomeError> = Effect.gen(
    this,
    function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch("/api/user/metronome"),
        catch: cause => new MetronomeError({ operation: "initialize", cause }),
      })

      if (!response.ok) {
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ metronome: PersistedMetronomeSettings | null }>,
        catch: cause => new MetronomeError({ operation: "initialize", cause }),
      })

      if (data?.metronome) {
        const normalizedSettings = {
          mode: normalizeMode(data.metronome.mode),
          isMuted: data.metronome.isMuted,
          volume: data.metronome.volume,
        }
        this.setState(normalizedSettings)
        savePersistedSettings(normalizedSettings)
      }
    },
  )

  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    const localSettings = loadPersistedSettings()
    const hasLocalData = Object.keys(localSettings).length > 0

    if (hasLocalData) {
      this.setState(localSettings)
      return
    }

    Effect.runFork(this.initializeEffect.pipe(Effect.ignore))
  }

  start(): void {
    this.setState({ isRunning: true })
  }

  stop(): void {
    this.setState({ isRunning: false })
  }

  setMode(mode: MetronomeMode): void {
    this.setState({ mode })
    this.persistSettings()
  }

  setMuted(isMuted: boolean): void {
    this.setState({ isMuted })
    this.persistSettings()
  }

  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume))
    this.setState({ volume: clampedVolume })
    this.persistSettings()
  }

  setBpm(bpm: number | null): void {
    this.setState({ bpm })
  }
}

export const metronomeStore = new MetronomeStore()

export function useMetronome(): MetronomeState {
  return useSyncExternalStore(
    metronomeStore.subscribe,
    metronomeStore.getSnapshot,
    () => DEFAULT_STATE,
  )
}

export function useMetronomeControls(): MetronomeControls {
  return {
    start: metronomeStore.start.bind(metronomeStore),
    stop: metronomeStore.stop.bind(metronomeStore),
    setMode: metronomeStore.setMode.bind(metronomeStore),
    setMuted: metronomeStore.setMuted.bind(metronomeStore),
    setVolume: metronomeStore.setVolume.bind(metronomeStore),
    setBpm: metronomeStore.setBpm.bind(metronomeStore),
  }
}
