/**
 * MediaPipeSingingDetector - YAMNet-based singing detection
 *
 * Uses MediaPipe's Audio Classifier with YAMNet to specifically detect singing,
 * with the trigger state machine for robust false-positive rejection.
 */

import {
  DEFAULT_SINGING_DETECTOR_CONFIG,
  type SingingDetectorConfig,
} from "@/core/PreferencesStore"
import { vadLog } from "@/lib/vad-log"
import { Effect } from "effect"
import { type TriggerStateMachine, createTriggerStateMachine } from "./TriggerStateMachine"
import {
  type ActivationDetector,
  ClassifierInitError,
  type DetectorError,
  type DetectorEventCallback,
  type DetectorState,
  ErrorEvent,
  MicrophonePermissionError,
  ProbabilityEvent,
  StateEvent,
  TriggerEvent,
} from "./types"

// --- Class Sets (from AudioSet/YAMNet ontology) ---

const SINGING_CLASSES = new Set([
  "Singing",
  "Choir",
  "Chant",
  "Yodeling",
  "Humming",
  "A capella",
  "Vocal music",
])

const SPEECH_CLASSES = new Set([
  "Speech",
  "Male speech, man speaking",
  "Female speech, woman speaking",
  "Child speech, kid speaking",
  "Narration, monologue",
  "Conversation",
])

// --- CDN URLs ---

const MEDIAPIPE_WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
const YAMNET_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite"

// --- Types ---

type AudioClassifier = Awaited<
  ReturnType<typeof import("@mediapipe/tasks-audio").AudioClassifier.createFromOptions>
>

export class MediaPipeSingingDetector implements ActivationDetector {
  private state: DetectorState = "idle"
  private callbacks = new Set<DetectorEventCallback>()
  private config: SingingDetectorConfig
  private triggerMachine: TriggerStateMachine

  // Audio capture
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private mediaStream: MediaStream | null = null
  private scriptProcessor: ScriptProcessorNode | null = null

  // Ring buffer for audio samples
  private ringBuffer: Float32Array | null = null
  private ringBufferWriteIndex = 0
  private ringBufferSampleRate = 16000

  // Classification
  private classifier: AudioClassifier | null = null
  private classificationInterval: number | null = null
  private initPromise: Promise<void> | null = null

  constructor(config: SingingDetectorConfig = DEFAULT_SINGING_DETECTOR_CONFIG) {
    this.config = config
    // When rejectSpeech is disabled, use more aggressive settings since
    // we're treating Speech as Singing, and acapella singing is more intermittent
    const effectiveConfig = config.rejectSpeech
      ? config
      : {
          ...config,
          startThreshold: Math.min(config.startThreshold, 0.5),
          emaAlpha: Math.max(config.emaAlpha, 0.4),
          holdMs: Math.min(config.holdMs, 200),
        }
    this.triggerMachine = createTriggerStateMachine(effectiveConfig)
  }

  start(): Effect.Effect<void, DetectorError> {
    return Effect.gen(this, function* () {
      if (this.state !== "idle") return

      // Initialize classifier first
      yield* this.initializeClassifierEffect()

      // Get microphone access
      yield* this.startAudioCaptureEffect()

      // Start classification loop
      this.startClassificationLoop()

      this.updateState("listening")
    }).pipe(
      Effect.catchAll(error => {
        this.emit(
          new ErrorEvent({
            error: error instanceof Error ? error.message : "Failed to start singing detection",
          }),
        )
        return Effect.fail(error as DetectorError)
      }),
    )
  }

  stop(): Effect.Effect<void> {
    return Effect.sync(() => {
      if (this.state === "idle") return

      this.stopClassificationLoop()
      this.stopAudioCapture()
      this.triggerMachine.reset()
      this.updateState("idle")
    })
  }

  getState(): DetectorState {
    return this.state
  }

