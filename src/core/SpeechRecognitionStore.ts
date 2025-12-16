"use client"

import { voiceActivityStore } from "@/core"
import { soundSystem } from "@/sounds"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// --- Types ---

export interface SpeechState {
  readonly isSupported: boolean
  readonly isConnecting: boolean
  readonly isRecording: boolean
  readonly hasAudioPermission: boolean
  readonly isAutoStopping: boolean
  readonly isQuotaAvailable: boolean
  readonly partialTranscript: string
  readonly finalTranscript: string | null
  readonly detectedLanguageCode: string | null
  readonly lastUpdatedAt: number | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
}

// --- Tagged Events ---

export class StartRecognition extends Data.TaggedClass("StartRecognition")<object> {}
export class StopRecognition extends Data.TaggedClass("StopRecognition")<object> {}
export class ReceivePartial extends Data.TaggedClass("ReceivePartial")<{
  readonly text: string
  readonly languageCode: string | null
}> {}
export class ReceiveFinal extends Data.TaggedClass("ReceiveFinal")<{
  readonly text: string
  readonly languageCode: string | null
}> {}
export class SetSpeechError extends Data.TaggedClass("SetSpeechError")<{
  readonly code: string
  readonly message: string
}> {}
export class QuotaExceeded extends Data.TaggedClass("QuotaExceeded")<object> {}

export type SpeechEvent =
  | StartRecognition
  | StopRecognition
  | ReceivePartial
  | ReceiveFinal
  | SetSpeechError
  | QuotaExceeded

// --- Error types ---

export class SpeechRecognitionError extends Data.TaggedClass("SpeechRecognitionError")<{
  readonly code: string
  readonly message: string
}> {}

// --- Logging Configuration ---

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
}

function speechLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isDevMode()) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[SPEECH ${timestamp}] [${category}] ${message}${dataStr}`)
}

// --- Constants ---

const MAX_RECORDING_DURATION_MS = 10000
const SAMPLE_RATE = 16000

// --- SpeechRecognitionStore Class ---

export class SpeechRecognitionStore {
  private listeners = new Set<() => void>()

  private state: SpeechState = {
    isSupported: typeof window !== "undefined" && typeof navigator !== "undefined",
    isConnecting: false,
    isRecording: false,
    hasAudioPermission: false,
    isAutoStopping: false,
    isQuotaAvailable: true,
    partialTranscript: "",
    finalTranscript: null,
    detectedLanguageCode: null,
    lastUpdatedAt: null,
    errorCode: null,
    errorMessage: null,
  }

  // Audio capture
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []

  // Max duration timeout
  private maxDurationTimeoutId: ReturnType<typeof setTimeout> | null = null

  // VAD integration
  private hasDetectedSpeech = false
  private vadUnsubscribe: (() => void) | null = null

  // --- Observable pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SpeechState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<SpeechState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  // --- Quota checking ---

  private quotaCheckPromise: Promise<boolean> | null = null
  private lastQuotaCheckAt = 0
  private static readonly QUOTA_CHECK_COOLDOWN_MS = 30000 // 30 seconds

  async checkQuota(): Promise<boolean> {
    const now = Date.now()

    // Return cached result if checked recently
    if (now - this.lastQuotaCheckAt < SpeechRecognitionStore.QUOTA_CHECK_COOLDOWN_MS) {
      return this.state.isQuotaAvailable
    }

    // Deduplicate concurrent requests
    if (this.quotaCheckPromise) {
      return this.quotaCheckPromise
    }

    this.quotaCheckPromise = this.doCheckQuota()
    try {
      return await this.quotaCheckPromise
    } finally {
      this.quotaCheckPromise = null
    }
  }

  private async doCheckQuota(): Promise<boolean> {
    try {
      const response = await fetch("/api/voice-search/quota")
      this.lastQuotaCheckAt = Date.now()

      if (!response.ok) {
        speechLog("QUOTA", "Failed to check quota", { status: response.status })
        this.setState({ isQuotaAvailable: false })
        return false
      }

      const data = (await response.json()) as { available?: boolean }
      const isAvailable = data.available ?? false
      if (!isAvailable) {
        speechLog("QUOTA", "Quota exhausted")
      }
      this.setState({ isQuotaAvailable: isAvailable })
      return isAvailable
    } catch (e) {
      speechLog("QUOTA", "Error checking quota", { error: String(e) })
      // On error, assume available to not block the user
      return true
    }
  }

  async initialize(): Promise<void> {
    // No-op - quota is checked lazily when needed
  }

  // --- Event dispatch ---

  readonly dispatch = (event: SpeechEvent): Effect.Effect<void, SpeechRecognitionError> => {
    switch (event._tag) {
      case "StartRecognition":
        return this.startRecognitionEffect
      case "StopRecognition":
        return Effect.sync(() => this.handleStopRecognition())
      case "ReceivePartial":
        return Effect.sync(() => this.handleReceivePartial(event.text, event.languageCode))
      case "ReceiveFinal":
        return Effect.sync(() => this.handleReceiveFinal(event.text, event.languageCode))
      case "SetSpeechError":
        return Effect.sync(() => this.handleSetError(event.code, event.message))
      case "QuotaExceeded":
        return Effect.sync(() => this.handleQuotaExceeded())
    }
  }

  private handleQuotaExceeded(): void {
    speechLog("QUOTA", "Quota exceeded")
    this.setState({
      isQuotaAvailable: false,
      errorCode: "QUOTA_EXCEEDED",
      errorMessage: "Voice search quota exceeded",
      isConnecting: false,
      isRecording: false,
    })
  }

  // --- Start recognition ---

  private readonly startRecognitionEffect: Effect.Effect<void, SpeechRecognitionError> = Effect.gen(
    this,
    function* (_) {
      if (this.state.isRecording || this.state.isConnecting) {
        speechLog("START", "Already recording or connecting, ignoring")
        return
      }

      speechLog("START", "Checking quota before starting...")
      const isQuotaAvailable = yield* _(
        Effect.tryPromise({
          try: () => this.checkQuota(),
          catch: () =>
            new SpeechRecognitionError({
              code: "QUOTA_CHECK_ERROR",
              message: "Failed to check quota",
            }),
        }),
      )

      if (!isQuotaAvailable) {
        speechLog("START", "Quota not available, dispatching QuotaExceeded")
        this.handleQuotaExceeded()
        return
      }

      speechLog("START", "Starting speech recognition...")
      this.setState({
        isConnecting: true,
        errorCode: null,
        errorMessage: null,
        partialTranscript: "",
        finalTranscript: null,
      })

      // Get microphone access via SoundSystem
      const analyser = yield* _(
        Effect.mapError(
          soundSystem.getMicrophoneAnalyserEffect,
          () =>
            new SpeechRecognitionError({
              code: "MIC_ERROR",
              message: "Failed to access microphone",
            }),
        ),
      )

      if (!analyser) {
        yield* _(
          Effect.fail(
            new SpeechRecognitionError({
              code: "MIC_ERROR",
              message: "No microphone analyser available",
            }),
          ),
        )
        return
      }

      this.setState({ hasAudioPermission: true })

      // Set up audio capture using MediaRecorder
      yield* _(this.setupAudioCapture())

      // Set up max duration auto-stop
      this.setupMaxDurationTimeout()

      // Set up VAD for voice-based auto-stop
      yield* _(Effect.promise(() => this.setupVADIntegration()))

      this.setState({
        isConnecting: false,
        isRecording: true,
        lastUpdatedAt: Date.now(),
      })

      speechLog("START", "Speech recognition started")
    },
  )

  private setupAudioCapture(): Effect.Effect<void, SpeechRecognitionError> {
    return Effect.tryPromise({
      try: async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: SAMPLE_RATE,
          },
        })

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: this.getSupportedMimeType(),
        })

        this.audioChunks = []

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data)
          }
        }

        this.mediaRecorder.start()

        speechLog("AUDIO", "Audio capture started", {
          mimeType: this.mediaRecorder.mimeType,
        })
      },
      catch: (e) =>
        new SpeechRecognitionError({
          code: "AUDIO_CAPTURE_ERROR",
          message: `Failed to set up audio capture: ${String(e)}`,
        }),
    })
  }

  private getSupportedMimeType(): string {
    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ]

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType
      }
    }

    return "audio/webm"
  }

  private async sendFinalAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      speechLog("AUDIO", "No audio chunks to send")
      return
    }

    const audioBlob = new Blob(this.audioChunks, {
      type: this.mediaRecorder?.mimeType ?? "audio/webm",
    })

    // Convert blob to base64 (browser-compatible)
    const base64Audio = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64 = dataUrl.split(",")[1] ?? ""
        resolve(base64)
      }
      reader.readAsDataURL(audioBlob)
    })

    speechLog("AUDIO", "Sending audio for transcription", {
      size: audioBlob.size,
      type: audioBlob.type,
    })

    try {
      const response = await fetch("/api/voice-search/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Audio,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        speechLog("API", "Transcription failed", { status: response.status, error: errorText })
        return
      }

      const data = (await response.json()) as { transcript?: string; languageCode?: string }
      if (data.transcript) {
        Effect.runSync(
          this.dispatch(
            new ReceiveFinal({
              text: data.transcript,
              languageCode: data.languageCode ?? null,
            }),
          ),
        )
      } else {
        speechLog("API", "No transcript in response", data)
      }
    } catch (e) {
      speechLog("API", "Failed to send audio", { error: String(e) })
    }
  }

  private setupMaxDurationTimeout(): void {
    this.clearMaxDurationTimeout()

    this.maxDurationTimeoutId = setTimeout(() => {
      if (this.state.isRecording) {
        speechLog("TIMEOUT", "Max recording duration reached, auto-stopping")
        this.setState({ isAutoStopping: true })
        this.handleStopRecognition()
      }
    }, MAX_RECORDING_DURATION_MS)
  }

  private clearMaxDurationTimeout(): void {
    if (this.maxDurationTimeoutId !== null) {
      clearTimeout(this.maxDurationTimeoutId)
      this.maxDurationTimeoutId = null
    }
  }

  // --- VAD integration ---

  private async setupVADIntegration(): Promise<void> {
    speechLog("VAD", "Setting up voice activity detection for auto-stop")

    this.hasDetectedSpeech = false

    voiceActivityStore.setSileroPreset("voice-search")
    voiceActivityStore.setAndGateEnabled(false) // Disable AND-gate for voice search (no guitar)

    // Subscribe BEFORE starting listening to catch all events
    let wasSpeaking = false
    this.vadUnsubscribe = voiceActivityStore.subscribeToVoiceEvents(() => {
      const state = voiceActivityStore.getSnapshot()
      speechLog("VAD", "Voice event received", {
        isSpeaking: state.isSpeaking,
        wasSpeaking,
        hasDetectedSpeech: this.hasDetectedSpeech,
        isRecording: this.state.isRecording,
      })

      if (state.isSpeaking && !wasSpeaking) {
        speechLog("VAD", "Voice activity detected - speech started")
        this.hasDetectedSpeech = true
        this.clearMaxDurationTimeout()
      } else if (!state.isSpeaking && wasSpeaking && this.hasDetectedSpeech) {
        speechLog("VAD", "Voice activity stopped after speech - auto-stopping recording")
        this.setState({ isAutoStopping: true })
        this.handleStopRecognition()
      }

      wasSpeaking = state.isSpeaking
    })

    // Start listening after subscription is set up
    await voiceActivityStore.startListening()
    speechLog("VAD", "VAD listening started", { isListening: voiceActivityStore.getSnapshot().isListening })
  }

  private cleanupVADIntegration(): void {
    if (this.vadUnsubscribe) {
      this.vadUnsubscribe()
      this.vadUnsubscribe = null
    }

    voiceActivityStore.stopListening()
    voiceActivityStore.setAndGateEnabled(true) // Re-enable AND-gate for normal use
    this.hasDetectedSpeech = false
  }

  // --- Stop recognition ---

  private handleStopRecognition(): void {
    speechLog("STOP", "Stopping speech recognition...")

    // Clear max duration timeout
    this.clearMaxDurationTimeout()

    // Cleanup VAD
    this.cleanupVADIntegration()

    // Stop MediaRecorder and send final audio
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== "inactive") {
        // Set up onstop handler to send audio after all data is collected
        this.mediaRecorder.onstop = () => {
          speechLog("STOP", "MediaRecorder stopped, sending final audio")
          this.sendFinalAudio()
          this.audioChunks = []
        }
        this.mediaRecorder.stop()
      }
      // Stop all tracks
      for (const track of this.mediaRecorder.stream.getTracks()) {
        track.stop()
      }
      this.mediaRecorder = null
    }

    this.setState({
      isConnecting: false,
      isRecording: false,
      isAutoStopping: false,
      lastUpdatedAt: Date.now(),
    })

    speechLog("STOP", "Speech recognition stopped")
  }

  // --- Receive transcripts ---

  private handleReceivePartial(text: string, languageCode: string | null): void {
    speechLog("PARTIAL", "Received partial transcript", { text, languageCode })
    this.setState({
      partialTranscript: text,
      detectedLanguageCode: languageCode,
      lastUpdatedAt: Date.now(),
    })
  }

  private handleReceiveFinal(text: string, languageCode: string | null): void {
    speechLog("FINAL", "Received final transcript", { text, languageCode })
    this.setState({
      partialTranscript: "",
      finalTranscript: text,
      detectedLanguageCode: languageCode,
      lastUpdatedAt: Date.now(),
    })
  }

  // --- Error handling ---

  private handleSetError(code: string, message: string): void {
    speechLog("ERROR", `Error: ${code}`, { message })
    this.setState({
      errorCode: code,
      errorMessage: message,
      isConnecting: false,
      isRecording: false,
      lastUpdatedAt: Date.now(),
    })
  }

  // --- Convenience methods ---

  async start(): Promise<void> {
    await Effect.runPromise(
      Effect.catchAll(this.dispatch(new StartRecognition({})), (e) => {
        this.setState({
          errorCode: e.code,
          errorMessage: e.message,
          isConnecting: false,
          isRecording: false,
        })
        return Effect.void
      }),
    )
  }

  stop(): void {
    Effect.runSync(this.dispatch(new StopRecognition({})))
  }

  clearError(): void {
    this.setState({
      errorCode: null,
      errorMessage: null,
    })
  }

  clearTranscript(): void {
    this.setState({
      partialTranscript: "",
      finalTranscript: null,
    })
  }

  reset(): void {
    speechLog("RESET", "Resetting SpeechRecognitionStore")
    this.handleStopRecognition()
    this.setState({
      isSupported: typeof window !== "undefined" && typeof navigator !== "undefined",
      isConnecting: false,
      isRecording: false,
      hasAudioPermission: false,
      isAutoStopping: false,
      isQuotaAvailable: true,
      partialTranscript: "",
      finalTranscript: null,
      detectedLanguageCode: null,
      lastUpdatedAt: null,
      errorCode: null,
      errorMessage: null,
    })
  }

  dispose(): void {
    this.reset()
    this.listeners.clear()
  }
}

// --- Singleton instance ---

export const speechRecognitionStore = new SpeechRecognitionStore()

// --- React hooks ---

const DEFAULT_STATE: SpeechState = {
  isSupported: false,
  isConnecting: false,
  isRecording: false,
  hasAudioPermission: false,
  isAutoStopping: false,
  isQuotaAvailable: true,
  partialTranscript: "",
  finalTranscript: null,
  detectedLanguageCode: null,
  lastUpdatedAt: null,
  errorCode: null,
  errorMessage: null,
}

export function useSpeechState(): SpeechState {
  return useSyncExternalStore(
    speechRecognitionStore.subscribe,
    speechRecognitionStore.getSnapshot,
    () => DEFAULT_STATE,
  )
}

export function useSpeechControls() {
  return {
    start: () => speechRecognitionStore.start(),
    stop: () => speechRecognitionStore.stop(),
    clearError: () => speechRecognitionStore.clearError(),
    clearTranscript: () => speechRecognitionStore.clearTranscript(),
    reset: () => speechRecognitionStore.reset(),
    checkQuota: () => speechRecognitionStore.checkQuota(),
    initialize: () => speechRecognitionStore.initialize(),
  }
}

export function useIsQuotaAvailable(): boolean {
  const state = useSpeechState()
  return state.isQuotaAvailable
}
