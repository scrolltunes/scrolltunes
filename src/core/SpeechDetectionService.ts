"use client"

import { type SileroPreset, type SileroVADConfig, getPresetConfig } from "@/lib/silero-vad-config"
import { loadPublicConfig } from "@/services/public-config"
import { SoundSystemLive, SoundSystemService } from "@/services/sound-system"
import type { AudioError } from "@/sounds"
import { Context, Data, Effect, Layer } from "effect"
import { useSyncExternalStore } from "react"
import { type SileroLoadError, SileroVADEngine } from "./SileroVADEngine"
import type {
  MicPermissionStatus,
  VoiceDetectionService,
  VoiceDetectionState,
} from "./VoiceDetectionService"

// --- Type Re-exports ---

export type { MicPermissionStatus, VoiceDetectionService, VoiceDetectionState }

// --- Types ---

/**
 * SpeechDetectionState - Simple voice detection state for speech/utterance detection
 */
export interface SpeechDetectionState extends VoiceDetectionState {}

// --- Events ---

export class SpeechStart extends Data.TaggedClass("SpeechStart")<object> {}
export class SpeechStop extends Data.TaggedClass("SpeechStop")<object> {}
export class SpeechUpdateLevel extends Data.TaggedClass("SpeechUpdateLevel")<{
  readonly level: number
}> {}

export type SpeechEvent = SpeechStart | SpeechStop | SpeechUpdateLevel

export class SpeechDetectionError extends Data.TaggedClass("SpeechDetectionError")<{
  readonly cause: AudioError | SileroLoadError
}> {}

// --- Logging ---

const publicConfig = loadPublicConfig()

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  if (publicConfig.nodeEnv !== "production") return true
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const isNotProduction = publicConfig.vercelEnv !== "production"
  return isDev || isNotProduction
}

function speechLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isDevMode()) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[SPEECH-VAD ${timestamp}] [${category}] ${message}${dataStr}`)
}

function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

// --- Effect Service ---

export class SpeechDetectionService extends Context.Tag("SpeechDetectionService")<
  SpeechDetectionService,
  {
    readonly startListening: Effect.Effect<void, SpeechDetectionError>
    readonly stopListening: Effect.Effect<void, never>
    readonly getState: Effect.Effect<SpeechDetectionState, never>
    readonly subscribeToVoiceEvents: (listener: () => void) => Effect.Effect<() => void, never>
  }
>() {}

// --- SpeechDetectionStore Class ---

/**
 * SpeechDetectionStore - Simple voice detection for speech/utterance detection
 *
 * Uses Silero VAD only (no energy AND-gate).
 * Simpler and faster for end-of-utterance detection in voice search.
 */
class SpeechDetectionStore implements VoiceDetectionService<SpeechDetectionState> {
  private listeners = new Set<() => void>()
  private voiceListeners = new Set<() => void>()

  private state: SpeechDetectionState = {
    isListening: false,
    isSpeaking: false,
    level: 0,
    lastSpeakingAt: null,
    permissionDenied: false,
    permissionStatus: "unknown",
  }

  private sileroConfig: SileroVADConfig = getPresetConfig("voice-search")
  private sileroEngine: SileroVADEngine | null = null
  private smoothedLevel = 0

  private runSyncWithSoundSystem<T, E>(
    effect: Effect.Effect<T, E, SoundSystemService>,
  ): T {
    return Effect.runSync(effect.pipe(Effect.provide(SoundSystemLive)) as Effect.Effect<T, E, never>)
  }

  private readonly stopMicrophoneEffect: Effect.Effect<void, never, SoundSystemService> =
    SoundSystemService.pipe(Effect.flatMap(({ stopMicrophone }) => stopMicrophone))

  // --- Observable pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeToVoiceEvents = (listener: () => void): (() => void) => {
    this.voiceListeners.add(listener)
    return () => this.voiceListeners.delete(listener)
  }

  getSnapshot = (): SpeechDetectionState => this.state

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

  private setState(partial: Partial<SpeechDetectionState>): void {
    const previousSpeaking = this.state.isSpeaking
    this.state = { ...this.state, ...partial }
    this.notify()

    if (previousSpeaking !== this.state.isSpeaking) {
      this.notifyVoiceEvent()
    }
  }

  setSileroConfig(config: Partial<SileroVADConfig>): void {
    this.sileroConfig = { ...this.sileroConfig, ...config }
    speechLog("CONFIG", "Silero config updated", config)
  }

  setSileroPreset(preset: SileroPreset): void {
    this.sileroConfig = getPresetConfig(preset)
    speechLog("CONFIG", `Silero preset changed to: ${preset}`, {
      positiveSpeechThreshold: this.sileroConfig.positiveSpeechThreshold,
      negativeSpeechThreshold: this.sileroConfig.negativeSpeechThreshold,
      minSpeechMs: this.sileroConfig.minSpeechMs,
      redemptionMs: this.sileroConfig.redemptionMs,
    })
  }

  getSileroConfig(): SileroVADConfig {
    return this.sileroConfig
  }

  // --- Event dispatch ---

  readonly dispatch = (event: SpeechEvent): Effect.Effect<void, SpeechDetectionError, never> => {
    return Effect.sync(() => {
      switch (event._tag) {
        case "SpeechStart":
          this.handleSpeechStart()
          break
        case "SpeechStop":
          this.handleSpeechStop()
          break
        case "SpeechUpdateLevel":
          this.handleUpdateLevel(event.level)
          break
      }
    })
  }

  private handleSpeechStart(): void {
    speechLog("SPEECH", "🎤 Speech started")
    this.setState({
      isSpeaking: true,
      lastSpeakingAt: Date.now(),
    })
  }

  private handleSpeechStop(): void {
    speechLog("SPEECH", "🔇 Speech ended")
    this.setState({ isSpeaking: false })
  }

  private handleUpdateLevel(level: number): void {
    this.setState({ level })
  }

  // --- Silero VAD ---

  private startSilero(): Effect.Effect<void, SpeechDetectionError, never> {
    return Effect.gen(this, function* (_) {
      if (!SileroVADEngine.isSupported()) {
        yield* _(
          Effect.fail(
            new SpeechDetectionError({
              cause: {
                _tag: "SileroLoadError",
                message: "AudioWorklet not supported",
              } as SileroLoadError,
            }),
          ),
        )
        return
      }

      speechLog("SILERO", "Initializing Silero VAD engine...", {
        threshold: this.sileroConfig.positiveSpeechThreshold,
        minSpeechMs: this.sileroConfig.minSpeechMs,
        redemptionMs: this.sileroConfig.redemptionMs,
      })

      this.sileroEngine = new SileroVADEngine()

      const initEffect = Effect.mapError(
        this.sileroEngine.initialize(this.sileroConfig, {
          onSpeechStart: () => {
            if (!this.state.isListening) return
            speechLog("SILERO", "🎤 SPEECH START detected", {
              threshold: this.sileroConfig.positiveSpeechThreshold,
              level: this.smoothedLevel.toFixed(3),
            })
            Effect.runSync(this.dispatch(new SpeechStart({})))
          },
          onSpeechEnd: () => {
            if (!this.state.isListening) return
            speechLog("SILERO", "🔇 SPEECH END detected", {
              threshold: this.sileroConfig.negativeSpeechThreshold,
            })
            Effect.runSync(this.dispatch(new SpeechStop({})))
          },
          onFrameProcessed: ({ isSpeech }) => {
            if (!this.state.isListening) return
            this.smoothedLevel = this.smoothedLevel * 0.7 + isSpeech * 0.3
            Effect.runSync(this.dispatch(new SpeechUpdateLevel({ level: this.smoothedLevel })))
          },
        }),
        e => new SpeechDetectionError({ cause: e }),
      )

      yield* _(initEffect)

      const startEffect = Effect.mapError(
        this.sileroEngine.start(),
        e => new SpeechDetectionError({ cause: e }),
      )

      yield* _(startEffect)

      speechLog("SILERO", "✅ Silero VAD started successfully")
    })
  }

  // --- Public API ---

  readonly startListeningEffect: Effect.Effect<void, SpeechDetectionError, never> = Effect.gen(
    this,
    function* (_) {
      if (this.state.isListening) return

      speechLog("START", "Starting speech detection...", {
        permissionStatus: this.state.permissionStatus,
      })

      yield* _(this.startSilero())
      this.setState({ isListening: true })
      speechLog("START", "Speech detection started")
    },
  )

  readonly stopListeningEffect: Effect.Effect<void, never, never> = Effect.sync(() => {
    speechLog("STOP", "Stopping speech detection...")

    if (this.sileroEngine) {
      this.sileroEngine.destroy()
      this.sileroEngine = null
      this.smoothedLevel = 0
    }

    this.runSyncWithSoundSystem(this.stopMicrophoneEffect)

    this.setState({
      isListening: false,
      isSpeaking: false,
      level: 0,
    })

    speechLog("STOP", "Speech detection stopped")
  })

  // --- Convenience methods ---

  async startListening(): Promise<void> {
    await Effect.runPromise(
      Effect.catchAll(this.startListeningEffect, e => {
        console.error("Failed to start speech detection:", e)
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
    speechLog("CLIENT", "startListening() called (promise resolved)")
  }

  stopListening(): void {
    Effect.runSync(this.stopListeningEffect)
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
  }

  reset(): void {
    speechLog("RESET", "Resetting SpeechDetectionStore")

    if (this.sileroEngine) {
      this.sileroEngine.destroy()
      this.sileroEngine = null
      this.smoothedLevel = 0
    }

    this.runSyncWithSoundSystem(this.stopMicrophoneEffect)
    this.sileroConfig = getPresetConfig("normal")
    this.state = {
      isListening: false,
      isSpeaking: false,
      level: 0,
      lastSpeakingAt: null,
      permissionDenied: false,
      permissionStatus: this.state.permissionStatus,
    }
    this.notify()
  }

  async checkPermission(): Promise<MicPermissionStatus> {
    if (typeof navigator === "undefined" || !navigator.permissions) {
      speechLog("PERMISSION", "Permissions API not available")
      return "unknown"
    }

    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName })
      const status = result.state as MicPermissionStatus
      speechLog("PERMISSION", `Microphone permission: ${status}`)
      this.setState({ permissionStatus: status, permissionDenied: status === "denied" })

      result.onchange = () => {
        const newStatus = result.state as MicPermissionStatus
        speechLog("PERMISSION", `Permission changed to: ${newStatus}`)
        this.setState({ permissionStatus: newStatus, permissionDenied: newStatus === "denied" })
      }

      return status
    } catch (error) {
      speechLog("PERMISSION", "Failed to query permission", { error: formatErrorForLog(error) })
      return "unknown"
    }
  }

  async requestPermission(): Promise<boolean> {
    speechLog("PERMISSION", "Requesting microphone permission...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) {
        track.stop()
      }
      this.setState({ permissionStatus: "granted", permissionDenied: false })
      speechLog("PERMISSION", "Permission granted")
      return true
    } catch (error) {
      speechLog("PERMISSION", "Permission denied or error", { error: formatErrorForLog(error) })
      this.setState({ permissionStatus: "denied", permissionDenied: true })
      return false
    }
  }

  getPermissionStatus(): MicPermissionStatus {
    return this.state.permissionStatus
  }
}

// --- Singleton instance ---

export const speechDetectionStore = new SpeechDetectionStore()

// --- Layer ---

export const SpeechDetectionLive = Layer.succeed(SpeechDetectionService, {
  startListening: speechDetectionStore.startListeningEffect,
  stopListening: speechDetectionStore.stopListeningEffect,
  getState: Effect.sync(() => speechDetectionStore.getSnapshot()),
  subscribeToVoiceEvents: (listener: () => void) =>
    Effect.sync(() => speechDetectionStore.subscribeToVoiceEvents(listener)),
})

// --- React hooks ---

export function useSpeechDetection(): SpeechDetectionState {
  return useSyncExternalStore(
    speechDetectionStore.subscribe,
    speechDetectionStore.getSnapshot,
    speechDetectionStore.getSnapshot,
  )
}

export function useSpeechDetectionControls() {
  return {
    startListening: () => speechDetectionStore.startListening(),
    stopListening: () => speechDetectionStore.stopListening(),
    setSileroPreset: (preset: SileroPreset) => speechDetectionStore.setSileroPreset(preset),
    setSileroConfig: (config: Partial<SileroVADConfig>) =>
      speechDetectionStore.setSileroConfig(config),
    checkPermission: () => speechDetectionStore.checkPermission(),
    requestPermission: () => speechDetectionStore.requestPermission(),
    getPermissionStatus: () => speechDetectionStore.getPermissionStatus(),
  }
}
