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
import { type SileroLoadError, SileroVADEngine } from "./SileroVADEngine"

export type { VADConfig } from "@/lib"
export type { SileroPreset, SileroVADConfig } from "@/lib/silero-vad-config"

// --- Types ---

type VADEngineType = "silero" | "energy"

/**
 * Microphone permission status
 */
export type MicPermissionStatus = "unknown" | "granted" | "denied" | "prompt"

/**
 * Voice activity state
 */
export interface VoiceState {
  readonly isListening: boolean
  readonly isSpeaking: boolean
  readonly level: number // 0-1, smoothed energy level
  readonly lastSpeakingAt: number | null // timestamp
  readonly permissionDenied: boolean
  readonly permissionStatus: MicPermissionStatus
  readonly engine: VADEngineType // which engine is active
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
  readonly cause: AudioError | SileroLoadError
}> {}

// --- Logging Configuration ---

const VAD_DEBUG = true // Set to false to disable logging

function vadLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!VAD_DEBUG) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[VAD ${timestamp}] [${category}] ${message}${dataStr}`)
}

// --- VoiceActivityStore Class ---

/**
 * VoiceActivityStore - Manages voice activity detection
 *
 * Uses Silero VAD as primary engine with energy-based fallback.
 * Provides reactive state via useSyncExternalStore.
 */
export class VoiceActivityStore {
  private listeners = new Set<() => void>()
  private voiceListeners = new Set<() => void>()

  private state: VoiceState = {
    isListening: false,
    isSpeaking: false,
    level: 0,
    lastSpeakingAt: null,
    permissionDenied: false,
    permissionStatus: "unknown",
    engine: "energy",
  }

  private config: VADConfig = DEFAULT_VAD_CONFIG
  private sileroConfig: SileroVADConfig = DEFAULT_SILERO_VAD_CONFIG

  // Silero VAD engine
  private sileroEngine: SileroVADEngine | null = null
  private lastSileroLevelUpdateAt = 0
  private smoothedSileroLevel = 0

  // Energy-based fallback
  private analyser: AnalyserNode | null = null
  private animationFrameId: number | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private runtime: VADRuntimeState = INITIAL_VAD_RUNTIME

  // --- Observable pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): VoiceState => this.state

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

    if (previousSpeaking !== this.state.isSpeaking) {
      this.notifyVoiceEvent()
    }
  }

  setConfig(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): VADConfig {
    return this.config
  }

  setSileroConfig(config: Partial<SileroVADConfig>): void {
    this.sileroConfig = { ...this.sileroConfig, ...config }
    vadLog("CONFIG", "Silero config updated", config)
  }

  setSileroPreset(preset: SileroPreset): void {
    this.sileroConfig = getPresetConfig(preset)
    vadLog("CONFIG", `Silero preset changed to: ${preset}`, {
      positiveSpeechThreshold: this.sileroConfig.positiveSpeechThreshold,
      negativeSpeechThreshold: this.sileroConfig.negativeSpeechThreshold,
      minSpeechMs: this.sileroConfig.minSpeechMs,
      redemptionMs: this.sileroConfig.redemptionMs,
    })
  }

  getSileroConfig(): SileroVADConfig {
    return this.sileroConfig
  }

  getEngine(): VADEngineType {
    return this.state.engine
  }

  // --- Event handlers ---

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

  // --- Silero VAD integration ---

  private tryStartSilero(): Effect.Effect<boolean, VADError> {
    return Effect.gen(this, function* (_) {
      if (!SileroVADEngine.isSupported()) {
        vadLog("SILERO", "AudioWorklet not supported, skipping Silero VAD")
        return false
      }

      vadLog("SILERO", "Initializing Silero VAD engine...", {
        threshold: this.sileroConfig.positiveSpeechThreshold,
        minSpeechMs: this.sileroConfig.minSpeechMs,
      })

      this.sileroEngine = new SileroVADEngine()

      yield* _(
        Effect.mapError(
          this.sileroEngine.initialize(this.sileroConfig, {
            onSpeechStart: () => {
              if (!this.state.isListening) return // Guard against ghost events
              vadLog("SILERO", "🎤 SPEECH START detected", {
                threshold: this.sileroConfig.positiveSpeechThreshold,
                level: this.smoothedSileroLevel.toFixed(3),
              })
              Effect.runPromise(
                Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void),
              )
            },
            onSpeechEnd: () => {
              if (!this.state.isListening) return
              vadLog("SILERO", "🔇 SPEECH END detected", {
                threshold: this.sileroConfig.negativeSpeechThreshold,
              })
              Effect.runSync(this.dispatch(new VoiceStop({})))
            },
            onFrameProcessed: ({ isSpeech }) => {
              if (!this.state.isListening) return

              // Throttle level updates to 50ms
              const now = Date.now()
              if (now - this.lastSileroLevelUpdateAt < 50) return
              this.lastSileroLevelUpdateAt = now

              // Exponential smoothing
              this.smoothedSileroLevel = smoothLevel(this.smoothedSileroLevel, isSpeech, 0.3)

              // Log significant probability values for tuning
              if (isSpeech > 0.3) {
                vadLog("FRAME", `Speech probability: ${isSpeech.toFixed(3)}`, {
                  smoothed: this.smoothedSileroLevel.toFixed(3),
                  threshold: this.sileroConfig.positiveSpeechThreshold,
                  wouldTrigger: isSpeech >= this.sileroConfig.positiveSpeechThreshold,
                })
              }

              Effect.runSync(this.dispatch(new UpdateLevel({ level: this.smoothedSileroLevel })))
            },
          }),
          e => new VADError({ cause: e }),
        ),
      )

      yield* _(Effect.mapError(this.sileroEngine.start(), e => new VADError({ cause: e })))

      vadLog("SILERO", "✅ Silero VAD started successfully")
      return true
    })
  }

  // --- Energy-based fallback ---

  private startEnergyFallback(): Effect.Effect<void, VADError> {
    return Effect.gen(this, function* (_) {
      vadLog("ENERGY", "Starting energy-based VAD fallback...")

      const analyser = yield* _(
        Effect.mapError(soundSystem.getMicrophoneAnalyserEffect, e => new VADError({ cause: e })),
      )

      this.analyser = analyser
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.startAnalysisLoop()

      vadLog("ENERGY", "✅ Energy-based VAD started")
    })
  }

  private readonly startListeningEffect: Effect.Effect<void, VADError> = Effect.gen(
    this,
    function* (_) {
      if (this.state.isListening) return

      vadLog("START", "Starting voice detection...")

      // Try Silero first
      const sileroStarted = yield* _(
        Effect.catchAll(this.tryStartSilero(), e => {
          vadLog("SILERO", "⚠️ Silero VAD failed to start, falling back to energy-based", {
            error: String(e),
          })
          return Effect.succeed(false)
        }),
      )

      if (sileroStarted) {
        this.setState({ isListening: true, engine: "silero" })
        vadLog("START", "Using Silero VAD engine")
        return
      }

      // Fallback to energy-based
      yield* _(this.startEnergyFallback())
      this.setState({ isListening: true, engine: "energy" })
      vadLog("START", "Using energy-based VAD engine (fallback)")
    },
  )

  private handleStopListening(): void {
    vadLog("STOP", "Stopping voice detection...", { engine: this.state.engine })

    // Stop Silero
    if (this.sileroEngine) {
      this.sileroEngine.destroy()
      this.sileroEngine = null
      this.smoothedSileroLevel = 0
      this.lastSileroLevelUpdateAt = 0
    }

    // Stop energy-based
    this.stopAnalysisLoop()
    soundSystem.stopMicrophone()
    this.analyser = null
    this.dataArray = null

    this.setState({
      isListening: false,
      isSpeaking: false,
      level: 0,
      engine: "energy",
    })

    vadLog("STOP", "Voice detection stopped")
  }

  private readonly handleVoiceStartEffect: Effect.Effect<void, VADError> = Effect.gen(
    this,
    function* (_) {
      vadLog("VOICE", "🎤 Voice activity started", { engine: this.state.engine })
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
    vadLog("VOICE", "🔇 Voice activity stopped", { engine: this.state.engine })
    this.setState({ isSpeaking: false })
  }

  private handleUpdateLevel(level: number): void {
    this.setState({ level })
  }

  // --- Energy-based analysis loop ---

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

      // Log significant energy levels
      if (smoothed > 0.1) {
        vadLog("ENERGY-FRAME", `RMS level: ${smoothed.toFixed(3)}`, {
          threshold: this.config.thresholdOn,
          wouldTrigger: smoothed >= this.config.thresholdOn,
        })
      }

      if (now - this.runtime.lastStateChangeTime > 50 || prevSpeaking !== nextRuntime.isSpeaking) {
        Effect.runSync(this.dispatch(new UpdateLevel({ level: this.runtime.smoothedLevel })))
      }

      if (!prevSpeaking && nextRuntime.isSpeaking) {
        vadLog("ENERGY", "🎤 Energy threshold crossed - voice start")
        Effect.runPromise(Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void))
      } else if (prevSpeaking && !nextRuntime.isSpeaking) {
        vadLog("ENERGY", "🔇 Energy threshold crossed - voice stop")
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

  async startListening(): Promise<void> {
    await Effect.runPromise(
      Effect.catchAll(this.startListeningEffect, e => {
        console.error("Failed to start listening:", e)
        if (
          e.cause &&
          "cause" in e.cause &&
          e.cause.cause &&
          (e.cause.cause as { _tag?: string })._tag === "MicPermissionDenied"
        ) {
          this.setState({ permissionDenied: true })
        }
        return Effect.void
      }),
    )
  }

  stopListening(): void {
    Effect.runSync(this.dispatch(new StopListening({})))
  }

  isSpeaking(): boolean {
    return this.state.isSpeaking
  }

  getLevel(): number {
    return this.state.level
  }

  dispose(): void {
    this.reset()
    this.listeners.clear()
    this.voiceListeners.clear()
  }

  reset(): void {
    vadLog("RESET", "Resetting VoiceActivityStore")

    // Stop Silero
    if (this.sileroEngine) {
      this.sileroEngine.destroy()
      this.sileroEngine = null
      this.smoothedSileroLevel = 0
      this.lastSileroLevelUpdateAt = 0
    }

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
      permissionStatus: this.state.permissionStatus, // Preserve permission status
      engine: "energy",
    }
    this.notify()
  }

  /**
   * Check microphone permission status using navigator.permissions API
   * Updates state.permissionStatus and returns the status
   */
  async checkPermission(): Promise<MicPermissionStatus> {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      vadLog("PERMISSION", "Permissions API not available")
      return "unknown"
    }

    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName })
      const status = result.state as MicPermissionStatus
      vadLog("PERMISSION", `Microphone permission: ${status}`)
      this.setState({ permissionStatus: status, permissionDenied: status === "denied" })

      // Listen for permission changes
      result.onchange = () => {
        const newStatus = result.state as MicPermissionStatus
        vadLog("PERMISSION", `Permission changed to: ${newStatus}`)
        this.setState({ permissionStatus: newStatus, permissionDenied: newStatus === "denied" })
      }

      return status
    } catch (error) {
      vadLog("PERMISSION", "Failed to query permission", { error: String(error) })
      return "unknown"
    }
  }

  /**
   * Request microphone permission by briefly accessing the mic
   * Returns true if permission was granted
   */
  async requestPermission(): Promise<boolean> {
    vadLog("PERMISSION", "Requesting microphone permission...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Immediately stop the stream - we just needed to trigger the permission prompt
      for (const track of stream.getTracks()) {
        track.stop()
      }
      this.setState({ permissionStatus: "granted", permissionDenied: false })
      vadLog("PERMISSION", "Permission granted")
      return true
    } catch (error) {
      vadLog("PERMISSION", "Permission denied or error", { error: String(error) })
      this.setState({ permissionStatus: "denied", permissionDenied: true })
      return false
    }
  }

  getPermissionStatus(): MicPermissionStatus {
    return this.state.permissionStatus
  }
}

// --- Singleton instance ---

export const voiceActivityStore = new VoiceActivityStore()

// --- React hooks ---

export function useVoiceActivity(): VoiceState {
  return useSyncExternalStore(
    voiceActivityStore.subscribe,
    voiceActivityStore.getSnapshot,
    voiceActivityStore.getSnapshot,
  )
}

export function useIsSpeaking(): boolean {
  const state = useVoiceActivity()
  return state.isSpeaking
}

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
    checkPermission: () => voiceActivityStore.checkPermission(),
    requestPermission: () => voiceActivityStore.requestPermission(),
    getPermissionStatus: () => voiceActivityStore.getPermissionStatus(),
  }
}
