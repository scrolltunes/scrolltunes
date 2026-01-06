/**
 * ActivationController - Manages activation detectors and integrates with preferences
 *
 * This controller:
 * 1. Reads activationMode from PreferencesStore
 * 2. Instantiates the correct detector (VadEnergy or MediaPipeSinging)
 * 3. Wires trigger events to subscribers
 * 4. Handles switching modes when settings change
 */

"use client"

import { type ActivationMode, type SingingDetectorConfig, preferencesStore } from "@/core"
import { useSyncExternalStore } from "react"
import { MediaPipeSingingDetector } from "./MediaPipeSingingDetector"
import { VadEnergyDetector } from "./VadEnergyDetector"
import type { ActivationDetector, DetectorEvent, DetectorState } from "./types"

export interface ActivationState {
  readonly isListening: boolean
  readonly isSinging: boolean
  readonly level: number
  readonly detectorState: DetectorState
  readonly activationMode: ActivationMode
  readonly lastProbability: { pSinging: number; pSpeech?: number } | null
}

const INITIAL_STATE: ActivationState = {
  isListening: false,
  isSinging: false,
  level: 0,
  detectorState: "idle",
  activationMode: "vad_energy",
  lastProbability: null,
}

/**
 * ActivationController manages the lifecycle of activation detectors
 */
export class ActivationController {
  private listeners = new Set<() => void>()
  private triggerListeners = new Set<() => void>()
  private state: ActivationState = INITIAL_STATE
  private detector: ActivationDetector | null = null
  private detectorUnsubscribe: (() => void) | null = null
  private preferencesUnsubscribe: (() => void) | null = null

  constructor() {
    // Subscribe to preferences changes
    this.preferencesUnsubscribe = preferencesStore.subscribe(() => {
      const newMode = preferencesStore.getActivationMode()
      const newConfig = preferencesStore.getSingingDetectorConfig()

      if (newMode !== this.state.activationMode) {
        this.handleModeChange(newMode, newConfig)
      } else if (this.detector instanceof MediaPipeSingingDetector) {
        // Update config for singing detector
        this.detector.updateConfig(newConfig)
      }
    })

    // Initialize with current mode
    this.state = {
      ...INITIAL_STATE,
      activationMode: preferencesStore.getActivationMode(),
    }
  }

  // --- Observable pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ActivationState => this.state

  subscribeToTrigger = (listener: () => void): (() => void) => {
    this.triggerListeners.add(listener)
    return () => this.triggerListeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private notifyTrigger(): void {
    for (const listener of this.triggerListeners) {
      listener()
    }
  }

  private setState(partial: Partial<ActivationState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  // --- Public methods ---

  async startListening(): Promise<void> {
    if (this.state.isListening) return

    const mode = preferencesStore.getActivationMode()
    const config = preferencesStore.getSingingDetectorConfig()

    this.detector = this.createDetector(mode, config)
    this.subscribeToDetector()

    try {
      await this.detector.start()
      this.setState({
        isListening: true,
        activationMode: mode,
      })
    } catch (error) {
      console.error("[ActivationController] Failed to start listening:", error)
      this.detector = null
      throw error
    }
  }

  stopListening(): void {
    if (!this.state.isListening || !this.detector) return

    this.detectorUnsubscribe?.()
    this.detectorUnsubscribe = null

    this.detector.stop()
    this.detector.dispose()
    this.detector = null

    this.setState({
      isListening: false,
      isSinging: false,
      level: 0,
      detectorState: "idle",
      lastProbability: null,
    })
  }

  getActivationMode(): ActivationMode {
    return this.state.activationMode
  }

  isListening(): boolean {
    return this.state.isListening
  }

  isSinging(): boolean {
    return this.state.isSinging
  }

  getLevel(): number {
    return this.state.level
  }

  dispose(): void {
    this.stopListening()
    this.preferencesUnsubscribe?.()
    this.listeners.clear()
    this.triggerListeners.clear()
  }

  // --- Private methods ---

  private createDetector(mode: ActivationMode, config: SingingDetectorConfig): ActivationDetector {
    switch (mode) {
      case "singing":
        return new MediaPipeSingingDetector(config)
      default:
        return new VadEnergyDetector()
    }
  }

  private subscribeToDetector(): void {
    if (!this.detector) return

    this.detectorUnsubscribe = this.detector.onEvent((event: DetectorEvent) => {
      this.handleDetectorEvent(event)
    })
  }

  private handleDetectorEvent(event: DetectorEvent): void {
    switch (event.type) {
      case "state":
        this.setState({
          detectorState: event.state,
          isSinging: event.state === "triggered",
        })
        break

      case "probability":
        this.setState({
          level: event.pSinging,
          lastProbability:
            event.pSpeech !== undefined
              ? { pSinging: event.pSinging, pSpeech: event.pSpeech }
              : { pSinging: event.pSinging },
        })
        break

      case "trigger":
        this.setState({ isSinging: true })
        this.notifyTrigger()
        break

      case "error":
        console.error("[ActivationController] Detector error:", event.error)
        break
    }
  }

  private async handleModeChange(
    newMode: ActivationMode,
    newConfig: SingingDetectorConfig,
  ): Promise<void> {
    const wasListening = this.state.isListening

    // Stop current detector
    if (wasListening) {
      this.stopListening()
    }

    // Update mode
    this.setState({ activationMode: newMode })

    // Restart with new mode if was listening
    if (wasListening) {
      try {
        await this.startListening()
      } catch (error) {
        console.error("[ActivationController] Failed to restart with new mode:", error)
      }
    }
  }
}

// --- Singleton instance ---

export const activationController = new ActivationController()

// --- React hooks ---

export function useActivationState(): ActivationState {
  return useSyncExternalStore(
    activationController.subscribe,
    activationController.getSnapshot,
    () => INITIAL_STATE,
  )
}

export function useIsActivationListening(): boolean {
  const state = useActivationState()
  return state.isListening
}

export function useIsSinging(): boolean {
  const state = useActivationState()
  return state.isSinging
}

export function useActivationLevel(): number {
  const state = useActivationState()
  return state.level
}

export function useActivationControls() {
  return {
    startListening: () => activationController.startListening(),
    stopListening: () => activationController.stopListening(),
    getActivationMode: () => activationController.getActivationMode(),
  }
}
