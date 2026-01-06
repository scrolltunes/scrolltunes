/**
 * Activation Detector Types
 *
 * Defines the interface for pluggable activation detectors.
 * Both VAD+Energy and Singing Detection implement this interface.
 */

import type { SingingDetectorConfig } from "@/core/PreferencesStore"
import { Data, type Effect } from "effect"

/**
 * Activation mode - which detector to use
 */
export type ActivationMode = "vad_energy" | "singing"

/**
 * Detector state
 */
export type DetectorState = "idle" | "listening" | "triggered"

/**
 * Events emitted by detectors (tagged classes)
 */
export class ProbabilityEvent extends Data.TaggedClass("ProbabilityEvent")<{
  readonly pSinging: number
  readonly pSpeech?: number
}> {}

export class StateEvent extends Data.TaggedClass("StateEvent")<{
  readonly state: DetectorState
}> {}

export class TriggerEvent extends Data.TaggedClass("TriggerEvent")<object> {}

export class ErrorEvent extends Data.TaggedClass("ErrorEvent")<{
  readonly error: string
}> {}

export type DetectorEvent = ProbabilityEvent | StateEvent | TriggerEvent | ErrorEvent

/**
 * Callback for detector events
 */
export type DetectorEventCallback = (event: DetectorEvent) => void

/**
 * Configuration for an activation detector
 */
export interface ActivationDetectorConfig {
  readonly mode: ActivationMode
  readonly singingConfig?: SingingDetectorConfig
}

/**
 * Detector errors (tagged classes)
 */
export class MicrophonePermissionError extends Data.TaggedClass("MicrophonePermissionError")<{
  readonly message: string
}> {}

export class ClassifierInitError extends Data.TaggedClass("ClassifierInitError")<{
  readonly message: string
}> {}

export class AudioCaptureError extends Data.TaggedClass("AudioCaptureError")<{
  readonly message: string
}> {}

export type DetectorError = MicrophonePermissionError | ClassifierInitError | AudioCaptureError

/**
 * Interface for activation detectors
 *
 * All detectors must implement this interface.
 * Detectors are responsible for:
 * 1. Managing microphone access
 * 2. Running their detection algorithm
 * 3. Emitting events when singing/voice is detected
 */
export interface ActivationDetector {
  /**
   * Start listening for voice/singing
   */
  start(): Effect.Effect<void, DetectorError>

  /**
   * Stop listening and release resources
   */
  stop(): Effect.Effect<void>

  /**
   * Get current detector state
   */
  getState(): DetectorState

  /**
   * Subscribe to detector events
   * Returns an unsubscribe function
   */
  onEvent(callback: DetectorEventCallback): () => void

  /**
   * Clean up resources
   */
  dispose(): void
}
