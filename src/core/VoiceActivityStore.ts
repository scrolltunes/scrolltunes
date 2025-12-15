"use client"

import {
  DEFAULT_VAD_CONFIG,
  INITIAL_VAD_RUNTIME,
  type VADConfig,
  type VADRuntimeState,
  computeRMSFromByteFrequency,
  detectVoiceActivity,
  smoothLevel,
} from "@/lib"
import {
  DEFAULT_SILERO_VAD_CONFIG,
  type SileroPreset,
  type SileroVADConfig,
  getPresetConfig,
} from "@/lib/silero-vad-config"
import { type AudioError, soundSystem } from "@/sounds"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

export type { VADConfig } from "@/lib"
export type { SileroPreset, SileroVADConfig } from "@/lib/silero-vad-config"

// --- Types ---

/**
 * Voice activity state
 */
export interface VoiceState {
  readonly isListening: boolean
  readonly isSpeaking: boolean
  readonly level: number // 0-1, smoothed energy level
  readonly lastSpeakingAt: number | null // timestamp
  readonly permissionDenied: boolean
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

/**
 * VAD error wrapping audio errors with Effect.ts tagged class pattern
 */
export class VADError extends Data.TaggedClass("VADError")<{
  readonly cause: AudioError
}> {}

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
    permissionDenied: false,
  }

  private config: VADConfig = DEFAULT_VAD_CONFIG
  private analyser: AnalyserNode | null = null
  private animationFrameId: number | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null

  private runtime: VADRuntimeState = INITIAL_VAD_RUNTIME
  private sileroConfig: SileroVADConfig = DEFAULT_SILERO_VAD_CONFIG

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

  setSileroConfig(config: Partial<SileroVADConfig>): void {
    this.sileroConfig = { ...this.sileroConfig, ...config }
  }

  setSileroPreset(preset: SileroPreset): void {
    this.sileroConfig = getPresetConfig(preset)
  }

  getSileroConfig(): SileroVADConfig {
    return this.sileroConfig
  }

  getEngine(): "energy" {
    return "energy"
  }

  // --- Event handlers ---

  /**
   * Dispatch a VAD event using Effect.ts pattern
   *
   * All events are handled as Effects for consistent error propagation.
   * Use Effect.runSync for synchronous events (StopListening, VoiceStop, UpdateLevel)
   * and Effect.runPromise for async events (StartListening, VoiceStart).
   */
  readonly dispatch = (event: VADEvent): Effect.Effect<void, VADError> => {
    switch (event._tag) {
      case "StartListening":
        return this.startListeningEffect
      case "StopListening":
        return Effect.sync(() => this.handleStopListening())
      case "VoiceStart":
        return this.handleVoiceStartEffect
      case "VoiceStop":
        return Effect.sync(() => this.handleVoiceStop())
      case "UpdateLevel":
        return Effect.sync(() => this.handleUpdateLevel(event.level))
    }
  }

  private readonly startListeningEffect: Effect.Effect<void, VADError> = Effect.gen(
    this,
    function* (_) {
      if (this.state.isListening) return

      const analyser = yield* _(
        Effect.mapError(soundSystem.getMicrophoneAnalyserEffect, e => new VADError({ cause: e })),
      )

      this.analyser = analyser
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.setState({ isListening: true })
      this.startAnalysisLoop()
    },
  )

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

  private readonly handleVoiceStartEffect: Effect.Effect<void, VADError> = Effect.gen(
    this,
    function* (_) {
      this.setState({
        isSpeaking: true,
        lastSpeakingAt: Date.now(),
      })
      yield* _(
        Effect.catchAll(soundSystem.playVoiceDetectedEffect, () =>
          Effect.logWarning("Failed to play voice detected sound"),
        ),
      )
    },
  )

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

      this.analyser.getByteFrequencyData(this.dataArray)

      const rms = computeRMSFromByteFrequency(this.dataArray)
      const smoothed = smoothLevel(this.runtime.smoothedLevel, rms, this.config.smoothingFactor)

      const now = Date.now()
      const prevSpeaking = this.runtime.isSpeaking
      const nextRuntime = detectVoiceActivity(smoothed, this.runtime, this.config, now)

      this.runtime = nextRuntime

      if (now - this.runtime.lastStateChangeTime > 50 || prevSpeaking !== nextRuntime.isSpeaking) {
        Effect.runSync(this.dispatch(new UpdateLevel({ level: this.runtime.smoothedLevel })))
      }

      if (!prevSpeaking && nextRuntime.isSpeaking) {
        Effect.runPromise(Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void))
      } else if (prevSpeaking && !nextRuntime.isSpeaking) {
        Effect.runSync(this.dispatch(new VoiceStop({})))
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

  /**
   * Start listening for voice activity
   *
   * Runs the Effect-based startListeningEffect with error handling.
   * On MicPermissionDenied, sets permissionDenied state for UI feedback.
   */
  async startListening(): Promise<void> {
    await Effect.runPromise(
      Effect.catchAll(this.startListeningEffect, e => {
        console.error("Failed to start listening:", e)
        if (e.cause && e.cause._tag === "MicPermissionDenied") {
          this.setState({ permissionDenied: true })
        }
        return Effect.void
      }),
    )
  }

  /**
   * Stop listening for voice activity (synchronous cleanup)
   */
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
    this.reset()
    this.listeners.clear()
    this.voiceListeners.clear()
  }

  /**
   * Reset for tests and hot-reload
   */
  reset(): void {
    this.stopAnalysisLoop()
    soundSystem.stopMicrophone()
    this.analyser = null
    this.dataArray = null
    this.config = DEFAULT_VAD_CONFIG
    this.sileroConfig = DEFAULT_SILERO_VAD_CONFIG
    this.runtime = INITIAL_VAD_RUNTIME
    this.state = {
      isListening: false,
      isSpeaking: false,
      level: 0,
      lastSpeakingAt: null,
      permissionDenied: false,
    }
    this.notify()
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
    setSileroPreset: (preset: SileroPreset) => voiceActivityStore.setSileroPreset(preset),
    setSileroConfig: (config: Partial<SileroVADConfig>) =>
      voiceActivityStore.setSileroConfig(config),
    getEngine: () => voiceActivityStore.getEngine(),
  }
}
