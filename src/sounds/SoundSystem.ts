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
  // Synths for different sounds
  private synthClick: Tone.PolySynth | null = null
  private synthNotification: Tone.PolySynth | null = null
  private synthMetronome: Tone.PolySynth | null = null

  // Effects
  private reverb: Tone.Reverb | null = null
  private volume: Tone.Volume | null = null

  // State
  private initialized = false
  private initializing: Promise<void> | null = null
  private muted = false

  // Mic input (for VAD)
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  /**
   * Guard that ensures audio is ready unless muted
   */
  private async ready(): Promise<boolean> {
    if (this.muted) return false
    await this.initialize()
    return true
  }

  /**
   * Initialize the audio system (lazy, on first use)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializing) return this.initializing

    this.initializing = (async () => {
      // Start Tone.js context (requires user gesture)
      await Tone.start()

      // Create volume control
      this.volume = new Tone.Volume(-12).toDestination()

      // Create reverb effect
      this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 }).connect(this.volume)

      // Click synth (for UI feedback)
      this.synthClick = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
      } as Tone.SynthOptions).connect(this.reverb)

      // Notification synth
      this.synthNotification = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.05, release: 0.3 },
      } as Tone.SynthOptions).connect(this.reverb)

      // Metronome synth
      this.synthMetronome = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
      } as Tone.SynthOptions).connect(this.volume) // No reverb for precise timing

      this.initialized = true
    })()

    try {
      await this.initializing
    } finally {
      this.initializing = null
    }
  }

  /**
   * Get the raw AudioContext (for VAD or other audio processing)
   */
  getAudioContext(): AudioContext | null {
    if (!this.initialized) return null
    return Tone.getContext().rawContext as AudioContext
  }

  /**
   * Request microphone access and create an analyser for VAD
   */
  async getMicrophoneAnalyser(): Promise<AnalyserNode | null> {
    try {
      await this.initialize()

      const context = this.getAudioContext()
      if (!context) return null

      // Request mic access
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Create source and analyser
      this.micSource = context.createMediaStreamSource(this.micStream)
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.8

      this.micSource.connect(this.analyser)
      // Note: We don't connect to destination - we just analyze

      return this.analyser
    } catch (error) {
      console.error("Failed to get microphone access:", error)
      return null
    }
  }

  /**
   * Effect-based microphone analyser acquisition
   */
  readonly getMicrophoneAnalyserEffect: Effect.Effect<AnalyserNode, AudioError> = Effect.gen(
    this,
    function* (_) {
      yield* _(
        Effect.tryPromise({
          try: () => this.initialize(),
          catch: e => new AudioNotInitialized({}),
        }),
      )

      const context = this.getAudioContext()
      if (!context) {
        return yield* _(Effect.fail(new AudioNotInitialized({})))
      }

      const micStream = yield* _(
        Effect.tryPromise({
          try: () =>
            navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            }),
          catch: e => new MicPermissionDenied({ cause: e }),
        }),
      )

      this.micStream = micStream
      this.micSource = context.createMediaStreamSource(this.micStream)
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.8

      this.micSource.connect(this.analyser)
      return this.analyser
    },
  )

  /**
   * Stop microphone access
   */
  stopMicrophone(): void {
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
  }

  // --- Sound effects ---

  /**
   * Play a click sound (for UI feedback)
   */
  async playClick(): Promise<void> {
    if (!(await this.ready())) return
    this.synthClick?.triggerAttackRelease("G5", "32n", undefined, 0.3)
  }

  /**
   * Play a notification chime
   */
  async playNotification(): Promise<void> {
    if (!(await this.ready())) return
    const now = Tone.now()
    this.synthNotification?.triggerAttackRelease("C5", "16n", now, 0.4)
    this.synthNotification?.triggerAttackRelease("E5", "16n", now + 0.1, 0.4)
  }

  /**
   * Play a success sound
   */
  async playSuccess(): Promise<void> {
    if (!(await this.ready())) return
    const now = Tone.now()
    this.synthNotification?.triggerAttackRelease("C5", "16n", now, 0.4)
    this.synthNotification?.triggerAttackRelease("E5", "16n", now + 0.08, 0.4)
    this.synthNotification?.triggerAttackRelease("G5", "16n", now + 0.16, 0.4)
  }

  /**
   * Play a metronome tick
   */
  async playMetronomeTick(accent = false): Promise<void> {
    if (!(await this.ready())) return
    const note = accent ? "C5" : "G4"
    const velocity = accent ? 0.6 : 0.3
    this.synthMetronome?.triggerAttackRelease(note, "32n", undefined, velocity)
  }

  /**
   * Play a voice detected sound
   */
  async playVoiceDetected(): Promise<void> {
    if (!(await this.ready())) return
    this.synthClick?.triggerAttackRelease("E6", "64n", undefined, 0.2)
  }

  /**
   * Effect-based voice detected sound
   */
  readonly playVoiceDetectedEffect: Effect.Effect<void, AudioNotInitialized> = Effect.gen(
    this,
    function* (_) {
      const ready = yield* _(
        Effect.tryPromise({
          try: () => this.ready(),
          catch: () => new AudioNotInitialized({}),
        }),
      )
      if (!ready) return
      this.synthClick?.triggerAttackRelease("E6", "64n", undefined, 0.2)
    },
  )

  // --- Control methods ---

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    this.muted = muted
  }

  /**
   * Get muted state
   */
  isMuted(): boolean {
    return this.muted
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    if (!this.volume) return
    // Map 0-1 to -Infinity to 0 dB
    const db = volume === 0 ? Number.NEGATIVE_INFINITY : -40 + volume * 40
    this.volume.volume.value = db
  }

  /**
   * Check if audio is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Dispose of all audio resources
   */
  async dispose(): Promise<void> {
    this.stopMicrophone()

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
  }

  /**
   * Reset for tests and hot-reload
   */
  async reset(): Promise<void> {
    await this.dispose()
    this.initializing = null
    this.muted = false
  }
}

// Singleton instance
export const soundSystem = new SoundSystem()
