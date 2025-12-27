"use client"

import { vadLog } from "@/lib/vad-log"
import { Data, Effect } from "effect"
import type * as Tone from "tone"

type ToneModule = typeof import("tone")

export class MicPermissionDenied extends Data.TaggedClass("MicPermissionDenied")<{
  readonly cause: unknown
}> {}

export class AudioNotInitialized extends Data.TaggedClass("AudioNotInitialized")<object> {}

export type AudioError = MicPermissionDenied | AudioNotInitialized

/**
 * SoundSystem - Centralized audio management for ScrollTunes
 *
 * This is a singleton that owns the AudioContext and provides:
 * - UI feedback sounds (clicks, notifications)
 * - Metronome functionality
 * - Mic input access for voice detection
 *
 * Reference: kitlangton/visual-effect TaskSounds.ts
 */
class SoundSystem {
  private Tone: ToneModule | null = null

  private synthClick: Tone.PolySynth<Tone.Synth> | null = null
  private synthNotification: Tone.PolySynth<Tone.Synth> | null = null
  private synthMetronome: Tone.PolySynth<Tone.Synth> | null = null

  private reverb: Tone.Reverb | null = null
  private volume: Tone.Volume | null = null
  private desiredVolume = 0.5 // Store the desired volume before initialization

  private initialized = false
  private initializing: Effect.Effect<void, AudioNotInitialized> | null = null
  private muted = false

  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  // Ring buffer for classifier audio capture (16kHz, 1 second)
  private static readonly CLASSIFIER_SAMPLE_RATE = 16000
  private static readonly CLASSIFIER_BUFFER_SECONDS = 1.0
  private classifierBuffer: Float32Array = new Float32Array(
    SoundSystem.CLASSIFIER_SAMPLE_RATE * SoundSystem.CLASSIFIER_BUFFER_SECONDS,
  )
  private classifierBufferWriteIndex = 0
  private classifierScriptProcessor: ScriptProcessorNode | null = null
  private classifierSilentNode: GainNode | null = null
  // Dedicated AudioContext for classifier (avoids Tone.js wrapper issues)
  private classifierAudioContext: AudioContext | null = null
  private classifierMicSource: MediaStreamAudioSourceNode | null = null

  private async getTone(): Promise<ToneModule> {
    if (this.Tone) return this.Tone
    this.Tone = await import("tone")
    return this.Tone
  }

  readonly initializeEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      if (this.initialized) return

      if (this.initializing) {
        yield* this.initializing
        return
      }

      const doInit: Effect.Effect<void, AudioNotInitialized> = Effect.gen(this, function* () {
        const Tone = yield* Effect.tryPromise({
          try: () => this.getTone(),
          catch: () => new AudioNotInitialized({}),
        })

        yield* Effect.tryPromise({
          try: () => Tone.start(),
          catch: () => new AudioNotInitialized({}),
        })

        this.volume = new Tone.Volume(-12).toDestination()
        this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 }).connect(this.volume)

