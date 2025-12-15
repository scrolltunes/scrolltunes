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
  readonly burstPeakThreshold: number
  readonly burstDecayThreshold: number
  readonly burstWindowMs: number
}

/**
 * Runtime state for VAD calculations
 */
export interface VADRuntimeState {
  readonly smoothedLevel: number
  readonly lastStateChangeTime: number
  readonly isSpeaking: boolean
  readonly lastPeakLevel: number
  readonly lastPeakTime: number
  readonly burstDetectedUntil: number
}

/**
 * Default VAD configuration from constants
 */
export const DEFAULT_VAD_CONFIG: VADConfig = {
  thresholdOn: VAD_THRESHOLD_ON,
  thresholdOff: VAD_THRESHOLD_OFF,
  holdTimeMs: VAD_HOLD_TIME_MS,
  smoothingFactor: VAD_SMOOTHING_FACTOR,
  burstPeakThreshold: 0.4,
  burstDecayThreshold: 0.2,
  burstWindowMs: 300,
}

/**
 * Initial runtime state
 */
export const INITIAL_VAD_RUNTIME: VADRuntimeState = {
  smoothedLevel: 0,
  lastStateChangeTime: 0,
  isSpeaking: false,
  lastPeakLevel: 0,
  lastPeakTime: 0,
  burstDetectedUntil: 0,
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
 * Check if currently in a burst suppression window
 */
export function isInBurstWindow(runtime: VADRuntimeState, nowMs: number): boolean {
  return runtime.burstDetectedUntil > nowMs
}

/**
 * Detect burst transients (guitar strums) vs sustained sounds (singing)
 *
 * Guitar has fast attack + rapid decay, singing has slower attack + sustained plateau.
 * Returns updated runtime with burst detection state.
 */
export function detectBurst(
  level: number,
  runtime: VADRuntimeState,
  config: VADConfig,
  nowMs: number,
): VADRuntimeState {
  const { lastPeakLevel, lastPeakTime, burstDetectedUntil } = runtime
  const timeSincePeak = nowMs - lastPeakTime

  // Reset peak tracking if stale (> 500ms since last peak)
  if (timeSincePeak > 500) {
    return {
      ...runtime,
      lastPeakLevel: level,
      lastPeakTime: nowMs,
    }
  }

  // Track new peaks
  if (level > lastPeakLevel) {
    return {
      ...runtime,
      lastPeakLevel: level,
      lastPeakTime: nowMs,
    }
  }

  // Detect burst: 150-350ms since peak, peak was significant, and rapid decay occurred
  const decay = lastPeakLevel - level
  const isInBurstDetectionWindow = timeSincePeak >= 150 && timeSincePeak <= 350
  const peakWasSignificant = lastPeakLevel > config.burstPeakThreshold
  const hasRapidDecay = decay > config.burstDecayThreshold

  if (isInBurstDetectionWindow && peakWasSignificant && hasRapidDecay) {
    return {
      ...runtime,
      burstDetectedUntil: nowMs + config.burstWindowMs,
      lastPeakLevel: 0,
      lastPeakTime: nowMs,
    }
  }

  // Preserve existing burst window if still active
  return {
    ...runtime,
    burstDetectedUntil: burstDetectedUntil > nowMs ? burstDetectedUntil : 0,
  }
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
        ...runtime,
        smoothedLevel: level,
        isSpeaking: true,
        lastStateChangeTime: nowMs,
      }
    }
  } else {
    if (level < config.thresholdOff && timeSinceLastChange > config.holdTimeMs) {
      return {
        ...runtime,
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
