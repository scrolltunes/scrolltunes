"use client"

import { Data, Effect } from "effect"
import * as Tone from "tone"

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
  private synthClick: Tone.PolySynth | null = null
  private synthNotification: Tone.PolySynth | null = null
  private synthMetronome: Tone.PolySynth | null = null

  private reverb: Tone.Reverb | null = null
  private volume: Tone.Volume | null = null

  private initialized = false
  private initializing: Effect.Effect<void, AudioNotInitialized> | null = null
  private muted = false

  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  readonly initializeEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* () {
      if (this.initialized) return

      if (this.initializing) {
        yield* this.initializing
        return
      }

      const doInit: Effect.Effect<void, AudioNotInitialized> = Effect.gen(this, function* () {
        yield* Effect.tryPromise({
          try: () => Tone.start(),
          catch: () => new AudioNotInitialized({}),
        })

        this.volume = new Tone.Volume(-12).toDestination()
        this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 }).connect(this.volume)

        this.synthClick = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
        } as Tone.SynthOptions).connect(this.reverb)

        this.synthNotification = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.05, release: 0.3 },
        } as Tone.SynthOptions).connect(this.reverb)

        this.synthMetronome = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
        } as Tone.SynthOptions).connect(this.volume)

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
    if (!this.initialized) return null
    return Tone.getContext().rawContext as AudioContext
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
      return this.analyser
    },
  )

  async getMicrophoneAnalyser(): Promise<AnalyserNode | null> {
    return Effect.runPromise(
      Effect.catchAll(this.getMicrophoneAnalyserEffect, e => {
        console.error("Failed to get microphone access:", e)
        return Effect.succeed(null)
      }),
    )
  }

  readonly stopMicrophoneEffect: Effect.Effect<void, never> = Effect.sync(() => {
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
      if (!ready) return
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
      if (!ready) return
      const now = Tone.now()
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
      if (!ready) return
      const now = Tone.now()
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
        if (!ready) return
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
      if (!ready) return
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
    if (!this.volume) return
    const db = volume === 0 ? Number.NEGATIVE_INFINITY : -40 + volume * 40
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
