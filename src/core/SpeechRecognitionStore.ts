"use client"

import { SttStreamService, sttStreamClient } from "@/lib/stt-stream-client"
import { ClientLayer, type ClientLayerContext } from "@/services/client-layer"
import { loadPublicConfig } from "@/services/public-config"
import { SoundSystemService } from "@/services/sound-system"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"
import { SpeechDetectionService, speechDetectionStore } from "./SpeechDetectionService"

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition
    webkitSpeechRecognition?: typeof SpeechRecognition
  }
}

// --- Types ---

export type SpeechTier = "google_stt" | "webspeech" | null

export interface SpeechState {
  readonly isSupported: boolean
  readonly isConnecting: boolean
  readonly isRecording: boolean
  readonly hasAudioPermission: boolean
  readonly isAutoStopping: boolean
  readonly isQuotaAvailable: boolean
  readonly isWebSpeechAvailable: boolean
  readonly tierUsed: SpeechTier
  readonly partialTranscript: string
  readonly finalTranscript: string | null
  readonly detectedLanguageCode: string | null
  readonly lastUpdatedAt: number | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
  // Silence detection state (for Google STT only mode)
  readonly isSilenceDetectionActive: boolean
  readonly hasSpeechBeenDetected: boolean
  readonly isSilent: boolean
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

const publicConfig = loadPublicConfig()

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const isNotProduction = publicConfig.vercelEnv !== "production"
  return isDev || isNotProduction
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

// --- VAD Configuration ---

interface VADConfig {
  /** Minimum speech duration before silence timer can start (ms) */
  readonly minSpeechMs: number
  /** How long to wait in silence before finalizing (ms) */
  readonly silenceToFinalizeMs: number
  /** Transcript must be stable for this long before finalizing (ms) - stability guard */
  readonly stableTranscriptMs: number
  /** Minimum transcript length before allowing finalize */
  readonly minCharsBeforeFinalize: number
  /** Extension time if transcript is still changing (ms) */
  readonly silenceExtensionMs: number
}

const VAD_PRESETS = {
  /** Fast search - optimized for quick voice queries */
  fast: {
    minSpeechMs: 300,
    silenceToFinalizeMs: 900,
    stableTranscriptMs: 400,
    minCharsBeforeFinalize: 3,
    silenceExtensionMs: 250,
  },
  /** Default - balanced for most environments */
  default: {
    minSpeechMs: 400,
    silenceToFinalizeMs: 1000,
    stableTranscriptMs: 450,
    minCharsBeforeFinalize: 3,
    silenceExtensionMs: 300,
  },
  /** Noisy environment - more conservative to avoid false triggers */
  noisy: {
    minSpeechMs: 500,
    silenceToFinalizeMs: 1200,
    stableTranscriptMs: 500,
    minCharsBeforeFinalize: 5,
    silenceExtensionMs: 350,
  },
} as const satisfies Record<string, VADConfig>

type VADPreset = keyof typeof VAD_PRESETS

// Active VAD config (can be changed at runtime)
let activeVADConfig: VADConfig = VAD_PRESETS.default

export function setVADPreset(preset: VADPreset): void {
  activeVADConfig = VAD_PRESETS[preset]
  speechLog("VAD", "VAD preset changed", { preset, config: activeVADConfig })
}

export function getVADConfig(): VADConfig {
  return activeVADConfig
}

// Confidence thresholds for Web Speech fallback decision
const MIN_TRANSCRIPT_LENGTH = 2
const GARBAGE_CHARS_REGEX = /[^a-zA-Z0-9\s'''-]/g

// Mobile detection pattern
const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod/i

// --- Brave Desktop Detection ---

// Brave exposes navigator.brave on desktop, but mobile Brave uses native OS speech recognition
// which works fine. So we only want to detect desktop Brave. (Implemented as Effect in the store class)

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
    isWebSpeechAvailable: this.checkWebSpeechSupport(),
    tierUsed: null,
    partialTranscript: "",
    finalTranscript: null,
    detectedLanguageCode: null,
    lastUpdatedAt: null,
    errorCode: null,
    errorMessage: null,
    isSilenceDetectionActive: false,
    hasSpeechBeenDetected: false,
    isSilent: false,
  }

  private checkWebSpeechSupport(): boolean {
    if (typeof window === "undefined") return false
    return !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)
  }

  // Audio capture
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []

  // Max duration timeout
  private maxDurationTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Current tier being used for this recognition session
  private currentTier: SpeechTier = null

  // Web Speech API instance (used when tier is "webspeech")
  private webSpeechRecognition: SpeechRecognition | null = null

  // Web Speech transcript (stored for fallback evaluation)
  private webSpeechTranscript: string | null = null
  private webSpeechLanguageCode: string | null = null

  // Skip Web Speech and use Google STT directly (set after network error or Brave desktop detection)
  private useGoogleSTTOnly = false

  // Brave desktop detection (detected once at initialization)
  private isBraveDesktop = false
  private hasBraveDetectionRun = false

  // VAD-based end-of-utterance detection for Google STT only mode
  private vadUnsubscribe: (() => void) | null = null
  private speechStartedAt: number | null = null
  private silenceTimerId: ReturnType<typeof setTimeout> | null = null
  private lastTranscriptChangeAt: number | null = null

  // Streaming STT mode (WebSocket-based)
  private isStreamingMode = false
  private streamingUnsubscribe: (() => void) | null = null
  private audioContext: AudioContext | null = null
  private audioWorkletNode: AudioWorkletNode | null = null
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null
  private streamingMediaStream: MediaStream | null = null

  private runPromiseWithClientLayer<T, E, R extends ClientLayerContext>(
    effect: Effect.Effect<T, E, R>,
  ): Promise<T> {
    return Effect.runPromise(effect.pipe(Effect.provide(ClientLayer)) as Effect.Effect<T, E, never>)
  }

  private runSyncWithClientLayer<T, E, R extends ClientLayerContext>(
    effect: Effect.Effect<T, E, R>,
  ): T {
    return Effect.runSync(effect.pipe(Effect.provide(ClientLayer)) as Effect.Effect<T, E, never>)
  }

  private getMicrophoneAnalyserEffect(): Effect.Effect<
    AnalyserNode,
    SpeechRecognitionError,
    SoundSystemService
  > {
    return SoundSystemService.pipe(
      Effect.flatMap(({ getMicrophoneAnalyser }) =>
        Effect.mapError(
          getMicrophoneAnalyser,
          () =>
            new SpeechRecognitionError({
              code: "MIC_ERROR",
              message: "Failed to access microphone",
            }),
        ),
      ),
    )
  }

  // Brave desktop detection as Effect
  private readonly detectBraveDesktopEffect: Effect.Effect<boolean, never> = Effect.gen(
    function* () {
      if (typeof navigator === "undefined") {
        return false
      }

      const isMobile = MOBILE_UA_REGEX.test(navigator.userAgent)
      if (isMobile) {
        speechLog("DETECT", "Mobile browser detected, Web Speech should work")
        return false
      }

      const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }
      if (nav.brave?.isBrave) {
        const isBrave = yield* Effect.tryPromise({
          try: () => nav.brave?.isBrave?.() ?? Promise.resolve(false),
          catch: () => false as unknown,
        }).pipe(Effect.orElseSucceed(() => false))

        if (isBrave) {
          speechLog("DETECT", "Brave desktop detected, will use Google STT directly")
          return true
        }
      }

      return false
    },
  )

  // Initialize with Brave detection
  private readonly initializeEffect: Effect.Effect<void, never> = Effect.gen(this, function* () {
    if (this.hasBraveDetectionRun) {
      return
    }
    this.hasBraveDetectionRun = true

    const isBrave = yield* this.detectBraveDesktopEffect
    this.isBraveDesktop = isBrave
    if (isBrave) {
      this.useGoogleSTTOnly = true
      speechLog("INIT", "Brave desktop detected, enabling Google STT only mode")
    }
  })

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

  private lastQuotaCheckAt = 0
  private static readonly QUOTA_CHECK_COOLDOWN_MS = 30000 // 30 seconds

  private readonly checkQuotaEffect: Effect.Effect<boolean, never> = Effect.gen(this, function* () {
    const now = Date.now()

    // Return cached result if checked recently
    if (now - this.lastQuotaCheckAt < SpeechRecognitionStore.QUOTA_CHECK_COOLDOWN_MS) {
      return this.state.isQuotaAvailable
    }

    return yield* this.doCheckQuotaEffect
  })

  private readonly doCheckQuotaEffect: Effect.Effect<boolean, never> = Effect.tryPromise({
    try: async () => {
      const response = await fetch("/api/voice-search/quota")

      if (response.status === 401) {
        speechLog("QUOTA", "Unauthorized for quota check")
        return { type: "unauthorized" as const }
      }

      if (!response.ok) {
        speechLog("QUOTA", "Failed to check quota", { status: response.status })
        return { type: "error" as const }
      }

      const data = (await response.json()) as {
        available?: boolean
        webSpeechAvailable?: boolean
      }
      return { type: "success" as const, data }
    },
    catch: e => e,
  }).pipe(
    Effect.flatMap(result => {
      this.lastQuotaCheckAt = Date.now()

      if (result.type === "unauthorized") {
        this.setState({
          isQuotaAvailable: false,
          errorCode: "AUTH_REQUIRED",
          errorMessage: "Sign in to use voice search",
        })
        return Effect.succeed(false)
      }

      if (result.type === "error") {
        this.setState({ isQuotaAvailable: false })
        return Effect.succeed(false)
      }

      const isAvailable = result.data.available ?? false
      const isWebSpeechAvailable = result.data.webSpeechAvailable ?? this.checkWebSpeechSupport()
      if (!isAvailable) {
        speechLog("QUOTA", "Google STT quota exhausted", {
          webSpeechAvailable: isWebSpeechAvailable,
        })
      }
      this.setState({
        isQuotaAvailable: isAvailable,
        isWebSpeechAvailable,
        errorCode: null,
        errorMessage: null,
      })
      return Effect.succeed(isAvailable)
    }),
    Effect.catchAll(e => {
      speechLog("QUOTA", "Error checking quota", { error: String(e) })
      // On error, assume available to not block the user
      return Effect.succeed(true)
    }),
  )

  async checkQuota(): Promise<boolean> {
    return this.runPromiseWithClientLayer(this.checkQuotaEffect)
  }

  async initialize(): Promise<void> {
    await this.runPromiseWithClientLayer(this.initializeEffect)
  }

  // --- Event dispatch ---

  readonly dispatch = (
    event: SpeechEvent,
  ): Effect.Effect<
    void,
    SpeechRecognitionError,
    SoundSystemService | SttStreamService | SpeechDetectionService
  > => {
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

  private readonly startRecognitionEffect: Effect.Effect<
    void,
    SpeechRecognitionError,
    SoundSystemService | SttStreamService | SpeechDetectionService
  > = Effect.gen(this, function* (_) {
    speechLog("START", "startRecognitionEffect called", {
      isRecording: this.state.isRecording,
      isConnecting: this.state.isConnecting,
      currentError: this.state.errorCode,
    })

    if (this.state.isRecording || this.state.isConnecting) {
      speechLog("START", "Already recording or connecting, ignoring")
      return
    }

    // Ensure Brave detection has run
    yield* _(this.initializeEffect)

    // Check if we should use Google STT only (Brave desktop or previous network error)
    const useGoogleSTTOnly = this.useGoogleSTTOnly
    speechLog("START", "Mode check", {
      useGoogleSTTOnly,
      isBraveDesktop: this.isBraveDesktop,
      quotaAvailable: this.state.isQuotaAvailable,
    })

    // For Google STT only mode (Brave desktop), we must check quota first
    if (useGoogleSTTOnly) {
      const quotaAvailable = yield* _(this.checkQuotaEffect)
      if (!quotaAvailable) {
        speechLog("START", "Google STT required but quota not available")
        this.handleSetError("QUOTA_REQUIRED", "Voice search unavailable. Please try again later.")
        return
      }
    }

    // Check if Web Speech is available (primary tier)
    const isWebSpeechAvailable = this.checkWebSpeechSupport()
    speechLog("START", "Web Speech support check", {
      isWebSpeechAvailable,
      hasSpeechRecognition: typeof window !== "undefined" && !!window.SpeechRecognition,
      hasWebkitSpeechRecognition: typeof window !== "undefined" && !!window.webkitSpeechRecognition,
    })

    if (!isWebSpeechAvailable && !useGoogleSTTOnly) {
      speechLog("START", "Web Speech API not available")
      this.handleSetError(
        "WEBSPEECH_NOT_SUPPORTED",
        "Voice search requires a browser with Web Speech API support (Chrome, Edge, Safari)",
      )
      return
    }

    // Pre-check quota for potential fallback (non-blocking)
    if (!useGoogleSTTOnly) {
      void this.runPromiseWithClientLayer(this.checkQuotaEffect)
    }

    const tierName = useGoogleSTTOnly ? "Google STT" : "Web Speech API"
    speechLog("START", `Starting speech recognition with ${tierName}...`)
    this.setState({
      isConnecting: true,
      tierUsed: useGoogleSTTOnly ? "google_stt" : "webspeech",
      errorCode: null,
      errorMessage: null,
      partialTranscript: "",
      finalTranscript: null,
    })

    // Store tier
    this.currentTier = useGoogleSTTOnly ? "google_stt" : "webspeech"
    this.webSpeechTranscript = null
    this.webSpeechLanguageCode = null

    // Get microphone access via SoundSystem
    speechLog("START", "Getting microphone analyser...")
    const analyser = yield* _(this.getMicrophoneAnalyserEffect())
    speechLog("START", "Got microphone analyser", { hasAnalyser: !!analyser })

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
    speechLog("START", "Setting up audio capture...")
    yield* _(this.setupAudioCapture())
    speechLog("START", "Audio capture setup complete")

    // Set up max duration auto-stop (safety net)
    this.setupMaxDurationTimeout()

    // Only start Web Speech if not in Google STT only mode
    if (!useGoogleSTTOnly) {
      speechLog("START", "Setting up Web Speech recognition...")
      this.setupWebSpeechRecognition()
      speechLog("START", "Web Speech recognition setup complete")
    } else {
      // Check if streaming STT is available (WebSocket bridge configured)
      const stt = yield* _(SttStreamService)
      const streamingAvailable = yield* _(stt.isStreamingAvailable)
      speechLog("START", "Checking streaming availability", {
        streamingAvailable,
        sttWsUrl: publicConfig.sttWsUrl,
      })
      if (streamingAvailable) {
        speechLog("START", "Using streaming STT mode (WebSocket)")
        this.isStreamingMode = true
        yield* _(this.startStreamingSTTEffect)
      } else {
        speechLog("START", "Skipping Web Speech, using REST-based Google STT")
        // Start VAD for end-of-utterance detection in Google STT mode
        yield* _(this.startVADDetectionEffect)
      }
    }

    this.setState({
      isConnecting: false,
      isRecording: true,
      lastUpdatedAt: Date.now(),
    })

    speechLog("START", `Speech recognition started with ${tierName}`)
  })

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

        this.mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data)
            speechLog("AUDIO", "Audio chunk received", {
              size: event.data.size,
              totalChunks: this.audioChunks.length,
            })
          }
        }

        // Collect audio chunks every 250ms for reliable capture
        this.mediaRecorder.start(250)

        speechLog("AUDIO", "Audio capture started", {
          mimeType: this.mediaRecorder.mimeType,
          timeslice: 250,
        })
      },
      catch: e =>
        new SpeechRecognitionError({
          code: "AUDIO_CAPTURE_ERROR",
          message: `Failed to set up audio capture: ${String(e)}`,
        }),
    })
  }

  private getSupportedMimeType(): string {
    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType
      }
    }

    return "audio/webm"
  }

  private setupWebSpeechRecognition(): void {
    const SpeechRecognitionClass = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      speechLog("WEBSPEECH", "Web Speech API not available")
      return
    }

    speechLog("WEBSPEECH", "Setting up Web Speech API recognition")

    const recognition = new SpeechRecognitionClass()
    recognition.lang = "en-US"
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      speechLog("WEBSPEECH", "Recognition started")
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1]
      if (result) {
        const alternative = result[0]
        if (alternative) {
          const transcript = alternative.transcript
          const isFinal = result.isFinal

          if (isFinal) {
            speechLog("WEBSPEECH", "Final transcript received", { transcript })
            // Store for fallback evaluation (don't emit final yet - wait for sendFinalAudio)
            this.webSpeechTranscript = transcript
            this.webSpeechLanguageCode = recognition.lang
          } else {
            this.runSyncWithClientLayer(
              this.dispatch(
                new ReceivePartial({
                  text: transcript,
                  languageCode: recognition.lang,
                }),
              ),
            )
          }
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      speechLog("WEBSPEECH", "Recognition error", { error: event.error, message: event.message })

      // On network error, set flag to skip Web Speech next time and show message
      if (event.error === "network") {
        speechLog("WEBSPEECH", "Network error - enabling Google STT only mode for next attempt")
        this.useGoogleSTTOnly = true
        this.cleanupWebSpeechRecognition()
        this.handleStopRecognition()
        // Show helpful message
        this.handleSetError(
          "WEBSPEECH_NETWORK",
          "Voice recognition blocked. Tap again to use alternative service.",
        )
        return
      }

      // Don't fail on no-speech - just means no transcript
      if (event.error !== "no-speech" && event.error !== "aborted") {
        this.runSyncWithClientLayer(
          this.dispatch(
            new SetSpeechError({
              code: `WEBSPEECH_${event.error.toUpperCase().replace(/-/g, "_")}`,
              message: event.message || `Web Speech error: ${event.error}`,
            }),
          ),
        )
      }
    }

    recognition.onend = () => {
      speechLog("WEBSPEECH", "Recognition ended (end-of-utterance detected)")
      this.webSpeechRecognition = null
      // Web Speech detected end of utterance - trigger stop to process results
      if (this.state.isRecording) {
        this.setState({ isAutoStopping: true })
        this.handleStopRecognition()
      }
    }

    this.webSpeechRecognition = recognition
    recognition.start()
  }

  private cleanupWebSpeechRecognition(): void {
    if (this.webSpeechRecognition) {
      speechLog("WEBSPEECH", "Cleaning up Web Speech recognition")
      this.webSpeechRecognition.abort()
      this.webSpeechRecognition = null
    }
  }

  // --- VAD-based end-of-utterance detection for Google STT only mode ---

  private readonly startVADDetectionEffect: Effect.Effect<
    void,
    SpeechRecognitionError,
    SpeechDetectionService
  > = Effect.gen(this, function* () {
    speechLog("VAD", "Starting VAD-based end-of-utterance detection")

    const vad = yield* SpeechDetectionService

    this.speechStartedAt = null

    this.setState({
      isSilenceDetectionActive: true,
      hasSpeechBeenDetected: false,
      isSilent: true,
    })

    // Start speech detection VAD via service
    yield* Effect.mapError(
      vad.startListening,
      e =>
        new SpeechRecognitionError({
          code: "VAD_START_ERROR",
          message: `Failed to start VAD: ${String(e)}`,
        }),
    )

    // Subscribe to voice events via service
    // Note: Inside the callback we use speechDetectionStore.getSnapshot() directly
    // since the callback is synchronous and we need the current state
    this.vadUnsubscribe = yield* vad.subscribeToVoiceEvents(() => {
      const vadState = speechDetectionStore.getSnapshot()

      if (vadState.isSpeaking) {
        // Voice started - cancel any pending silence timer
        if (this.silenceTimerId !== null) {
          clearTimeout(this.silenceTimerId)
          this.silenceTimerId = null
          speechLog("VAD", "Voice resumed, cancelled silence timer")
        }

        if (this.speechStartedAt === null) {
          this.speechStartedAt = Date.now()
          speechLog("VAD", "Voice activity started")
        }
        this.setState({ hasSpeechBeenDetected: true, isSilent: false })
      } else {
        // Voice stopped - start silence timer
        this.setState({ isSilent: true })

        if (this.speechStartedAt !== null) {
          const speechDuration = Date.now() - this.speechStartedAt
          if (speechDuration >= activeVADConfig.minSpeechMs) {
            // Start silence timer
            if (this.silenceTimerId === null) {
              speechLog("VAD", "Voice stopped, starting silence timer", {
                speechDuration,
                silenceTimeout: activeVADConfig.silenceToFinalizeMs,
              })
              this.silenceTimerId = setTimeout(
                () => this.checkTranscriptStabilityAndFinalize(),
                activeVADConfig.silenceToFinalizeMs,
              )
            }
          } else {
            speechLog("VAD", "Voice stopped but speech too short, waiting for more", {
              speechDuration,
              minRequired: activeVADConfig.minSpeechMs,
            })
          }
        }
      }
    })

    speechLog("VAD", "VAD detection started")
  })

  private stopVADDetection(): void {
    if (this.vadUnsubscribe) {
      this.vadUnsubscribe()
      this.vadUnsubscribe = null
    }

    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId)
      this.silenceTimerId = null
    }

    speechDetectionStore.stopListening()

    this.speechStartedAt = null
    this.lastTranscriptChangeAt = null

    this.setState({
      isSilenceDetectionActive: false,
      hasSpeechBeenDetected: false,
      isSilent: false,
    })

    speechLog("VAD", "VAD detection stopped")
  }

  private checkTranscriptStabilityAndFinalize(): void {
    const config = activeVADConfig
    const now = Date.now()
    const currentTranscript = this.state.partialTranscript

    if (currentTranscript.length < config.minCharsBeforeFinalize) {
      speechLog("VAD", "Transcript too short, extending silence timer", {
        length: currentTranscript.length,
        minRequired: config.minCharsBeforeFinalize,
      })
      this.silenceTimerId = setTimeout(
        () => this.checkTranscriptStabilityAndFinalize(),
        config.silenceExtensionMs,
      )
      return
    }

    const transcriptAge = this.lastTranscriptChangeAt
      ? now - this.lastTranscriptChangeAt
      : Number.POSITIVE_INFINITY

    if (transcriptAge < config.stableTranscriptMs) {
      speechLog("VAD", "Transcript still changing, extending silence timer", {
        transcriptAge,
        requiredStability: config.stableTranscriptMs,
      })
      this.silenceTimerId = setTimeout(
        () => this.checkTranscriptStabilityAndFinalize(),
        config.silenceExtensionMs,
      )
      return
    }

    speechLog("VAD", "Stability checks passed, finalizing", {
      transcriptLength: currentTranscript.length,
      transcriptAge,
    })
    this.silenceTimerId = null
    this.setState({ isAutoStopping: true })
    this.handleStopRecognition()
  }

  // --- Streaming STT (WebSocket) ---

  private readonly setupAudioWorkletEffect: Effect.Effect<void, SpeechRecognitionError> =
    Effect.gen(this, function* () {
      speechLog("STREAM", "Setting up AudioWorklet for PCM streaming")

      // Get microphone stream
      const stream = yield* Effect.tryPromise({
        try: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: SAMPLE_RATE,
            },
          }),
        catch: e =>
          new SpeechRecognitionError({
            code: "MIC_ERROR",
            message: `Failed to access microphone: ${String(e)}`,
          }),
      })

      // Store stream for cleanup
      this.streamingMediaStream = stream

      // Create AudioContext
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })

      const audioContext = this.audioContext

      // Load the PCM worklet
      yield* Effect.tryPromise({
        try: () => audioContext.audioWorklet.addModule("/pcm-worklet.js"),
        catch: e =>
          new SpeechRecognitionError({
            code: "WORKLET_ERROR",
            message: `Failed to load PCM worklet: ${String(e)}`,
          }),
      })

      // Create worklet node
      this.audioWorkletNode = new AudioWorkletNode(audioContext, "pcm-processor")

      // Connect microphone to worklet
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream)
      this.mediaStreamSource.connect(this.audioWorkletNode)

      // Handle PCM data from worklet
      this.audioWorkletNode.port.onmessage = event => {
        const pcmData = event.data as ArrayBuffer
        sttStreamClient.sendAudioFrame(pcmData)
      }

      speechLog("STREAM", "AudioWorklet setup complete", {
        sampleRate: this.audioContext.sampleRate,
      })
    })

  private readonly startStreamingSTTEffect: Effect.Effect<
    void,
    SpeechRecognitionError,
    SttStreamService
  > = Effect.gen(this, function* () {
    const stt = yield* SttStreamService

    // Connect to WebSocket STT bridge FIRST (before setting up audio capture)
    // Google streaming API supports up to 3 language codes for auto-detection
    // Primary: English, with Hebrew and Russian as alternatives (most common for our users)
    const connectResult = yield* Effect.either(
      stt.connect({
        languageCode: "en-US",
        alternativeLanguageCodes: ["iw-IL", "ru-RU"],
      }),
    )

    if (connectResult._tag === "Left") {
      const error = connectResult.left
      speechLog("STREAM", "Failed to connect to streaming STT", { error: error.message })
      return yield* Effect.fail(
        new SpeechRecognitionError({
          code: error.code,
          message: error.message,
        }),
      )
    }

    speechLog("STREAM", "Connected to streaming STT")

    // Now set up AudioContext and AudioWorklet for PCM streaming
    // This ensures no audio frames are sent before the WS is ready
    yield* this.setupAudioWorkletEffect

    // Track last values to avoid duplicate processing
    let lastPartialText = ""
    let lastFinalText: string | null = null
    let hasEnded = false

    // Subscribe to streaming client state for transcripts
    // Note: End-of-utterance detection is handled by Google's server-side VAD
    // which sends "ended" event when speech ends
    // We use the singleton for subscription since this is a sync callback pattern
    this.streamingUnsubscribe = sttStreamClient.subscribe(() => {
      const streamState = sttStreamClient.getSnapshot()

      // Forward partial transcripts (only if changed)
      if (streamState.partialText && streamState.partialText !== lastPartialText) {
        lastPartialText = streamState.partialText
        this.runSyncWithClientLayer(
          this.dispatch(
            new ReceivePartial({
              text: streamState.partialText,
              languageCode: streamState.detectedLanguageCode,
            }),
          ),
        )
      }

      // Forward final transcripts (only once) and stop recording
      if (streamState.finalText && streamState.finalText !== lastFinalText) {
        lastFinalText = streamState.finalText
        hasEnded = true
        this.runSyncWithClientLayer(
          this.dispatch(
            new ReceiveFinal({
              text: streamState.finalText,
              languageCode: streamState.detectedLanguageCode,
            }),
          ),
        )
        // Stop recording immediately after receiving final transcript
        speechLog("STREAM", "Final transcript received, stopping")
        this.handleStopRecognition()
        return
      }

      // Handle errors
      if (streamState.status === "error" && streamState.error) {
        speechLog("STREAM", "Streaming error", { error: streamState.error })
        this.handleSetError("STREAM_ERROR", streamState.error)
      }

      // Handle session end from Google VAD (only once)
      if (streamState.status === "ended" && !hasEnded) {
        hasEnded = true
        speechLog("STREAM", "Google VAD ended session")
        this.handleStopRecognition()
      }
    })
  })

  private stopStreamingSTT(): void {
    // Unsubscribe from streaming client
    if (this.streamingUnsubscribe) {
      this.streamingUnsubscribe()
      this.streamingUnsubscribe = null
    }

    // Reset streaming connection (clears finalText, partialText, etc.)
    sttStreamClient.reset()

    // Stop audio worklet
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect()
      this.audioWorkletNode = null
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect()
      this.mediaStreamSource = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }

    // Stop microphone stream tracks
    if (this.streamingMediaStream) {
      for (const track of this.streamingMediaStream.getTracks()) {
        track.stop()
      }
      this.streamingMediaStream = null
    }

    // Stop VAD
    this.stopVADDetection()

    // Reset to default VAD preset
    activeVADConfig = VAD_PRESETS.default

    this.isStreamingMode = false

    speechLog("STREAM", "Streaming STT stopped")
  }

  private isLowConfidenceTranscript(transcript: string | null): boolean {
    if (!transcript) return true

    const trimmed = transcript.trim()

    // Too short
    if (trimmed.length < MIN_TRANSCRIPT_LENGTH) {
      speechLog("CONFIDENCE", "Transcript too short", { length: trimmed.length })
      return true
    }

    // High garbage ratio (non-alphanumeric characters)
    const cleanedLength = trimmed.replace(GARBAGE_CHARS_REGEX, "").length
    const garbageRatio = 1 - cleanedLength / trimmed.length
    if (garbageRatio > 0.3) {
      speechLog("CONFIDENCE", "High garbage ratio", { garbageRatio: garbageRatio.toFixed(2) })
      return true
    }

    return false
  }

  private sendFinalAudio(): void {
    void this.runPromiseWithClientLayer(
      this.sendFinalAudioEffect.pipe(
        Effect.catchAll(e => {
          speechLog("AUDIO", "sendFinalAudioEffect error", { error: String(e) })
          return Effect.void
        }),
      ),
    )
  }

  private readonly sendFinalAudioEffect: Effect.Effect<void, SpeechRecognitionError> = Effect.gen(
    this,
    function* () {
      const webSpeechResult = this.webSpeechTranscript
      const webSpeechLang = this.webSpeechLanguageCode
      const isLowConfidence = this.isLowConfidenceTranscript(webSpeechResult)
      // Capture audio chunks immediately and clear (before any async operations)
      const audioChunks = [...this.audioChunks]
      this.audioChunks = []

      speechLog("AUDIO", "Evaluating Web Speech result", {
        transcript: webSpeechResult,
        isLowConfidence,
        quotaAvailable: this.state.isQuotaAvailable,
      })

      // If Web Speech gave a good result, use it directly
      if (!isLowConfidence && webSpeechResult) {
        speechLog("AUDIO", "Using Web Speech result (good confidence)")
        this.runSyncWithClientLayer(
          this.dispatch(
            new ReceiveFinal({
              text: webSpeechResult,
              languageCode: webSpeechLang,
            }),
          ),
        )
        return
      }

      // Low confidence - try Google STT fallback if quota allows
      if (!this.state.isQuotaAvailable) {
        speechLog("AUDIO", "Low confidence but quota exhausted - using Web Speech result anyway")
        if (webSpeechResult) {
          this.runSyncWithClientLayer(
            this.dispatch(
              new ReceiveFinal({
                text: webSpeechResult,
                languageCode: webSpeechLang,
              }),
            ),
          )
        } else {
          speechLog("AUDIO", "No Web Speech result and no quota - no transcript available")
        }
        return
      }

      // Try Google STT fallback
      if (audioChunks.length === 0) {
        speechLog("AUDIO", "No audio chunks for Google STT fallback")
        if (webSpeechResult) {
          this.runSyncWithClientLayer(
            this.dispatch(
              new ReceiveFinal({
                text: webSpeechResult,
                languageCode: webSpeechLang,
              }),
            ),
          )
        } else {
          speechLog("AUDIO", "No audio and no Web Speech result")
          this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
        }
        return
      }

      const audioBlob = new Blob(audioChunks, {
        type: this.mediaRecorder?.mimeType ?? "audio/webm",
      })

      // Convert blob to base64 (browser-compatible)
      const base64Audio = yield* Effect.tryPromise({
        try: () =>
          new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const dataUrl = reader.result as string
              const base64 = dataUrl.split(",")[1] ?? ""
              resolve(base64)
            }
            reader.readAsDataURL(audioBlob)
          }),
        catch: e =>
          new SpeechRecognitionError({
            code: "AUDIO_ENCODE_ERROR",
            message: `Failed to encode audio: ${String(e)}`,
          }),
      })

      speechLog("AUDIO", "Falling back to Google STT (low confidence Web Speech)", {
        size: audioBlob.size,
        type: audioBlob.type,
        webSpeechTranscript: webSpeechResult,
      })

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("/api/voice-search/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio }),
          }),
        catch: e =>
          new SpeechRecognitionError({
            code: "GOOGLE_STT_NETWORK_ERROR",
            message: `Google STT network error: ${String(e)}`,
          }),
      }).pipe(
        Effect.catchAll(error => {
          speechLog("API", "Google STT network error, using Web Speech result", {
            error: String(error),
          })
          if (webSpeechResult) {
            this.runSyncWithClientLayer(
              this.dispatch(
                new ReceiveFinal({
                  text: webSpeechResult,
                  languageCode: webSpeechLang,
                }),
              ),
            )
          } else {
            speechLog("API", "No transcript from either tier (network error)")
            this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
          }
          return Effect.succeed(null)
        }),
      )

      if (!response) return

      if (!response.ok) {
        const errorText = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => "",
        }).pipe(Effect.orElseSucceed(() => ""))

        speechLog("API", "Google STT failed, using Web Speech result", {
          status: response.status,
          error: errorText,
        })
        if (webSpeechResult) {
          this.runSyncWithClientLayer(
            this.dispatch(
              new ReceiveFinal({
                text: webSpeechResult,
                languageCode: webSpeechLang,
              }),
            ),
          )
        }
        return
      }

      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ transcript?: string; languageCode?: string }>,
        catch: e =>
          new SpeechRecognitionError({
            code: "GOOGLE_STT_PARSE_ERROR",
            message: `Failed to parse Google STT response: ${String(e)}`,
          }),
      })

      if (data.transcript) {
        this.currentTier = "google_stt"
        this.setState({ tierUsed: "google_stt" })
        speechLog("API", "Using Google STT result", { transcript: data.transcript })
        this.runSyncWithClientLayer(
          this.dispatch(
            new ReceiveFinal({
              text: data.transcript,
              languageCode: data.languageCode ?? null,
            }),
          ),
        )
      } else {
        speechLog("API", "No transcript from Google STT, using Web Speech result")
        if (webSpeechResult) {
          this.runSyncWithClientLayer(
            this.dispatch(
              new ReceiveFinal({
                text: webSpeechResult,
                languageCode: webSpeechLang,
              }),
            ),
          )
        } else {
          speechLog("API", "No transcript from either tier")
          this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
        }
      }
    },
  )

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

  // --- Stop recognition ---

  private handleStopRecognition(): void {
    // Capture streaming mode before cleanup (stopStreamingSTT sets it to false)
    const wasStreamingMode = this.isStreamingMode

    speechLog("STOP", "Stopping speech recognition...", {
      tier: this.currentTier,
      isStreamingMode: wasStreamingMode,
    })

    // Clear max duration timeout
    this.clearMaxDurationTimeout()

    // Stop streaming STT if active
    if (wasStreamingMode) {
      this.stopStreamingSTT()
    } else {
      // Stop VAD detection (non-streaming mode)
      this.stopVADDetection()
    }

    // Cleanup Web Speech if active
    this.cleanupWebSpeechRecognition()

    // Stop MediaRecorder
    if (this.mediaRecorder) {
      const recorder = this.mediaRecorder
      if (wasStreamingMode) {
        // Streaming mode: just stop MediaRecorder, don't send audio (already handled by WebSocket)
        if (recorder.state !== "inactive") {
          recorder.onstop = () => {
            for (const track of recorder.stream.getTracks()) {
              track.stop()
            }
          }
          recorder.stop()
        } else {
          for (const track of recorder.stream.getTracks()) {
            track.stop()
          }
        }
        this.audioChunks = []
      } else {
        // Non-streaming mode: send final audio for Web Speech evaluation
        if (recorder.state !== "inactive") {
          recorder.onstop = () => {
            speechLog("STOP", "MediaRecorder stopped, sending final audio", {
              chunks: this.audioChunks.length,
            })
            this.sendFinalAudio()
            for (const track of recorder.stream.getTracks()) {
              track.stop()
            }
          }
          recorder.stop()
        } else {
          for (const track of recorder.stream.getTracks()) {
            track.stop()
          }
        }
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
    speechLog("START", "start() called")
    await this.runPromiseWithClientLayer(
      Effect.catchAll(this.dispatch(new StartRecognition({})), e => {
        speechLog("START", "Effect error caught in start()", {
          code: e.code,
          message: e.message,
        })
        this.setState({
          errorCode: e.code,
          errorMessage: e.message,
          isConnecting: false,
          isRecording: false,
        })
        return Effect.void
      }),
    )
    speechLog("START", "start() completed", {
      isRecording: this.state.isRecording,
      errorCode: this.state.errorCode,
    })
  }

  stop(): void {
    this.runSyncWithClientLayer(this.dispatch(new StopRecognition({})))
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
    this.currentTier = null
    this.webSpeechTranscript = null
    this.webSpeechLanguageCode = null
    this.lastTranscriptChangeAt = null
    this.setState({
      isSupported: typeof window !== "undefined" && typeof navigator !== "undefined",
      isConnecting: false,
      isRecording: false,
      hasAudioPermission: false,
      isAutoStopping: false,
      isQuotaAvailable: true,
      isWebSpeechAvailable: this.checkWebSpeechSupport(),
      tierUsed: null,
      partialTranscript: "",
      finalTranscript: null,
      detectedLanguageCode: null,
      lastUpdatedAt: null,
      errorCode: null,
      errorMessage: null,
      isSilenceDetectionActive: false,
      hasSpeechBeenDetected: false,
      isSilent: false,
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
  isWebSpeechAvailable: false,
  tierUsed: null,
  partialTranscript: "",
  finalTranscript: null,
  detectedLanguageCode: null,
  lastUpdatedAt: null,
  errorCode: null,
  errorMessage: null,
  isSilenceDetectionActive: false,
  hasSpeechBeenDetected: false,
  isSilent: false,
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

export function useSpeechTier(): SpeechTier {
  const state = useSpeechState()
  return state.tierUsed
}

export function useIsWebSpeechAvailable(): boolean {
  const state = useSpeechState()
  return state.isWebSpeechAvailable
}
