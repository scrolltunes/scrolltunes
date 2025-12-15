"use client"

import { Effect, Data } from "effect"
import { useSyncExternalStore } from "react"
import { soundSystem } from "@/sounds"

// --- Types ---

/**
 * Voice activity state
 */
export interface VoiceState {
  readonly isListening: boolean
  readonly isSpeaking: boolean
  readonly level: number // 0-1, smoothed energy level
  readonly lastSpeakingAt: number | null // timestamp
}

/**
 * VAD configuration
 */
export interface VADConfig {
  readonly thresholdOn: number // Energy threshold to trigger "speaking"
  readonly thresholdOff: number // Energy threshold to trigger "silent" (hysteresis)
  readonly holdTimeMs: number // Minimum time before state change
  readonly smoothingFactor: number // 0-1, for exponential smoothing
}

/**
 * VAD events
 */
export class StartListening extends Data.TaggedClass("StartListening")<object> {}
export class StopListening extends Data.TaggedClass("StopListening")<object> {}
export class VoiceStart extends Data.TaggedClass("VoiceStart")<object> {}
export class VoiceStop extends Data.TaggedClass("VoiceStop")<object> {}
export class UpdateLevel extends Data.TaggedClass("UpdateLevel")<{ readonly level: number }> {}

export type VADEvent = StartListening | StopListening | VoiceStart | VoiceStop | UpdateLevel

// --- Default config ---

const DEFAULT_CONFIG: VADConfig = {
  thresholdOn: 0.15,
  thresholdOff: 0.08,
  holdTimeMs: 150,
  smoothingFactor: 0.3,
}

// --- VoiceActivityStore Class ---

/**
 * VoiceActivityStore - Manages voice activity detection
 *
 * Uses the SoundSystem for microphone access and provides
 * reactive state via useSyncExternalStore.
 */
export class VoiceActivityStore {
  private listeners = new Set<() => void>()
  private voiceListeners = new Set<() => void>() // Separate listeners for voice events

  private state: VoiceState = {
    isListening: false,
    isSpeaking: false,
    level: 0,
    lastSpeakingAt: null,
  }

  private config: VADConfig = DEFAULT_CONFIG
  private analyser: AnalyserNode | null = null
  private animationFrameId: number | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null

  // Hysteresis state
  private lastStateChangeTime = 0
  private smoothedLevel = 0

  // --- Observable pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): VoiceState => this.state

