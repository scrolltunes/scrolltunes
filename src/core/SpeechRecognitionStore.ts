"use client"

import { ClientLayer, type ClientLayerContext } from "@/services/client-layer"
import { loadPublicConfig } from "@/services/public-config"
import { SoundSystemService } from "@/services/sound-system"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"
import { voiceActivityStore } from "./VoiceActivityStore"

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

// VAD-based end-of-utterance detection for Google STT only mode
const SPEECH_MIN_DURATION_MS = 500 // Minimum speech before silence timer starts
const SILENCE_DURATION_MS = 1500 // Wait this long after voice stops before auto-stopping

// Confidence thresholds for Web Speech fallback decision
const MIN_TRANSCRIPT_LENGTH = 2
const GARBAGE_CHARS_REGEX = /[^a-zA-Z0-9\s'''-]/g

// Mobile detection pattern
const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod/i

// --- Brave Desktop Detection ---

// Brave exposes navigator.brave on desktop, but mobile Brave uses native OS speech recognition
// which works fine. So we only want to detect desktop Brave.
async function detectBraveDesktop(): Promise<boolean> {
  if (typeof navigator === "undefined") return false

  // Check if mobile - Brave mobile uses native OS speech recognition which works
  const isMobile = MOBILE_UA_REGEX.test(navigator.userAgent)
  if (isMobile) {
    speechLog("DETECT", "Mobile browser detected, Web Speech should work")
    return false
  }

  // Check for Brave browser via navigator.brave
  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }
  if (nav.brave?.isBrave) {
    try {
      const isBrave = await nav.brave.isBrave()
      if (isBrave) {
        speechLog("DETECT", "Brave desktop detected, will use Google STT directly")
        return true
      }
    } catch {
      // If the check fails, assume not Brave
    }
  }

  return false
}

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
  private braveDetectionPromise: Promise<boolean> | null = null

  // VAD-based end-of-utterance detection for Google STT only mode
  private vadUnsubscribe: (() => void) | null = null
  private speechStartedAt: number | null = null
  private silenceTimerId: ReturnType<typeof setTimeout> | null = null

  private runPromiseWithClientLayer<T, E, R extends ClientLayerContext>(
    effect: Effect.Effect<T, E, R>,
  ): Promise<T> {
    return Effect.runPromise(
      effect.pipe(Effect.provide(ClientLayer)) as Effect.Effect<T, E, never>,
    )
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

      if (response.status === 401) {
        speechLog("QUOTA", "Unauthorized for quota check")
        this.setState({
          isQuotaAvailable: false,
          errorCode: "AUTH_REQUIRED",
          errorMessage: "Sign in to use voice search",
        })
        return false
      }

      if (!response.ok) {
        speechLog("QUOTA", "Failed to check quota", { status: response.status })
        this.setState({ isQuotaAvailable: false })
        return false
      }

      const data = (await response.json()) as {
        available?: boolean
        webSpeechAvailable?: boolean
      }
      const isAvailable = data.available ?? false
      const isWebSpeechAvailable = data.webSpeechAvailable ?? this.checkWebSpeechSupport()
      if (!isAvailable) {
        speechLog("QUOTA", "Google STT quota exhausted", { webSpeechAvailable: isWebSpeechAvailable })
      }
      this.setState({
        isQuotaAvailable: isAvailable,
        isWebSpeechAvailable,
        errorCode: null,
        errorMessage: null,
      })
      return isAvailable
    } catch (e) {
      speechLog("QUOTA", "Error checking quota", { error: String(e) })
      // On error, assume available to not block the user
      return true
    }
  }

  async initialize(): Promise<void> {
    // Detect Brave desktop once (deduplicated)
    if (!this.braveDetectionPromise) {
      this.braveDetectionPromise = detectBraveDesktop().then(isBrave => {
        this.isBraveDesktop = isBrave
        if (isBrave) {
          this.useGoogleSTTOnly = true
          speechLog("INIT", "Brave desktop detected, enabling Google STT only mode")
        }
        return isBrave
      })
    }
    await this.braveDetectionPromise
  }

  // --- Event dispatch ---

  readonly dispatch = (
    event: SpeechEvent,
  ): Effect.Effect<void, SpeechRecognitionError, SoundSystemService> => {
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
    SoundSystemService
  > = Effect.gen(
    this,
    function* (_) {
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
      yield* _(Effect.promise(() => this.initialize()))

      // Check if we should use Google STT only (Brave desktop or previous network error)
      const useGoogleSTTOnly = this.useGoogleSTTOnly
      speechLog("START", "Mode check", {
        useGoogleSTTOnly,
        isBraveDesktop: this.isBraveDesktop,
        quotaAvailable: this.state.isQuotaAvailable,
      })

      // For Google STT only mode (Brave desktop), we must check quota first
      if (useGoogleSTTOnly) {
        const quotaAvailable = yield* _(Effect.promise(() => this.checkQuota()))
        if (!quotaAvailable) {
          speechLog("START", "Google STT required but quota not available")
          this.handleSetError(
            "QUOTA_REQUIRED",
            "Voice search unavailable. Please try again later.",
          )
          return
        }
      }

      // Check if Web Speech is available (primary tier)
      const isWebSpeechAvailable = this.checkWebSpeechSupport()
      speechLog("START", "Web Speech support check", {
        isWebSpeechAvailable,
        hasSpeechRecognition: typeof window !== "undefined" && !!window.SpeechRecognition,
        hasWebkitSpeechRecognition:
          typeof window !== "undefined" && !!window.webkitSpeechRecognition,
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
        void this.checkQuota()
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
        speechLog("START", "Skipping Web Speech, using Google STT only mode")
        // Start VAD for end-of-utterance detection in Google STT mode
        yield* _(Effect.promise(() => this.startVADDetection()))
      }

      this.setState({
        isConnecting: false,
        isRecording: true,
        lastUpdatedAt: Date.now(),
      })

      speechLog("START", `Speech recognition started with ${tierName}`)
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

        this.mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data)
          }
        }

        this.mediaRecorder.start()

        speechLog("AUDIO", "Audio capture started", {
          mimeType: this.mediaRecorder.mimeType,
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

  private async startVADDetection(): Promise<void> {
    speechLog("VAD", "Starting VAD-based end-of-utterance detection")

    this.speechStartedAt = null

    this.setState({
      isSilenceDetectionActive: true,
      hasSpeechBeenDetected: false,
      isSilent: true,
    })

    // Disable AND-gate for voice search (we just need voice detection, not singing detection)
    voiceActivityStore.setAndGateEnabled(false)

    // Start VAD listening
    await voiceActivityStore.startListening()

    // Subscribe to voice events
    this.vadUnsubscribe = voiceActivityStore.subscribeToVoiceEvents(() => {
      const vadState = voiceActivityStore.getSnapshot()

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
          if (speechDuration >= SPEECH_MIN_DURATION_MS) {
            // Start silence timer
            if (this.silenceTimerId === null) {
              speechLog("VAD", "Voice stopped, starting silence timer", {
                speechDuration,
                silenceTimeout: SILENCE_DURATION_MS,
              })
              this.silenceTimerId = setTimeout(() => {
                this.silenceTimerId = null
                speechLog("VAD", "Silence timeout reached, auto-stopping recording")
                this.setState({ isAutoStopping: true })
                this.handleStopRecognition()
              }, SILENCE_DURATION_MS)
            }
          } else {
            speechLog("VAD", "Voice stopped but speech too short, waiting for more", {
              speechDuration,
              minRequired: SPEECH_MIN_DURATION_MS,
            })
          }
        }
      }
    })

    speechLog("VAD", "VAD detection started")
  }

  private stopVADDetection(): void {
    if (this.vadUnsubscribe) {
      this.vadUnsubscribe()
      this.vadUnsubscribe = null
    }

    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId)
      this.silenceTimerId = null
    }

    voiceActivityStore.stopListening()
    voiceActivityStore.setAndGateEnabled(true) // Re-enable AND-gate for normal use

    this.speechStartedAt = null

    this.setState({
      isSilenceDetectionActive: false,
      hasSpeechBeenDetected: false,
      isSilent: false,
    })

    speechLog("VAD", "VAD detection stopped")
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

  private async sendFinalAudio(): Promise<void> {
    const webSpeechResult = this.webSpeechTranscript
    const webSpeechLang = this.webSpeechLanguageCode
    const isLowConfidence = this.isLowConfidenceTranscript(webSpeechResult)

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
    if (this.audioChunks.length === 0) {
      speechLog("AUDIO", "No audio chunks for Google STT fallback")
      // Fall back to Web Speech result if available
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
        // No audio and no Web Speech result
        speechLog("AUDIO", "No audio and no Web Speech result")
        this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
      }
      return
    }

    const audioBlob = new Blob(this.audioChunks, {
      type: this.mediaRecorder?.mimeType ?? "audio/webm",
    })

    // Convert blob to base64 (browser-compatible)
    const base64Audio = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64 = dataUrl.split(",")[1] ?? ""
        resolve(base64)
      }
      reader.readAsDataURL(audioBlob)
    })

    speechLog("AUDIO", "Falling back to Google STT (low confidence Web Speech)", {
      size: audioBlob.size,
      type: audioBlob.type,
      webSpeechTranscript: webSpeechResult,
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
        speechLog("API", "Google STT failed, using Web Speech result", {
          status: response.status,
          error: errorText,
        })
        // Fall back to Web Speech result
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

      const data = (await response.json()) as { transcript?: string; languageCode?: string }
      if (data.transcript) {
        // Update tier to indicate Google STT was used
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
        // Fall back to Web Speech result
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
          // No result from either tier
          speechLog("API", "No transcript from either tier")
          this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
        }
      }
    } catch (e) {
      speechLog("API", "Google STT network error, using Web Speech result", { error: String(e) })
      // Fall back to Web Speech result
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
        // No result from either tier
        speechLog("API", "No transcript from either tier (network error)")
        this.handleSetError("NO_SPEECH", "No speech detected. Please try again.")
      }
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

  // --- Stop recognition ---

  private handleStopRecognition(): void {
    speechLog("STOP", "Stopping speech recognition...", { tier: this.currentTier })

    // Clear max duration timeout
    this.clearMaxDurationTimeout()

    // Stop VAD detection
    this.stopVADDetection()

    // Cleanup Web Speech if active
    this.cleanupWebSpeechRecognition()

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
