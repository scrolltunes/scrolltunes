"use client"

import {
  DEFAULT_VAD_CONFIG,
  INITIAL_VAD_RUNTIME,
  type VADConfig,
  type VADRuntimeState,
  computeRMSFromByteFrequency,
  detectBurst,
  detectVoiceActivity,
  isInBurstWindow,
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

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  if (process.env.NODE_ENV !== "production") return true
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const isNotProduction = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
  return isDev || isNotProduction
}

const DEV_VAD_LOGS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_VAD_LOGS === "true"

function vadLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isDevMode() || !DEV_VAD_LOGS_ENABLED) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[VAD ${timestamp}] [${category}] ${message}${dataStr}`)

  queueServerVADLog({
    category,
    message,
    isoTime: new Date().toISOString(),
    ...(data ? { data } : {}),
  })
}

type ServerVADLogEntry = {
  readonly category: string
  readonly message: string
  readonly data?: Record<string, unknown>
  readonly isoTime: string
}

let serverLogQueue: ServerVADLogEntry[] = []
let serverLogFlushTimer: number | null = null

function queueServerVADLog(entry: ServerVADLogEntry): void {
  if (typeof window === "undefined") return
  if (process.env.NODE_ENV === "production") return
  if (!DEV_VAD_LOGS_ENABLED) return

  if (serverLogQueue.length >= 200) {
    serverLogQueue = serverLogQueue.slice(-100)
  }
  serverLogQueue.push(entry)

  if (serverLogFlushTimer !== null) return
  serverLogFlushTimer = window.setTimeout(() => {
    serverLogFlushTimer = null
    flushServerVADLogs()
  }, 250)
}

function flushServerVADLogs(): void {
  if (typeof window === "undefined") return
  if (serverLogQueue.length === 0) return

  const entries = serverLogQueue
  serverLogQueue = []

  const body = JSON.stringify({ entries })

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon("/api/dev/vad-log", new Blob([body], { type: "application/json" }))
    if (ok) return
  }

  void fetch("/api/dev/vad-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    serverLogQueue = entries.slice(-100).concat(serverLogQueue).slice(-200)
  })
}

function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
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
  private pendingSileroStartAt: number | null = null

  // Energy-based fallback / parallel monitoring
  private analyser: AnalyserNode | null = null
  private animationFrameId: number | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private runtime: VADRuntimeState = INITIAL_VAD_RUNTIME

  // Energy gate for Silero AND-gate (both must agree for voice start)
  private isEnergySpeaking = false
  private andGateEnabled = true

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

  setAndGateEnabled(enabled: boolean): void {
    this.andGateEnabled = enabled
    vadLog("CONFIG", `AND-gate ${enabled ? "enabled" : "disabled"}`)
  }

  isAndGateEnabled(): boolean {
    return this.andGateEnabled
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

      const initEffect = Effect.mapError(
        this.sileroEngine.initialize(this.sileroConfig, {
          onSpeechStart: () => {
            if (!this.state.isListening) return // Guard against ghost events

            const now = Date.now()
            const smoothedNow = this.smoothedSileroLevel

            // Check burst window (guitar transient detected)
            if (isInBurstWindow(this.runtime, now)) {
              vadLog("SILERO", "Speech start ignored - in burst window (likely guitar)", {
                burstUntil: this.runtime.burstDetectedUntil,
              })
              return
            }

            // Require smoothed probability to clear threshold; otherwise defer and wait
            if (smoothedNow < this.sileroConfig.positiveSpeechThreshold) {
              this.pendingSileroStartAt = this.pendingSileroStartAt ?? now
              vadLog("SILERO", "Speech start deferred - smoothed below threshold", {
                level: smoothedNow.toFixed(3),
                threshold: this.sileroConfig.positiveSpeechThreshold,
              })
              return
            }

            // AND-gate: require energy VAD to also detect speech (can be disabled for voice search)
            if (this.andGateEnabled && !this.isEnergySpeaking) {
              const overrideThreshold = this.sileroConfig.positiveSpeechThreshold
              const now = Date.now()
              this.pendingSileroStartAt = this.pendingSileroStartAt ?? now
              const smoothedOverride = this.smoothedSileroLevel >= overrideThreshold
              if (this.pendingSileroStartAt === null) {
                this.pendingSileroStartAt = now
              }
              // If smoothed already exceeds threshold, note the high-confidence defer
              if (smoothedOverride) {
                vadLog("SILERO", "Speech start deferred (smoothed above threshold, waiting energy)", {
                  level: this.smoothedSileroLevel.toFixed(3),
                  overrideThreshold: overrideThreshold.toFixed(3),
                })
              } else {
                vadLog("SILERO", "Speech start deferred (smoothed below threshold, waiting energy)", {
                  level: this.smoothedSileroLevel.toFixed(3),
                  overrideThreshold: overrideThreshold.toFixed(3),
                })
              }
              return
            }

            vadLog("SILERO", "🎤 SPEECH START detected (all gates passed)", {
              threshold: this.sileroConfig.positiveSpeechThreshold,
              level: this.smoothedSileroLevel.toFixed(3),
              energySpeaking: this.isEnergySpeaking,
            })
            Effect.runPromise(Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void))
          },
          onSpeechEnd: () => {
            if (!this.state.isListening) return
            vadLog("SILERO", "🔇 SPEECH END detected", {
              threshold: this.sileroConfig.negativeSpeechThreshold,
            })
            this.pendingSileroStartAt = null
            Effect.runSync(this.dispatch(new VoiceStop({})))
          },
          onFrameProcessed: ({ isSpeech }) => {
            if (!this.state.isListening) return

            this.smoothedSileroLevel = smoothLevel(this.smoothedSileroLevel, isSpeech, 0.3)

            // Throttle level/log updates to ~20 FPS to avoid noisy spam
            const now = Date.now()
            if (now - this.lastSileroLevelUpdateAt < 50) return
            this.lastSileroLevelUpdateAt = now

            // Log significant probability values for tuning
            if (isSpeech > 0.3) {
              vadLog("FRAME", `Speech probability: ${isSpeech.toFixed(3)}`, {
                smoothed: this.smoothedSileroLevel.toFixed(3),
                threshold: this.sileroConfig.positiveSpeechThreshold,
                wouldTrigger: isSpeech >= this.sileroConfig.positiveSpeechThreshold,
              })
            }

            // Release deferred start once energy gate catches up and probability stays high
            if (this.pendingSileroStartAt !== null) {
              const age = now - this.pendingSileroStartAt
              const shouldRelease =
                this.isEnergySpeaking &&
                !isInBurstWindow(this.runtime, now) &&
                this.smoothedSileroLevel >= this.sileroConfig.positiveSpeechThreshold &&
                age <= 600

              // Preroll release: allow high raw probability with moderate smoothed to start immediately
              const prerelease =
                this.isEnergySpeaking &&
                !isInBurstWindow(this.runtime, now) &&
                isSpeech >= 0.95 &&
                this.smoothedSileroLevel >= 0.75

              if (shouldRelease) {
                this.pendingSileroStartAt = null
                vadLog("SILERO", "Speech start released after energy gate opened", {
                  level: this.smoothedSileroLevel.toFixed(3),
                  threshold: this.sileroConfig.positiveSpeechThreshold,
                })
                Effect.runPromise(Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void))
              } else if (prerelease) {
                this.pendingSileroStartAt = null
                vadLog("SILERO", "Speech start preroll release (high raw prob)", {
                  raw: isSpeech.toFixed(3),
                  smoothed: this.smoothedSileroLevel.toFixed(3),
                  threshold: this.sileroConfig.positiveSpeechThreshold,
                })
                Effect.runPromise(Effect.catchAll(this.dispatch(new VoiceStart({})), () => Effect.void))
              } else if (age > 600) {
                this.pendingSileroStartAt = null
              }
            }

            Effect.runSync(this.dispatch(new UpdateLevel({ level: this.smoothedSileroLevel })))
          },
        }),
        e => new VADError({ cause: e }),
      )

      yield* _(initEffect)

      const startEffect = Effect.mapError(
        this.sileroEngine.start(),
        e => new VADError({ cause: e }),
      )

      yield* _(startEffect)

      vadLog("SILERO", "✅ Silero VAD started successfully")

      // Start energy monitoring in parallel for AND-gate
      yield* _(
        Effect.catchAll(this.startEnergyMonitoring(), e => {
          vadLog("SILERO", "⚠️ Energy monitoring failed to start, AND-gate disabled", {
            error: String(e),
          })
          // Set isEnergySpeaking to true so Silero works alone if energy monitoring fails
          this.isEnergySpeaking = true
          return Effect.void
        }),
      )

      return true
    })
  }

  // --- Energy monitoring for AND-gate (no event dispatching) ---

  private startEnergyMonitoring(): Effect.Effect<void, VADError> {
    return Effect.gen(this, function* (_) {
      vadLog("ENERGY", "Starting energy monitoring for AND-gate...")

      const analyser = yield* _(
        Effect.mapError(soundSystem.getMicrophoneAnalyserEffect, e => new VADError({ cause: e })),
      )

      this.analyser = analyser
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.startEnergyMonitoringLoop()

      vadLog("ENERGY", "✅ Energy monitoring started (AND-gate mode)")
    })
  }

  private startEnergyMonitoringLoop(): void {
    if (this.animationFrameId !== null) return

    const analyze = () => {
      if (!this.analyser || !this.dataArray) return

      this.analyser.getByteFrequencyData(this.dataArray)

      const rms = computeRMSFromByteFrequency(this.dataArray)
      const smoothed = smoothLevel(this.runtime.smoothedLevel, rms, this.config.smoothingFactor)

      const now = Date.now()

      // Run burst detection (guitar transients)
      const burstRuntime = detectBurst(smoothed, this.runtime, this.config, now)

      // Log burst detection
      if (burstRuntime.burstDetectedUntil > this.runtime.burstDetectedUntil) {
        vadLog("BURST", "🎸 Burst detected (likely guitar strum)", {
          peakLevel: burstRuntime.lastPeakLevel.toFixed(3),
          burstUntil: burstRuntime.burstDetectedUntil,
        })
      }

      const prevSpeaking = this.runtime.isSpeaking
      const nextRuntime = detectVoiceActivity(smoothed, burstRuntime, this.config, now)

      this.runtime = nextRuntime

      // Update isEnergySpeaking for AND-gate, but do NOT dispatch VoiceStart/VoiceStop
      if (prevSpeaking !== nextRuntime.isSpeaking) {
        this.isEnergySpeaking = nextRuntime.isSpeaking
        if (!this.isEnergySpeaking) {
          this.pendingSileroStartAt = null
        }
        vadLog("ENERGY-GATE", `Energy speaking state: ${this.isEnergySpeaking}`, {
          level: smoothed.toFixed(3),
          threshold: this.config.thresholdOn,
          inBurstWindow: isInBurstWindow(this.runtime, now),
        })
      }

      if (this.state.isListening) {
        this.animationFrameId = requestAnimationFrame(analyze)
      }
    }

    this.animationFrameId = requestAnimationFrame(analyze)
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

      vadLog("START", "Starting voice detection...", {
        permissionStatus: this.state.permissionStatus,
      })

      // Try Silero first
      const sileroStarted = yield* _(
        Effect.catchAll(this.tryStartSilero(), e => {
          vadLog("SILERO", "⚠️ Silero VAD failed to start, falling back to energy-based", {
            error: formatErrorForLog(e),
            cause: formatErrorForLog(e.cause),
            causeTag:
              e.cause && typeof e.cause === "object" && "_tag" in e.cause
                ? String((e.cause as { _tag?: unknown })._tag)
                : null,
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

    // Stop energy-based / monitoring
    this.stopAnalysisLoop()
    soundSystem.stopMicrophone()
    this.analyser = null
    this.dataArray = null
    this.isEnergySpeaking = false

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
    vadLog("CLIENT", "startListening() called (promise resolved)")
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
    this.isEnergySpeaking = false
    this.andGateEnabled = true
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
    setAndGateEnabled: (enabled: boolean) => voiceActivityStore.setAndGateEnabled(enabled),
    isAndGateEnabled: () => voiceActivityStore.isAndGateEnabled(),
  }
}
