"use client"

/**
 * VoiceActivityStore - Backward compatibility wrapper
 *
 * @deprecated Use SingingDetectionService hooks directly:
 * - useSingingDetection() instead of useVoiceActivity()
 * - useSingingControls() instead of useVoiceControls()
 *
 * This module re-exports from SingingDetectionService for backward compatibility.
 */

import {
  type DetailedActivityStatus,
  type MicPermissionStatus,
  type SileroPreset,
  type SileroVADConfig,
  type SingingDetectionState,
  SingingDetectionStore,
  StartListening,
  StopListening,
  UpdateLevel,
  type VADConfig,
  type VADEngineType,
  VADError,
  type VADEvent,
  type VoiceDetectionService,
  VoiceStart,
  VoiceStop,
  singingDetectionStore,
  useDetailedSingingStatus,
  useIsSinging,
  useSingingControls,
  useSingingDetection,
} from "./SingingDetectionService"

export type {
  VADConfig,
  SileroVADConfig,
  SileroPreset,
  MicPermissionStatus,
  DetailedActivityStatus,
  VADEngineType,
  VADEvent,
  VoiceDetectionService,
}
export { VADError, StartListening, StopListening, VoiceStart, VoiceStop, UpdateLevel }

export type VoiceState = SingingDetectionState

/** @deprecated Use SingingDetectionStore */
export const VoiceActivityStore = SingingDetectionStore

export const voiceActivityStore = singingDetectionStore

/** @deprecated Use useSingingDetection() instead */
export function useVoiceActivity(): VoiceState {
  return useSingingDetection()
}

/** @deprecated Use useIsSinging() instead */
export function useIsSpeaking(): boolean {
  return useIsSinging()
}

/** @deprecated Use useDetailedSingingStatus() instead */
export function useDetailedActivityStatus(): DetailedActivityStatus {
  return useDetailedSingingStatus()
}

/** @deprecated Use useSingingControls() instead */
export function useVoiceControls() {
  return useSingingControls()
}
