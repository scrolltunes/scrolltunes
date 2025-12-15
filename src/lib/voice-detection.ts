/**
 * Pure voice activity detection functions
 *
 * Keep pure math here; side effects belong in core/VoiceActivityStore.ts
 */

import {
  VAD_HOLD_TIME_MS,
  VAD_SMOOTHING_FACTOR,
  VAD_THRESHOLD_OFF,
  VAD_THRESHOLD_ON,
} from "@/constants"

/**
 * VAD configuration
 */
export interface VADConfig {
  readonly thresholdOn: number
  readonly thresholdOff: number
  readonly holdTimeMs: number
  readonly smoothingFactor: number
}

/**
 * Runtime state for VAD calculations
 */
export interface VADRuntimeState {
  readonly smoothedLevel: number
  readonly lastStateChangeTime: number
  readonly isSpeaking: boolean
}

/**
 * Default VAD configuration from constants
 */
export const DEFAULT_VAD_CONFIG: VADConfig = {
  thresholdOn: VAD_THRESHOLD_ON,
  thresholdOff: VAD_THRESHOLD_OFF,
  holdTimeMs: VAD_HOLD_TIME_MS,
  smoothingFactor: VAD_SMOOTHING_FACTOR,
}

/**
 * Initial runtime state
 */
export const INITIAL_VAD_RUNTIME: VADRuntimeState = {
  smoothedLevel: 0,
  lastStateChangeTime: 0,
  isSpeaking: false,
}

/**
 * Compute RMS energy (0-1) from byte frequency data (0-255)
 */
export function computeRMSFromByteFrequency(data: Uint8Array): number {
  if (data.length === 0) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const value = (data[i] ?? 0) / 255
    sum += value * value
  }
  return Math.sqrt(sum / data.length)
}

/**
 * Apply exponential smoothing to a level value
 */
export function smoothLevel(previous: number, sample: number, smoothingFactor: number): number {
  return smoothingFactor * sample + (1 - smoothingFactor) * previous
}

/**
 * Detect voice activity with hysteresis
 *
 * Returns the next runtime state based on current level and config
 */
export function detectVoiceActivity(
  level: number,
  runtime: VADRuntimeState,
  config: VADConfig,
  nowMs: number,
): VADRuntimeState {
  const { isSpeaking, lastStateChangeTime } = runtime
  const timeSinceLastChange = nowMs - lastStateChangeTime

  if (!isSpeaking) {
    if (level > config.thresholdOn && timeSinceLastChange > config.holdTimeMs) {
      return {
        smoothedLevel: level,
        isSpeaking: true,
        lastStateChangeTime: nowMs,
      }
    }
  } else {
    if (level < config.thresholdOff && timeSinceLastChange > config.holdTimeMs) {
      return {
        smoothedLevel: level,
        isSpeaking: false,
        lastStateChangeTime: nowMs,
      }
    }
  }

  return {
    ...runtime,
    smoothedLevel: level,
  }
}
