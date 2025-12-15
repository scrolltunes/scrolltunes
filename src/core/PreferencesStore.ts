"use client"

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "scrolltunes-preferences"

export type ThemeMode = "system" | "light" | "dark"

export interface Preferences {
  readonly wakeLockEnabled: boolean
  readonly doubleTapEnabled: boolean
  readonly shakeToRestartEnabled: boolean
  readonly autoHideControlsMs: number
  readonly distractionFreeMode: boolean
  readonly themeMode: ThemeMode
}

const DEFAULT_PREFERENCES: Preferences = {
  wakeLockEnabled: true,
  doubleTapEnabled: true,
  shakeToRestartEnabled: false,
  autoHideControlsMs: 0,
  distractionFreeMode: false,
  themeMode: "dark",
}

export class PreferencesStore {
  private listeners = new Set<() => void>()
  private state: Preferences = DEFAULT_PREFERENCES

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
      }
    } catch {
      console.warn("Failed to load preferences from localStorage")
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      console.warn("Failed to save preferences to localStorage")
    }
  }

  private setState(partial: Partial<Preferences>): void {
    this.state = { ...this.state, ...partial }
    this.saveToStorage()
    this.notify()
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
