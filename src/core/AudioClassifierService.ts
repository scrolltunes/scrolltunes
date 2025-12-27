"use client"

/**
 * AudioClassifierService - YAMNet-based audio classification for instrument vs vocal discrimination
 *
 * Uses MediaPipe's Audio Classifier with YAMNet model to distinguish singing/speech
 * from instruments (guitar, harmonica, etc.) and noise.
 *
 * This is used as a verification gate after Silero VAD to reduce false positives
 * from instruments that sound similar to voice.
 */

import { Data, Effect } from "effect"

// --- Types ---

export interface ClassificationCategory {
  readonly category: string
  readonly score: number
}

export type ClassifierDecision =
  | {
      readonly _tag: "Allow"
      readonly reason: string
      readonly topClasses: ClassificationCategory[]
    }
  | {
      readonly _tag: "Reject"
      readonly reason: string
      readonly topClasses: ClassificationCategory[]
    }
  | {
      readonly _tag: "Defer"
      readonly reason: string
      readonly topClasses: ClassificationCategory[]
    }

export class ClassifierNotInitialized extends Data.TaggedClass(
  "ClassifierNotInitialized",
)<object> {}
export class ClassifierLoadError extends Data.TaggedClass("ClassifierLoadError")<{
  readonly cause: unknown
}> {}

export type ClassifierError = ClassifierNotInitialized | ClassifierLoadError

// --- Configuration ---

export interface AudioClassifierConfig {
  readonly enabled: boolean
  readonly singingThreshold: number
  readonly speechThreshold: number
  readonly instrumentRejectThreshold: number
  readonly maxResults: number
  readonly scoreThreshold: number
}

export const DEFAULT_CLASSIFIER_CONFIG: AudioClassifierConfig = {
  enabled: true,
  singingThreshold: 0.3,
  speechThreshold: 0.5,
  instrumentRejectThreshold: 0.4,
  maxResults: 10,
  scoreThreshold: 0.1,
}

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

// Music classes that often accompany singing (don't reject just because Music is detected)
const MUSIC_CLASSES = new Set(["Music", "Musical instrument", "Plucked string instrument"])

const INSTRUMENT_REJECT_CLASSES = new Set([
  "Guitar",
  "Acoustic guitar",
  "Electric guitar",
  "Steel guitar, slide guitar",
  "Harmonica",
  "Whistle",
  "Whistling",
  "Flute",
  "Recorder",
  "Organ",
  "Synthesizer",
  "Drum kit",
  "Drum",
  "Snare drum",
  "Hi-hat",
  "Bass drum",
  "Cymbal",
  "Tambourine",
  "Maracas",
])

// Instruments that are especially confusing for voice detection
const HIGH_PRIORITY_REJECT = new Set(["Harmonica", "Whistle", "Whistling"])

// --- CDN URLs ---

const MEDIAPIPE_WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
const YAMNET_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite"

// --- Service Implementation ---

type AudioClassifier = Awaited<
  ReturnType<typeof import("@mediapipe/tasks-audio").AudioClassifier.createFromOptions>
>

export class AudioClassifierService {
  private classifier: AudioClassifier | null = null
  private initPromise: Promise<void> | null = null
  private config: AudioClassifierConfig = DEFAULT_CLASSIFIER_CONFIG

  readonly initialize = (): Effect.Effect<void, ClassifierLoadError> => {
    return Effect.tryPromise({
      try: async () => {
        if (this.classifier) return
        if (this.initPromise) {
          await this.initPromise
          return
        }

        this.initPromise = this.doInitialize()
        await this.initPromise
      },
      catch: error => new ClassifierLoadError({ cause: error }),
    })
  }