  onEvent(callback: DetectorEventCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  dispose(): void {
    Effect.runSync(this.stop())
    this.destroyClassifier()
    this.callbacks.clear()
  }

  updateConfig(config: Partial<SingingDetectorConfig>): void {
    this.config = { ...this.config, ...config }
    // Apply same effective config logic as constructor
    const effectiveConfig = this.config.rejectSpeech
      ? this.config
      : {
          ...this.config,
          startThreshold: Math.min(this.config.startThreshold, 0.5),
          emaAlpha: Math.max(this.config.emaAlpha, 0.4),
          holdMs: Math.min(this.config.holdMs, 200),
        }
    this.triggerMachine = createTriggerStateMachine(effectiveConfig)
  }

  // --- Private methods ---

  private initializeClassifierEffect(): Effect.Effect<void, ClassifierInitError> {
    return Effect.gen(this, function* () {
      if (this.classifier) return

      // Use local variable to avoid non-null assertions after narrowing
      const existingPromise = this.initPromise
      if (existingPromise) {
        yield* Effect.tryPromise({
          try: () => existingPromise,
          catch: () => new ClassifierInitError({ message: "Classifier init already in progress" }),
        })
        return
      }

      const newPromise = this.doInitializeClassifier()
      this.initPromise = newPromise
      yield* Effect.tryPromise({
        try: () => newPromise,
        catch: e =>
          new ClassifierInitError({
            message: e instanceof Error ? e.message : "Failed to initialize classifier",
          }),
      })
    })
  }

  private async doInitializeClassifier(): Promise<void> {
    // Suppress TensorFlow Lite INFO messages during classifier creation
    // The WASM module may use various console methods at different points
    const originalLog = console.log
    const originalInfo = console.info
    const originalWarn = console.warn
    const originalError = console.error
    const makeSuppressor =
      (original: typeof console.log) =>
      (...args: unknown[]) => {
        const msg = args[0]
        if (typeof msg === "string" && msg.includes("Created TensorFlow Lite XNNPACK delegate")) {
          return
        }
        original.apply(console, args)
      }
    console.log = makeSuppressor(originalLog)
    console.info = makeSuppressor(originalInfo)
    console.warn = makeSuppressor(originalWarn)
    console.error = makeSuppressor(originalError)

    try {
      const { AudioClassifier, FilesetResolver } = await import("@mediapipe/tasks-audio")

      const audio = await FilesetResolver.forAudioTasks(MEDIAPIPE_WASM_CDN)

      this.classifier = await AudioClassifier.createFromOptions(audio, {
        baseOptions: {
          modelAssetPath: YAMNET_MODEL_URL,
        },
        maxResults: 10,
        scoreThreshold: 0.1,
      })

      // Warm-up classification to trigger TensorFlow Lite delegate creation
      // while console is suppressed (the INFO message appears on first classify)
      const warmupSamples = new Float32Array(16000)
      this.classifier.classify(warmupSamples, 16000)
    } finally {
      console.log = originalLog
      console.info = originalInfo
      console.warn = originalWarn
      console.error = originalError
    }
  }

  private startAudioCaptureEffect(): Effect.Effect<void, MicrophonePermissionError> {
    return Effect.tryPromise({
      try: async () => {
        // Request microphone access
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 16000,
          },
        })

        // Create audio context
        this.audioContext = new AudioContext({ sampleRate: 16000 })
        this.ringBufferSampleRate = this.audioContext.sampleRate

        // Calculate buffer size for windowMs of audio
        const bufferSamples = Math.ceil((this.config.windowMs / 1000) * this.ringBufferSampleRate)
        this.ringBuffer = new Float32Array(bufferSamples)
        this.ringBufferWriteIndex = 0

        // Create nodes
        const source = this.audioContext.createMediaStreamSource(this.mediaStream)
        this.analyserNode = this.audioContext.createAnalyser()
        this.analyserNode.fftSize = 2048

        // Use ScriptProcessor for continuous audio capture
        // Note: ScriptProcessor is deprecated but still widely supported
        // AudioWorklet would be better but adds complexity
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)

        this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
          const inputData = event.inputBuffer.getChannelData(0)
          this.writeToRingBuffer(inputData)
        }