  /**
   * Subscribe to voice start/stop events only
   */
  subscribeToVoiceEvents = (listener: () => void): (() => void) => {
    this.voiceListeners.add(listener)
    return () => this.voiceListeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private notifyVoiceEvent(): void {
    for (const listener of this.voiceListeners) {
      listener()
    }
  }

  // --- State management ---

  private setState(partial: Partial<VoiceState>): void {
    const previousSpeaking = this.state.isSpeaking
    this.state = { ...this.state, ...partial }
    this.notify()

    // Notify voice event listeners on speaking state change
    if (previousSpeaking !== this.state.isSpeaking) {
      this.notifyVoiceEvent()
    }
  }

  /**
   * Update VAD configuration
   */
  setConfig(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): VADConfig {
    return this.config
  }

  // --- Event handlers ---

  readonly dispatch = (event: VADEvent): Effect.Effect<void> => {
    return Effect.sync(() => {
      switch (event._tag) {
        case "StartListening":
          this.handleStartListening()
          break
        case "StopListening":
          this.handleStopListening()
          break
        case "VoiceStart":
          this.handleVoiceStart()
          break
        case "VoiceStop":
          this.handleVoiceStop()
          break
        case "UpdateLevel":
          this.handleUpdateLevel(event.level)
          break
      }
    })
  }

  private async handleStartListening(): Promise<void> {
    if (this.state.isListening) return

    this.analyser = await soundSystem.getMicrophoneAnalyser()
    if (!this.analyser) {
      console.error("Failed to get microphone analyser")
      return
    }

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
    this.setState({ isListening: true })
    this.startAnalysisLoop()
  }

  private handleStopListening(): void {
    this.stopAnalysisLoop()
    soundSystem.stopMicrophone()
    this.analyser = null
    this.dataArray = null
    this.setState({
      isListening: false,
      isSpeaking: false,
      level: 0,
    })
  }

  private handleVoiceStart(): void {
    this.setState({
      isSpeaking: true,
      lastSpeakingAt: Date.now(),
    })
    // Play a subtle sound to confirm detection
    soundSystem.playVoiceDetected().catch(() => {})
  }

  private handleVoiceStop(): void {
    this.setState({ isSpeaking: false })
  }

  private handleUpdateLevel(level: number): void {
    this.setState({ level })
  }

  // --- Analysis loop ---

  private startAnalysisLoop(): void {
    if (this.animationFrameId !== null) return

    const analyze = () => {
      if (!this.analyser || !this.dataArray) return

      // Get frequency data
      this.analyser.getByteFrequencyData(this.dataArray)

      // Calculate RMS energy
      let sum = 0
      for (let i = 0; i < this.dataArray.length; i++) {
        const value = (this.dataArray[i] ?? 0) / 255
        sum += value * value
      }
      const rms = Math.sqrt(sum / this.dataArray.length)

      // Exponential smoothing
      this.smoothedLevel =
        this.config.smoothingFactor * rms + (1 - this.config.smoothingFactor) * this.smoothedLevel

      // Update level (throttled to avoid too many updates)
      const now = Date.now()
      if (now - this.lastStateChangeTime > 50) {
        // 20Hz update rate
        Effect.runSync(this.dispatch(new UpdateLevel({ level: this.smoothedLevel })))
      }

      // Voice activity detection with hysteresis
      const timeSinceLastChange = now - this.lastStateChangeTime

      if (!this.state.isSpeaking) {
        // Check if we should start speaking
        if (
          this.smoothedLevel > this.config.thresholdOn &&
          timeSinceLastChange > this.config.holdTimeMs
        ) {
          this.lastStateChangeTime = now
          Effect.runSync(this.dispatch(new VoiceStart({})))
        }
      } else {
        // Check if we should stop speaking
        if (
          this.smoothedLevel < this.config.thresholdOff &&
          timeSinceLastChange > this.config.holdTimeMs
        ) {
          this.lastStateChangeTime = now
          Effect.runSync(this.dispatch(new VoiceStop({})))
        }
      }

      if (this.state.isListening) {
        this.animationFrameId = requestAnimationFrame(analyze)
      }
    }

    this.animationFrameId = requestAnimationFrame(analyze)
  }

  private stopAnalysisLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  // --- Convenience methods ---

  async startListening(): Promise<void> {
    await this.handleStartListening()
  }

  stopListening(): void {
    Effect.runSync(this.dispatch(new StopListening({})))
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.state.isSpeaking
  }

  /**
   * Get current audio level
   */
  getLevel(): number {
    return this.state.level
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopListening()
    this.listeners.clear()
    this.voiceListeners.clear()
  }
}

// --- Singleton instance ---

export const voiceActivityStore = new VoiceActivityStore()

// --- React hooks ---

/**
 * Hook to subscribe to voice activity state
 */
export function useVoiceActivity(): VoiceState {
  return useSyncExternalStore(
    voiceActivityStore.subscribe,
    voiceActivityStore.getSnapshot,
    voiceActivityStore.getSnapshot, // SSR fallback
  )
}

/**
 * Hook to check if speaking (optimized for fewer re-renders)
 */
export function useIsSpeaking(): boolean {
  const state = useVoiceActivity()
  return state.isSpeaking
}

/**
 * Hook to get voice detection controls
 */
export function useVoiceControls() {
  return {
    startListening: () => voiceActivityStore.startListening(),
    stopListening: () => voiceActivityStore.stopListening(),
    setConfig: (config: Partial<VADConfig>) => voiceActivityStore.setConfig(config),
    getConfig: () => voiceActivityStore.getConfig(),
  }
}