        this.synthClick = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        }).connect(this.reverb)

        this.synthNotification = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.05, release: 0.3 },
        }).connect(this.reverb)

        this.synthMetronome = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
        }).connect(this.volume)

        // Apply desired volume after initialization
        this.applyVolume()

        this.initialized = true
      })

      this.initializing = doInit

      yield* Effect.ensuring(
        doInit,
        Effect.sync(() => {
          this.initializing = null
        }),
      )
    },
  )

  async initialize(): Promise<void> {
    return Effect.runPromise(this.initializeEffect)
  }

  readonly readyEffect: Effect.Effect<boolean, never> = Effect.gen(this, function* () {
    if (this.muted) return false
    yield* Effect.catchAll(this.initializeEffect, () => Effect.succeed(undefined))
    return true
  })

  getAudioContext(): AudioContext | null {
    if (!this.initialized || !this.Tone) return null
    return this.Tone.getContext().rawContext as AudioContext
  }

  readonly getMicrophoneAnalyserEffect: Effect.Effect<AnalyserNode, AudioError> = Effect.gen(
    this,
    function* () {
      yield* this.initializeEffect

      const context = this.getAudioContext()
      if (!context) {
        return yield* Effect.fail(new AudioNotInitialized({}))
      }

      const micStream = yield* Effect.tryPromise({
        try: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }),
        catch: e => new MicPermissionDenied({ cause: e }),
      })

      this.micStream = micStream
      this.micSource = context.createMediaStreamSource(this.micStream)
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.8

      this.micSource.connect(this.analyser)

      // Set up classifier audio capture (parallel path)
      this.setupClassifierCapture(context)

      return this.analyser
    },
  )

  private setupClassifierCapture(_context: AudioContext): void {
    if (!this.micStream) {
      vadLog("AUDIO-CAPTURE", "setupClassifierCapture: no micStream, skipping")
      return
    }

    // Clean up any existing capture
    this.stopClassifierCapture()

    // Create a dedicated native AudioContext for classifier capture
    // This avoids any Tone.js wrapper issues with createScriptProcessor
    try {
      this.classifierAudioContext = new AudioContext({ sampleRate: 48000 })
    } catch (e) {
      vadLog("AUDIO-CAPTURE", "Failed to create AudioContext for classifier", {
        error: String(e),
      })
      return
    }

    vadLog("AUDIO-CAPTURE", "Created dedicated AudioContext for classifier", {
      sampleRate: this.classifierAudioContext.sampleRate,
      state: this.classifierAudioContext.state,
      hasCreateScriptProcessor:
        typeof this.classifierAudioContext.createScriptProcessor === "function",
    })

    // Check if createScriptProcessor is available
    if (typeof this.classifierAudioContext.createScriptProcessor !== "function") {
      vadLog("AUDIO-CAPTURE", "ScriptProcessorNode not available, classifier capture disabled")
      this.classifierAudioContext.close()
      this.classifierAudioContext = null
      return
    }

    // Create mic source on our dedicated context using the same stream
    this.classifierMicSource = this.classifierAudioContext.createMediaStreamSource(this.micStream)

    // Calculate downsample ratio
    const downsampleRatio = Math.round(
      this.classifierAudioContext.sampleRate / SoundSystem.CLASSIFIER_SAMPLE_RATE,
    )
    vadLog("AUDIO-CAPTURE", "Setting up classifier capture", {
      sampleRate: this.classifierAudioContext.sampleRate,
      downsampleRatio,
      targetRate: SoundSystem.CLASSIFIER_SAMPLE_RATE,
    })

    // Create ScriptProcessor for capturing audio samples
    const bufferSize = 4096
    this.classifierScriptProcessor = this.classifierAudioContext.createScriptProcessor(
      bufferSize,
      1,
      1,
    )

    let frameCount = 0
    this.classifierScriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0)
      frameCount++

      // Log first few frames to verify audio is flowing
      if (frameCount <= 3) {
        const rms = Math.sqrt(input.reduce((sum, s) => sum + s * s, 0) / input.length)
        vadLog("AUDIO-CAPTURE", `Frame ${frameCount} captured`, {
          samples: input.length,
          rms: rms.toFixed(4),
          writeIdx: this.classifierBufferWriteIndex,
        })
      }

      // Downsample and write to ring buffer
      for (let i = 0; i < input.length; i += downsampleRatio) {
        const sample = input[i]
        if (sample !== undefined) {
          this.classifierBuffer[this.classifierBufferWriteIndex] = sample
          this.classifierBufferWriteIndex =
            (this.classifierBufferWriteIndex + 1) % this.classifierBuffer.length
        }
      }
    }

    // Connect to a silent output (required for ScriptProcessor to work)
    this.classifierSilentNode = this.classifierAudioContext.createGain()
    this.classifierSilentNode.gain.value = 0

    this.classifierMicSource.connect(this.classifierScriptProcessor)
    this.classifierScriptProcessor.connect(this.classifierSilentNode)
    this.classifierSilentNode.connect(this.classifierAudioContext.destination)

    vadLog("AUDIO-CAPTURE", "✅ Classifier capture set up", {
      scriptProcessor: !!this.classifierScriptProcessor,
      silentNode: !!this.classifierSilentNode,
    })
  }

  private stopClassifierCapture(): void {
    if (this.classifierScriptProcessor) {
      this.classifierScriptProcessor.disconnect()
      this.classifierScriptProcessor = null
    }
    if (this.classifierSilentNode) {
      this.classifierSilentNode.disconnect()
      this.classifierSilentNode = null
    }
    if (this.classifierMicSource) {
      this.classifierMicSource.disconnect()
      this.classifierMicSource = null
    }
    if (this.classifierAudioContext) {
      void this.classifierAudioContext.close()
      this.classifierAudioContext = null
    }
    this.classifierBuffer.fill(0)
    this.classifierBufferWriteIndex = 0
  }

  /**
   * Get a contiguous copy of the classifier audio buffer (last 1 second at 16kHz)
   * Returns null if mic is not active
   */
  getClassifierAudioBuffer(): Float32Array | null {
    if (!this.classifierMicSource || !this.classifierScriptProcessor) {
      vadLog("AUDIO-CAPTURE", "getClassifierAudioBuffer: returning null", {
        classifierMicSource: !!this.classifierMicSource,
        scriptProcessor: !!this.classifierScriptProcessor,
      })
      return null
    }

    const len = this.classifierBuffer.length
    const writeIdx = this.classifierBufferWriteIndex
    const out = new Float32Array(len)

    // Copy from ring buffer as contiguous array (oldest to newest)
    const start = writeIdx // writeIdx points to oldest sample
    if (start === 0) {
      out.set(this.classifierBuffer)
    } else {
      // First part: from writeIdx to end
      out.set(this.classifierBuffer.subarray(start), 0)
      // Second part: from 0 to writeIdx
      out.set(this.classifierBuffer.subarray(0, start), len - start)
    }

    return out
  }

  /**
   * Get the sample rate of the classifier buffer
   */
  getClassifierSampleRate(): number {
    return SoundSystem.CLASSIFIER_SAMPLE_RATE
  }

  async getMicrophoneAnalyser(): Promise<AnalyserNode | null> {
    return Effect.runPromise(
      Effect.catchAll(this.getMicrophoneAnalyserEffect, e => {
        console.error("Failed to get microphone access:", e)
        return Effect.succeed(null)
      }),
    )
  }

  readonly stopMicrophoneEffect: Effect.Effect<void, never> = Effect.sync(() => {
    // Stop classifier capture first
    this.stopClassifierCapture()

    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop()
      }
      this.micStream = null
    }
    if (this.micSource) {
      this.micSource.disconnect()
      this.micSource = null
    }
    this.analyser = null
  })

  stopMicrophone(): void {
    Effect.runSync(this.stopMicrophoneEffect)
  }

  readonly playClickEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      const ready = yield* this.readyEffect
      if (!ready || !this.Tone) return
      this.synthClick?.triggerAttackRelease("G5", "32n", undefined, 0.3)
    },
  )

  async playClick(): Promise<void> {
    return Effect.runPromise(Effect.catchAll(this.playClickEffect, () => Effect.void))
  }

  readonly playNotificationEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      const ready = yield* this.readyEffect
      if (!ready || !this.Tone) return
      const now = this.Tone.now()
      this.synthNotification?.triggerAttackRelease("C5", "16n", now, 0.4)
      this.synthNotification?.triggerAttackRelease("E5", "16n", now + 0.1, 0.4)
    },
  )

  async playNotification(): Promise<void> {
    return Effect.runPromise(Effect.catchAll(this.playNotificationEffect, () => Effect.void))
  }

  readonly playSuccessEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      const ready = yield* this.readyEffect
      if (!ready || !this.Tone) return
      const now = this.Tone.now()
      this.synthNotification?.triggerAttackRelease("C5", "16n", now, 0.4)
      this.synthNotification?.triggerAttackRelease("E5", "16n", now + 0.08, 0.4)
      this.synthNotification?.triggerAttackRelease("G5", "16n", now + 0.16, 0.4)
    },
  )

  async playSuccess(): Promise<void> {
    return Effect.runPromise(Effect.catchAll(this.playSuccessEffect, () => Effect.void))
  }

  readonly playMetronomeTickEffect: (accent?: boolean) => Effect.Effect<void, AudioNotInitialized> =
    (accent = false) =>
      Effect.gen(this, function* () {
        const ready = yield* this.readyEffect
        if (!ready || !this.Tone) return
        const note = accent ? "C5" : "G4"
        const velocity = accent ? 0.6 : 0.3
        this.synthMetronome?.triggerAttackRelease(note, "32n", undefined, velocity)
      })

  async playMetronomeTick(accent = false): Promise<void> {
    return Effect.runPromise(
      Effect.catchAll(this.playMetronomeTickEffect(accent), () => Effect.void),
    )
  }

  readonly playVoiceDetectedEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      const ready = yield* this.readyEffect
      if (!ready || !this.Tone) return
      this.synthClick?.triggerAttackRelease("E6", "64n", undefined, 0.2)
    },
  )

  async playVoiceDetected(): Promise<void> {
    return Effect.runPromise(Effect.catchAll(this.playVoiceDetectedEffect, () => Effect.void))
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  isMuted(): boolean {
    return this.muted
  }

  setVolume(volume: number): void {
    this.desiredVolume = Math.max(0, Math.min(1, volume))
    this.applyVolume()
  }

  private applyVolume(): void {
    if (!this.volume) return
    const db = this.desiredVolume === 0 ? Number.NEGATIVE_INFINITY : -40 + this.desiredVolume * 40
    this.volume.volume.value = db
  }

  isInitialized(): boolean {
    return this.initialized
  }

  readonly disposeEffect: Effect.Effect<void, never> = Effect.gen(this, function* () {
    yield* this.stopMicrophoneEffect

    yield* Effect.sync(() => {
      this.synthClick?.dispose()
      this.synthClick = null

      this.synthNotification?.dispose()
      this.synthNotification = null

      this.synthMetronome?.dispose()
      this.synthMetronome = null

      this.reverb?.dispose()
      this.reverb = null

      this.volume?.dispose()
      this.volume = null

      this.initialized = false
    })
  })

  async dispose(): Promise<void> {
    return Effect.runPromise(this.disposeEffect)
  }

  readonly resetEffect: Effect.Effect<void, never> = Effect.gen(this, function* () {
    yield* this.disposeEffect
    this.initializing = null
    this.muted = false
  })

  async reset(): Promise<void> {
    return Effect.runPromise(this.resetEffect)
  }
}

export const soundSystem = new SoundSystem()