        // Connect: source -> analyser -> scriptProcessor -> destination
        source.connect(this.analyserNode)
        this.analyserNode.connect(this.scriptProcessor)
        this.scriptProcessor.connect(this.audioContext.destination)
      },
      catch: e =>
        new MicrophonePermissionError({
          message: e instanceof Error ? e.message : "Failed to access microphone",
        }),
    })
  }

  private writeToRingBuffer(samples: Float32Array): void {
    if (!this.ringBuffer) return

    for (let i = 0; i < samples.length; i++) {
      this.ringBuffer[this.ringBufferWriteIndex] = samples[i] ?? 0
      this.ringBufferWriteIndex = (this.ringBufferWriteIndex + 1) % this.ringBuffer.length
    }
  }

  private getAudioWindow(): Float32Array | null {
    if (!this.ringBuffer) return null

    // Extract audio from ring buffer in correct order
    const samples = new Float32Array(this.ringBuffer.length)
    const readIndex = this.ringBufferWriteIndex

    for (let i = 0; i < this.ringBuffer.length; i++) {
      const bufferIndex = (readIndex + i) % this.ringBuffer.length
      samples[i] = this.ringBuffer[bufferIndex] ?? 0
    }

    return samples
  }

  private startClassificationLoop(): void {
    if (this.classificationInterval !== null) return

    const classify = () => {
      if (!this.classifier || this.state === "idle") return

      const samples = this.getAudioWindow()
      if (!samples) return

      try {
        const results = this.classifier.classify(samples, this.ringBufferSampleRate)

        if (!results.length || !results[0]?.classifications?.length) return

        const categories = results[0].classifications[0]?.categories ?? []

        // Calculate pSinging and pSpeech
        let pSinging = 0
        let pSpeech = 0
        let singingClass = ""
        let speechClass = ""

        for (const cat of categories) {
          const name = cat.categoryName ?? ""
          const score = cat.score

          if (SINGING_CLASSES.has(name) && score > pSinging) {
            pSinging = score
            singingClass = name
          }
          if (SPEECH_CLASSES.has(name) && score > pSpeech) {
            pSpeech = score
            speechClass = name
          }
        }

        // Log top categories to VAD log file
        const topCategories = categories
          .slice(0, 5)
          .map(c => `${c.categoryName}:${c.score.toFixed(2)}`)
          .join(", ")

        // When rejectSpeech is disabled, treat Speech as potential singing
        // This is needed because YAMNet often classifies acapella singing as Speech
        let effectivePSinging = pSinging
        if (!this.config.rejectSpeech && pSpeech > pSinging) {
          effectivePSinging = pSpeech // Use speech probability directly as singing
        }

        vadLog("SINGING", "classify", {
          top5: topCategories,
          pSinging: pSinging.toFixed(3),
          pSpeech: pSpeech.toFixed(3),
          effectivePSinging: effectivePSinging.toFixed(3),
          singingClass,
          speechClass,
          speechAsSinging: !this.config.rejectSpeech && pSpeech > pSinging,
        })

        // Emit probability event
        this.emit(
          new ProbabilityEvent({
            pSinging: effectivePSinging,
            pSpeech,
          }),
        )

        // Process through trigger state machine
        const output = this.triggerMachine.process({
          pSinging: effectivePSinging,
          pSpeech: this.config.rejectSpeech ? pSpeech : 0, // Only pass speech if rejecting
          timestamp: Date.now(),
        })

        // Log state machine output
        vadLog("SINGING", "trigger", {
          smoothed: output.smoothedProbability.toFixed(3),
          state: output.state,
          holdProgress: (output.holdProgress * 100).toFixed(0),
          shouldTrigger: output.shouldTrigger,
          speechBlocked: this.config.rejectSpeech && pSpeech > this.config.speechMax,
        })

        // Debug logging to console
        if (this.config.debug && (pSinging > 0.1 || pSpeech > 0.1)) {
          console.log(
            `[SingingDetector] pSinging=${pSinging.toFixed(3)} pSpeech=${pSpeech.toFixed(3)} ` +
              `smoothed=${output.smoothedProbability.toFixed(3)} state=${output.state} ` +
              `hold=${(output.holdProgress * 100).toFixed(0)}%`,
          )
        }

        // Check for trigger
        if (output.shouldTrigger) {
          this.updateState("triggered")
          this.emit(new TriggerEvent({}))
          vadLog("SINGING", "TRIGGERED", {
            pSinging: pSinging.toFixed(3),
            pSpeech: pSpeech.toFixed(3),
          })

          if (this.config.debug) {
            console.log("[SingingDetector] 🎤 TRIGGERED!")
          }
        } else if (output.state === "idle" && this.state === "triggered") {
          // Return to listening state after trigger
          this.updateState("listening")
        }
      } catch (error) {
        console.error("[SingingDetector] Classification error:", error)
      }
    }

    // Run classification at hopMs intervals
    this.classificationInterval = window.setInterval(classify, this.config.hopMs)

    // Also run immediately
    classify()
  }

  private stopClassificationLoop(): void {
    if (this.classificationInterval !== null) {
      clearInterval(this.classificationInterval)
      this.classificationInterval = null
    }
  }

  private stopAudioCapture(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor.onaudioprocess = null
      this.scriptProcessor = null
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect()
      this.analyserNode = null
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop()
      }
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.ringBuffer = null
    this.ringBufferWriteIndex = 0
  }

  private destroyClassifier(): void {
    this.classifier?.close()
    this.classifier = null
    this.initPromise = null
  }

  private updateState(newState: DetectorState): void {
    if (this.state !== newState) {
      this.state = newState
      this.emit(new StateEvent({ state: newState }))
    }
  }

  private emit(event: ProbabilityEvent | StateEvent | TriggerEvent | ErrorEvent): void {
    for (const callback of this.callbacks) {
      callback(event)
    }
  }
}
