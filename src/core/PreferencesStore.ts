"use client"

import { useSyncExternalStore } from "react"

import { accountStore } from "./AccountStore"

const STORAGE_KEY = "scrolltunes-preferences"

export const MIN_FONT_SIZE = 16
export const MAX_FONT_SIZE = 48
export const FONT_SIZE_STEP = 2
export const DEFAULT_FONT_SIZE = 34

export type ThemeMode = "system" | "light" | "dark"

export interface Preferences {
  readonly wakeLockEnabled: boolean
  readonly doubleTapEnabled: boolean
  readonly shakeToRestartEnabled: boolean
  readonly autoHideControlsMs: number
  readonly distractionFreeMode: boolean
  readonly themeMode: ThemeMode
  readonly metronomeEnabled: boolean
  readonly fontSize: number
}

const DEFAULT_PREFERENCES: Preferences = {
  wakeLockEnabled: true,
  doubleTapEnabled: true,
  shakeToRestartEnabled: false,
  autoHideControlsMs: 0,
  distractionFreeMode: false,
  themeMode: "dark",
  metronomeEnabled: true,
  fontSize: DEFAULT_FONT_SIZE,
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

  private async syncToServer(): Promise<void> {
    if (!accountStore.isAuthenticated()) return

    try {
      await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: this.state }),
      })
    } catch {
      // Failed to sync to server
    }
  }

  private setState(partial: Partial<Preferences>): void {
    this.state = { ...this.state, ...partial }
    this.saveToStorage()
    this.syncToServer()
    this.notify()
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    if (this.hasLocalData) return

    try {
      const response = await fetch("/api/user/preferences")
      if (response.ok) {
        const data = (await response.json()) as { preferences: Partial<Preferences> | null }
        if (data.preferences) {
          this.state = { ...DEFAULT_PREFERENCES, ...data.preferences }
          this.saveToStorage()
          this.notify()
        }
      }
    } catch {
      // Failed to fetch from server
    }
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

  getAutoHideControlsMs(): number {
    return this.state.autoHideControlsMs
  }

  setAutoHideControlsMs(value: number): void {
    this.setState({ autoHideControlsMs: value })
  }

  getDistractionFreeMode(): boolean {
    return this.state.distractionFreeMode
  }

  setDistractionFreeMode(value: boolean): void {
    this.setState({ distractionFreeMode: value })
  }

  getThemeMode(): ThemeMode {
    return this.state.themeMode
  }

  setThemeMode(value: ThemeMode): void {
    this.setState({ themeMode: value })
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
