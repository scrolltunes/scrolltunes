"use client"

import { DEFAULT_SILERO_VAD_CONFIG, type SileroVADConfig } from "@/lib/silero-vad-config"
import type { MicVAD } from "@ricky0123/vad-web"
import { Data, Effect } from "effect"

// --- Error Classes ---

export class SileroLoadError extends Data.TaggedClass("SileroLoadError")<{
  readonly message: string
}> {}

export class SileroNotSupportedError extends Data.TaggedClass("SileroNotSupportedError")<object> {}

// --- Callback Types ---

export interface SileroVADCallbacks {
  readonly onSpeechStart?: () => void
  readonly onSpeechEnd?: () => void
  readonly onFrameProcessed?: (data: { isSpeech: number }) => void
}

// --- SileroVADEngine Class ---

/**
 * SileroVADEngine - Wraps @ricky0123/vad-web with Effect.ts patterns
 *
 * Provides voice activity detection using the Silero VAD model.
 * Uses dynamic imports for lazy loading and CDN paths for assets.
 */
export class SileroVADEngine {
  private vad: MicVAD | null = null
  private isRunning = false
  private callbacks: SileroVADCallbacks = {}

  /**
   * Check if browser supports AudioWorklet (required for VAD)
   */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false
    return typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined"
  }

  /**
   * Initialize the VAD engine with configuration and callbacks
   *
   * Lazily loads the @ricky0123/vad-web module and creates a MicVAD instance.
   */
  initialize(
    config: Partial<SileroVADConfig> = {},
    callbacks: SileroVADCallbacks = {},
  ): Effect.Effect<void, SileroLoadError> {
    return Effect.gen(this, function* (_) {
      if (this.vad) {
        return
      }

      const fullConfig = { ...DEFAULT_SILERO_VAD_CONFIG, ...config }
      this.callbacks = callbacks

      const vadModule = yield* _(
        Effect.tryPromise({
          try: () => import("@ricky0123/vad-web"),
          catch: error =>
            new SileroLoadError({
              message: `Failed to load VAD module: ${error instanceof Error ? error.message : String(error)}`,
            }),
        }),
      )

      const vad = yield* _(
        Effect.tryPromise({
          try: () =>
            vadModule.MicVAD.new({
              onnxWASMBasePath: fullConfig.onnxWASMBasePath,
              baseAssetPath: fullConfig.baseAssetPath,
              positiveSpeechThreshold: fullConfig.positiveSpeechThreshold,
              negativeSpeechThreshold: fullConfig.negativeSpeechThreshold,
              minSpeechMs: fullConfig.minSpeechMs,
              redemptionMs: fullConfig.redemptionMs,
              onSpeechStart: () => {
                this.callbacks.onSpeechStart?.()
              },
              onSpeechEnd: () => {
                this.callbacks.onSpeechEnd?.()
              },
              onFrameProcessed: probs => {
                this.callbacks.onFrameProcessed?.({ isSpeech: probs.isSpeech })
              },
            }),
          catch: error =>
            new SileroLoadError({
              message: `Failed to initialize MicVAD: ${error instanceof Error ? error.message : String(error)}`,
            }),
        }),
      )

      this.vad = vad
    })
  }

  /**
   * Start voice activity detection
   */
  start(): Effect.Effect<void, SileroLoadError> {
    return Effect.gen(this, function* (_) {
      if (!this.vad) {
        yield* _(
          Effect.fail(
            new SileroLoadError({ message: "VAD not initialized. Call initialize() first." }),
          ),
        )
        return
      }

      if (this.isRunning) {
        return
      }

      const vad = this.vad
      yield* _(
        Effect.tryPromise({
          try: () => vad.start(),
          catch: error =>
            new SileroLoadError({
              message: `Failed to start VAD: ${error instanceof Error ? error.message : String(error)}`,
            }),
        }),
      )

      this.isRunning = true
    })
  }

  /**
   * Pause voice activity detection (synchronous)
   */
  pause(): void {
    if (this.vad && this.isRunning) {
      this.vad.pause()
      this.isRunning = false
    }
  }

  /**
   * Destroy the VAD instance and release resources
   */
  destroy(): void {
    if (this.vad) {
      this.vad.destroy()
      this.vad = null
      this.isRunning = false
      this.callbacks = {}
    }
  }

  /**
   * Check if the VAD is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * Check if the VAD has been initialized
   */
  isInitialized(): boolean {
    return this.vad !== null
  }
}
