"use client"

import { userApi } from "@/lib/user-api"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// ============================================================================
// Preferences Errors
// ============================================================================

/**
 * Error during preferences API operations
 */
export class PreferencesError extends Data.TaggedClass("PreferencesError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

const STORAGE_KEY = "scrolltunes-preferences"

export const MIN_FONT_SIZE = 16
export const MAX_FONT_SIZE = 48
export const FONT_SIZE_STEP = 2
export const DEFAULT_FONT_SIZE = 34

export const LYRICS_MIN_FONT_SIZE = 14
export const LYRICS_MAX_FONT_SIZE = 32
export const LYRICS_FONT_SIZE_STEP = 2
export const LYRICS_DEFAULT_FONT_SIZE = 20

/**
 * Activation mode for voice detection
 * - vad_energy: Uses Silero VAD + Energy AND-gate (default, reliable)
 * - singing: Uses MediaPipe YAMNet singing classifier (experimental, fewer false positives)
 */
export type ActivationMode = "vad_energy" | "singing"

/**
 * VAD environment preset for adjusting voice detection sensitivity
 * - quiet: Lower threshold, faster detection - for quiet rooms
 * - normal: Balanced settings - for most situations
 * - noisy: Higher threshold, slower detection - better noise rejection
 */
export type VadEnvironment = "quiet" | "normal" | "noisy"

/**
 * Configuration for the singing detector (MediaPipe YAMNet)
 */
export interface SingingDetectorConfig {
  readonly startThreshold: number // Probability threshold to start triggering (default: 0.90)
  readonly stopThreshold: number // Probability threshold to stop (hysteresis, default: 0.60)
  readonly holdMs: number // Duration above threshold before triggering (default: 400)
  readonly cooldownMs: number // Cooldown after trigger before re-triggering (default: 1500)
  readonly emaAlpha: number // Exponential moving average smoothing factor (default: 0.2)
  readonly hopMs: number // Hop between classifications (default: 200)
  readonly windowMs: number // Audio window for classification (default: 975)
  readonly rejectSpeech: boolean // Treat speech as non-singing (default: true)
  readonly speechMax: number // Max speech probability to allow singing (default: 0.6)
  readonly debug: boolean // Show debug info (default: false)
}

export const DEFAULT_SINGING_DETECTOR_CONFIG: SingingDetectorConfig = {
  startThreshold: 0.9,
  stopThreshold: 0.6,
  holdMs: 400,
  cooldownMs: 1500,
  emaAlpha: 0.2,
  hopMs: 200,
  windowMs: 975,
  rejectSpeech: true,
  speechMax: 0.6,
  debug: false,
}

export interface Preferences {
  readonly wakeLockEnabled: boolean
  readonly doubleTapEnabled: boolean
  readonly shakeToRestartEnabled: boolean
  readonly metronomeEnabled: boolean
  readonly fontSize: number
  readonly activationMode: ActivationMode
  readonly vadEnvironment: VadEnvironment
  readonly singingDetectorConfig: SingingDetectorConfig
  readonly lyricsShowChords: boolean
  readonly lyricsFontSize: number
}

const DEFAULT_PREFERENCES: Preferences = {
  wakeLockEnabled: true,
  doubleTapEnabled: true,
  shakeToRestartEnabled: false,
  metronomeEnabled: true,
  fontSize: DEFAULT_FONT_SIZE,
  activationMode: "vad_energy",
  vadEnvironment: "normal",
  singingDetectorConfig: DEFAULT_SINGING_DETECTOR_CONFIG,
  lyricsShowChords: false,
  lyricsFontSize: LYRICS_DEFAULT_FONT_SIZE,
}

export class PreferencesStore {
  private listeners = new Set<() => void>()
  private state: Preferences = DEFAULT_PREFERENCES
  private hasLocalData = false
  private initialized = false

  constructor() {
    this.loadFromStorage()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Preferences => this.state

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
        const parsed = JSON.parse(stored) as Partial<Preferences>
        this.state = { ...DEFAULT_PREFERENCES, ...parsed }
        this.hasLocalData = true
      }
    } catch {
      // Failed to load from localStorage
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
      this.hasLocalData = true
    } catch {
      // Failed to save to localStorage
    }
  }

  private syncToServer(): void {
    userApi.put("/api/user/preferences", { preferences: this.state })
  }

  private setState(partial: Partial<Preferences>): void {
    this.state = { ...this.state, ...partial }
    this.saveToStorage()
    this.syncToServer()
    this.notify()
  }

  private readonly initializeEffect: Effect.Effect<void, PreferencesError> = Effect.gen(
    this,
    function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch("/api/user/preferences"),
        catch: cause => new PreferencesError({ operation: "initialize", cause }),
      })

      if (!response.ok) {
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ preferences: Partial<Preferences> | null }>,
        catch: cause => new PreferencesError({ operation: "initialize", cause }),
      })

      if (data?.preferences) {
        this.state = { ...DEFAULT_PREFERENCES, ...data.preferences }
        this.saveToStorage()
        this.notify()
      }
    },
  )

  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    if (this.hasLocalData) return

    Effect.runFork(this.initializeEffect.pipe(Effect.ignore))
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.state[key]
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.setState({ [key]: value })
  }

  getWakeLockEnabled(): boolean {
    return this.state.wakeLockEnabled
  }

  setWakeLockEnabled(value: boolean): void {
    this.setState({ wakeLockEnabled: value })
  }

  getDoubleTapEnabled(): boolean {
    return this.state.doubleTapEnabled
  }

  setDoubleTapEnabled(value: boolean): void {
    this.setState({ doubleTapEnabled: value })
  }

  getShakeToRestartEnabled(): boolean {
    return this.state.shakeToRestartEnabled
  }

  setShakeToRestartEnabled(value: boolean): void {
    this.setState({ shakeToRestartEnabled: value })
  }

  getMetronomeEnabled(): boolean {
    return this.state.metronomeEnabled
  }

  setMetronomeEnabled(value: boolean): void {
    this.setState({ metronomeEnabled: value })
  }

  getFontSize(): number {
    return this.state.fontSize
  }

  setFontSize(value: number): void {
    this.setState({ fontSize: value })
  }

  getActivationMode(): ActivationMode {
    return this.state.activationMode
  }

  setActivationMode(value: ActivationMode): void {
    this.setState({ activationMode: value })
  }

  getVadEnvironment(): VadEnvironment {
    return this.state.vadEnvironment
  }

  setVadEnvironment(value: VadEnvironment): void {
    this.setState({ vadEnvironment: value })
  }

  getSingingDetectorConfig(): SingingDetectorConfig {
    return this.state.singingDetectorConfig
  }

  setSingingDetectorConfig(config: Partial<SingingDetectorConfig>): void {
    this.setState({
      singingDetectorConfig: { ...this.state.singingDetectorConfig, ...config },
    })
  }

  getScoreBookShowChords(): boolean {
    return this.state.lyricsShowChords
  }

  setScoreBookShowChords(value: boolean): void {
    this.setState({ lyricsShowChords: value })
  }

  getScoreBookFontSize(): number {
    return this.state.lyricsFontSize
  }

  setScoreBookFontSize(value: number): void {
    const clamped = Math.max(LYRICS_MIN_FONT_SIZE, Math.min(LYRICS_MAX_FONT_SIZE, value))
    this.setState({ lyricsFontSize: clamped })
  }

  reset(): void {
    this.state = DEFAULT_PREFERENCES
    this.saveToStorage()
    this.notify()
  }
}

export const preferencesStore = new PreferencesStore()

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    () => DEFAULT_PREFERENCES,
  )
}

export function usePreference<K extends keyof Preferences>(key: K): Preferences[K] {
  const preferences = usePreferences()
  return preferences[key]
}
