/**
 * Activation Detector Types
 *
 * Defines the interface for pluggable activation detectors.
 * Both VAD+Energy and Singing Detection implement this interface.
 */

import type { SingingDetectorConfig } from "@/core/PreferencesStore"

/**
 * Activation mode - which detector to use
 */
export type ActivationMode = "vad_energy" | "singing"

/**
 * Detector state
 */
export type DetectorState = "idle" | "listening" | "triggered"

/**
 * Events emitted by detectors
 */
export type DetectorEvent =
  | { readonly type: "probability"; readonly pSinging: number; readonly pSpeech?: number }
  | { readonly type: "state"; readonly state: DetectorState }
  | { readonly type: "trigger" }
  | { readonly type: "error"; readonly error: string }

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
  start(): Promise<void>

  /**
   * Stop listening and release resources
   */
  stop(): Promise<void>

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
