"use client"

import { useSyncExternalStore } from "react"

export type MetronomeMode = "click" | "visual" | "both"

export interface MetronomeState {
  readonly mode: MetronomeMode
  readonly isMuted: boolean
  readonly volume: number
  readonly bpm: number | null
  readonly isRunning: boolean
}

const DEFAULT_STATE: MetronomeState = {
  mode: "both",
  isMuted: false,
  volume: 0.5,
  bpm: null,
  isRunning: false,
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

  start(): void {
    this.setState({ isRunning: true })
  }

  stop(): void {
    this.setState({ isRunning: false })
  }

  setMode(mode: MetronomeMode): void {
    this.setState({ mode })
  }

  setMuted(isMuted: boolean): void {
    this.setState({ isMuted })
  }

  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume))
    this.setState({ volume: clampedVolume })
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
