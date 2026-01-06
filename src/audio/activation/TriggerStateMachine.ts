/**
 * TriggerStateMachine - Core false-positive killer for singing detection
 *
 * Implements the trigger logic from the design document:
 * - EMA smoothing of probability
 * - Hold timer (must stay above threshold for holdMs before triggering)
 * - Hysteresis (different start/stop thresholds)
 * - Cooldown (suppress retriggers for cooldownMs after trigger)
 * - Speech rejection (if enabled, speech inhibits trigger)
 */

import type { SingingDetectorConfig } from "@/core/PreferencesStore"

export type TriggerState = "idle" | "accumulating" | "triggered" | "cooldown"

export interface TriggerInput {
  readonly pSinging: number
  readonly pSpeech?: number
  readonly timestamp: number
}

export interface TriggerOutput {
  readonly state: TriggerState
  readonly smoothedProbability: number
  readonly shouldTrigger: boolean
  readonly holdProgress: number // 0-1, how far through holdMs
}

/**
 * Creates a pure function trigger state machine
 */
export function createTriggerStateMachine(config: SingingDetectorConfig) {
  let state: TriggerState = "idle"
  let smoothedP = 0
  let accumulateStartAt: number | null = null
  let lastTriggerAt: number | null = null

  /**
   * Process a new probability sample and return the new state
   */
  function process(input: TriggerInput): TriggerOutput {
    const { pSinging, pSpeech, timestamp } = input

    // EMA smoothing: pSmooth = (1 - alpha) * pSmooth + alpha * pNow
    smoothedP = (1 - config.emaAlpha) * smoothedP + config.emaAlpha * pSinging

    // Check if in cooldown
    if (state === "cooldown") {
      if (lastTriggerAt !== null && timestamp - lastTriggerAt >= config.cooldownMs) {
        // Cooldown expired - transition based on current probability
        lastTriggerAt = null
        if (smoothedP >= config.stopThreshold) {
          // Still singing - go to triggered state (not idle)
          state = "triggered"
        } else {
          // Stopped singing - go to idle
          state = "idle"
        }
      } else {
        // Still in cooldown, don't trigger
        return {
          state,
          smoothedProbability: smoothedP,
          shouldTrigger: false,
          holdProgress: 0,
        }
      }
    }

    // Speech rejection: if speech is high, don't accumulate hold time
    const speechBlocking =
      config.rejectSpeech && pSpeech !== undefined && pSpeech > config.speechMax

    // Check thresholds based on current state
    if (state === "triggered") {
      // Hysteresis: use stopThreshold to stay triggered
      if (smoothedP < config.stopThreshold) {
        state = "idle"
        accumulateStartAt = null
      }
      return {
        state,
        smoothedProbability: smoothedP,
        shouldTrigger: false, // Already triggered
        holdProgress: 1,
      }
    }

    // State is idle or accumulating
    if (smoothedP >= config.startThreshold && !speechBlocking) {
      // Above threshold and speech not blocking
      if (state === "idle") {
        // Start accumulating
        state = "accumulating"
        accumulateStartAt = timestamp
      }

      if (state === "accumulating" && accumulateStartAt !== null) {
        const elapsed = timestamp - accumulateStartAt
        const holdProgress = Math.min(1, elapsed / config.holdMs)

        if (elapsed >= config.holdMs) {
          // Hold time reached - TRIGGER!
          state = "cooldown" // Enter cooldown immediately after trigger
          lastTriggerAt = timestamp
          accumulateStartAt = null
          return {
            state: "cooldown",
            smoothedProbability: smoothedP,
            shouldTrigger: true,
            holdProgress: 1,
          }
        }

        return {
          state,
          smoothedProbability: smoothedP,
          shouldTrigger: false,
          holdProgress,
        }
      }
    } else {
      // Below threshold or speech blocking - reset accumulation
      if (state === "accumulating") {
        state = "idle"
        accumulateStartAt = null
      }
    }

    return {
      state,
      smoothedProbability: smoothedP,
      shouldTrigger: false,
      holdProgress: 0,
    }
  }

  /**
   * Reset the state machine
   */
  function reset(): void {
    state = "idle"
    smoothedP = 0
    accumulateStartAt = null
    lastTriggerAt = null
  }

  /**
   * Get current state
   */
  function getState(): TriggerState {
    return state
  }

  /**
   * Get smoothed probability
   */
  function getSmoothedProbability(): number {
    return smoothedP
  }

  return {
    process,
    reset,
    getState,
    getSmoothedProbability,
  }
}

export type TriggerStateMachine = ReturnType<typeof createTriggerStateMachine>