  private async doInitialize(): Promise<void> {
    const { AudioClassifier, FilesetResolver } = await import("@mediapipe/tasks-audio")

    const audio = await FilesetResolver.forAudioTasks(MEDIAPIPE_WASM_CDN)

    // Suppress TensorFlow Lite INFO messages during classifier creation
    // The WASM module may use various console methods
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
      this.classifier = await AudioClassifier.createFromOptions(audio, {
        baseOptions: {
          modelAssetPath: YAMNET_MODEL_URL,
        },
        maxResults: this.config.maxResults,
        scoreThreshold: this.config.scoreThreshold,
      })

      // Warm-up classification to trigger TensorFlow Lite delegate creation
      // while console is suppressed (the INFO message appears on first classify)
      const warmupSamples = new Float32Array(16000) // 1 second of silence at 16kHz
      this.classifier.classify(warmupSamples, 16000)
    } finally {
      console.log = originalLog
      console.info = originalInfo
      console.warn = originalWarn
      console.error = originalError
    }
  }

  isInitialized(): boolean {
    return this.classifier !== null
  }

  setConfig(config: Partial<AudioClassifierConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): AudioClassifierConfig {
    return this.config
  }

  /**
   * Classify an audio buffer and return a decision
   *
   * @param samples Float32Array of audio samples (mono)
   * @param sampleRate Sample rate of the audio (e.g., 16000, 44100, 48000)
   * @returns ClassifierDecision indicating whether to allow, reject, or defer
   */
  readonly classify = (
    samples: Float32Array,
    sampleRate: number,
  ): Effect.Effect<ClassifierDecision, ClassifierNotInitialized> => {
    return Effect.sync(() => {
      if (!this.classifier) {
        return Effect.fail(new ClassifierNotInitialized({}))
      }

      const results = this.classifier.classify(samples, sampleRate)

      if (!results.length || !results[0]?.classifications?.length) {
        return Effect.succeed<ClassifierDecision>({
          _tag: "Defer",
          reason: "No classification results",
          topClasses: [],
        })
      }

      const categories = results[0].classifications[0]?.categories ?? []
      const topClasses: ClassificationCategory[] = categories.map(c => ({
        category: c.categoryName ?? "unknown",
        score: c.score,
      }))

      const decision = this.makeDecision(topClasses)
      return Effect.succeed(decision)
    }).pipe(Effect.flatten)
  }

  private makeDecision(topClasses: ClassificationCategory[]): ClassifierDecision {
    let bestSinging = 0
    let bestSpeech = 0
    let bestInstrument = 0
    let bestMusic = 0
    let instrumentName = ""
    let hasHighPriorityReject = false
    let highPriorityName = ""

    for (const { category, score } of topClasses) {
      if (SINGING_CLASSES.has(category) && score > bestSinging) {
        bestSinging = score
      }
      if (SPEECH_CLASSES.has(category) && score > bestSpeech) {
        bestSpeech = score
      }
      if (MUSIC_CLASSES.has(category) && score > bestMusic) {
        bestMusic = score
      }
      if (INSTRUMENT_REJECT_CLASSES.has(category) && score > bestInstrument) {
        bestInstrument = score
        instrumentName = category
      }
      if (HIGH_PRIORITY_REJECT.has(category) && score > 0.25) {
        hasHighPriorityReject = true
        highPriorityName = category
      }
    }

    // Combined voice score (best of singing or speech)
    const bestVoice = Math.max(bestSinging, bestSpeech)

    // ALLOW: Singing detected with confidence
    if (bestSinging >= this.config.singingThreshold) {
      return {
        _tag: "Allow",
        reason: `Singing detected (${bestSinging.toFixed(2)})`,
        topClasses,
      }
    }

    // ALLOW: Music + any moderate voice component (singing with accompaniment)
    if (bestMusic > 0.3 && bestVoice > 0.15) {
      return {
        _tag: "Allow",
        reason: `Music with voice (music=${bestMusic.toFixed(2)}, voice=${bestVoice.toFixed(2)})`,
        topClasses,
      }
    }

    // ALLOW: Speech with confidence (even with some instrument)
    if (bestSpeech >= this.config.speechThreshold) {
      return {
        _tag: "Allow",
        reason: `Speech detected (${bestSpeech.toFixed(2)})`,
        topClasses,
      }
    }

    // REJECT: High-priority instruments (harmonica, whistle) with NO voice
    if (hasHighPriorityReject && bestVoice < 0.2) {
      return {
        _tag: "Reject",
        reason: `Detected ${highPriorityName} (no voice detected)`,
        topClasses,
      }
    }

    // REJECT: Strong instrument with very weak voice
    if (
      bestInstrument >= this.config.instrumentRejectThreshold &&
      bestVoice < 0.15
    ) {
      return {
        _tag: "Reject",
        reason: `Instrument only: ${instrumentName} (${bestInstrument.toFixed(2)}, voice=${bestVoice.toFixed(2)})`,
        topClasses,
      }
    }

    // REJECT: Strong music detection with NO voice (likely instrumental playing)
    // This catches guitar strumming that YAMNet classifies as generic "Music"
    if (bestMusic >= 0.4 && bestVoice < 0.1) {
      return {
        _tag: "Reject",
        reason: `Music without voice (music=${bestMusic.toFixed(2)}, voice=${bestVoice.toFixed(2)})`,
        topClasses,
      }
    }

    // DEFER: Uncertain, let Silero decision stand
    return {
      _tag: "Defer",
      reason: `Uncertain (voice=${bestVoice.toFixed(2)}, instrument=${bestInstrument.toFixed(2)}, music=${bestMusic.toFixed(2)})`,
      topClasses,
    }
  }

  /**
   * Classify synchronously (for use in non-Effect contexts)
   * Returns null if classifier not initialized
   */
  classifySync(samples: Float32Array, sampleRate: number): ClassifierDecision | null {
    if (!this.classifier) return null

    const results = this.classifier.classify(samples, sampleRate)

    if (!results.length || !results[0]?.classifications?.length) {
      return { _tag: "Defer", reason: "No classification results", topClasses: [] }
    }

    const categories = results[0].classifications[0]?.categories ?? []
    const topClasses: ClassificationCategory[] = categories.map(c => ({
      category: c.categoryName ?? "unknown",
      score: c.score,
    }))

    return this.makeDecision(topClasses)
  }

  destroy(): void {
    this.classifier?.close()
    this.classifier = null
    this.initPromise = null
  }
}

// --- Singleton with lazy initialization ---

let classifierInstance: AudioClassifierService | null = null
let classifierPromise: Promise<AudioClassifierService> | null = null

/**
 * Get or create the audio classifier singleton
 * Lazy-loads the classifier on first call
 */
export async function getAudioClassifier(): Promise<AudioClassifierService> {
  if (classifierInstance?.isInitialized()) {
    return classifierInstance
  }

  if (classifierPromise) {
    return classifierPromise
  }

  classifierPromise = (async () => {
    classifierInstance = new AudioClassifierService()
    await Effect.runPromise(classifierInstance.initialize())
    return classifierInstance
  })()

  return classifierPromise
}

/**
 * Get classifier if already initialized, otherwise null
 */
export function getAudioClassifierIfReady(): AudioClassifierService | null {
  return classifierInstance?.isInitialized() ? classifierInstance : null
}

/**
 * Destroy the classifier singleton and free resources
 */
export function destroyAudioClassifier(): void {
  classifierInstance?.destroy()
  classifierInstance = null
  classifierPromise = null
}
