"use client"

/**
 * VoiceDetectionService - Shared interface for voice activity detection services
 *
 * Two implementations:
 * - SingingDetectionService: Full VAD + energy AND-gate for lyrics scrolling
 * - SpeechDetectionService: Simpler Silero-only VAD for voice search
 */

import type { SileroPreset, SileroVADConfig } from "@/lib/silero-vad-config"

// --- Shared Types ---

export type MicPermissionStatus = "unknown" | "granted" | "denied" | "prompt"

/**
 * Base voice detection state shared by all implementations
 */
export interface VoiceDetectionState {
  readonly isListening: boolean
  readonly isSpeaking: boolean
  readonly level: number
  readonly lastSpeakingAt: number | null
  readonly permissionDenied: boolean
  readonly permissionStatus: MicPermissionStatus
}

/**
 * VoiceDetectionService - Core interface for voice detection implementations
 *
 * Both SingingDetectionStore and SpeechDetectionStore implement this interface.
 */
export interface VoiceDetectionService<TState extends VoiceDetectionState = VoiceDetectionState> {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => TState
  readonly subscribeToVoiceEvents: (listener: () => void) => () => void
  readonly startListening: () => Promise<void>
  readonly stopListening: () => void
  readonly setSileroConfig: (config: Partial<SileroVADConfig>) => void
  readonly setSileroPreset: (preset: SileroPreset) => void
  readonly getSileroConfig: () => SileroVADConfig
  readonly isSpeaking: () => boolean
  readonly getLevel: () => number
  readonly dispose: () => void
  readonly reset: () => void
  readonly checkPermission: () => Promise<MicPermissionStatus>
  readonly requestPermission: () => Promise<boolean>
  readonly getPermissionStatus: () => MicPermissionStatus
}
