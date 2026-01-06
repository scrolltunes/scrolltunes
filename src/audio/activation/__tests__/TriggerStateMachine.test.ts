import type { SingingDetectorConfig } from "@/core/PreferencesStore"
import { describe, expect, it } from "vitest"
import { createTriggerStateMachine } from "../TriggerStateMachine"

const DEFAULT_CONFIG: SingingDetectorConfig = {
  startThreshold: 0.9,
  stopThreshold: 0.6,
  holdMs: 400,
  cooldownMs: 1500,
  emaAlpha: 0.2,
  hopMs: 200,
  windowMs: 975,
  rejectSpeech: true,
  speechMax: 0.6,
  debug: false,
}

describe("TriggerStateMachine", () => {
  describe("EMA smoothing", () => {
    it("should smooth probability values using EMA", () => {
      const machine = createTriggerStateMachine(DEFAULT_CONFIG)

      // First sample at 1.0
      const result1 = machine.process({ pSinging: 1.0, timestamp: 0 })
      // With alpha = 0.2: smoothed = 0 * 0.8 + 1.0 * 0.2 = 0.2
      expect(result1.smoothedProbability).toBeCloseTo(0.2)

      // Second sample at 1.0
      const result2 = machine.process({ pSinging: 1.0, timestamp: 100 })
      // smoothed = 0.2 * 0.8 + 1.0 * 0.2 = 0.36
      expect(result2.smoothedProbability).toBeCloseTo(0.36)

      // Third sample at 0.0
      const result3 = machine.process({ pSinging: 0.0, timestamp: 200 })
      // smoothed = 0.36 * 0.8 + 0.0 * 0.2 = 0.288
      expect(result3.smoothedProbability).toBeCloseTo(0.288)
    })

    it("should converge to sustained input over time", () => {
      const machine = createTriggerStateMachine(DEFAULT_CONFIG)

      // Feed sustained 1.0 for multiple frames
      let result = { smoothedProbability: 0 }
      for (let i = 0; i < 50; i++) {
        result = machine.process({ pSinging: 1.0, timestamp: i * 100 })
      }

      // Should converge close to 1.0
      expect(result.smoothedProbability).toBeGreaterThan(0.99)
    })
  })

  describe("hold trigger logic", () => {
    it("should start accumulating when threshold is first crossed", () => {
      // Use a very long holdMs to ensure we don't trigger during the test
      const config = { ...DEFAULT_CONFIG, holdMs: 10000 }
      const machine = createTriggerStateMachine(config)

      // Build up smoothed probability just above threshold (0.9)
      // With emaAlpha = 0.2, we need about 10+ samples to get smoothed > 0.9
      for (let i = 0; i < 15; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 10 })
        // As soon as smoothed crosses 0.9, we should be accumulating
        if (result.smoothedProbability >= 0.9) {
          expect(result.state).toBe("accumulating")
          return
        }
      }

      // If we got here, verify we eventually started accumulating
      expect(machine.getState()).toBe("accumulating")
    })

    it("should trigger after holdMs of sustained high probability", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 200 }
      const machine = createTriggerStateMachine(config)

      // Process samples until we trigger
      let triggered = false
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggered = true
          break
        }
      }

      // Should eventually trigger
      expect(triggered).toBe(true)
    })

    it("should reset accumulation when probability drops below threshold", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 10000 } // Long hold to prevent trigger
      const machine = createTriggerStateMachine(config)

      // Build up probability to accumulating state
      for (let i = 0; i < 20; i++) {
        machine.process({ pSinging: 1.0, timestamp: i * 10 })
      }

      // Verify we're accumulating
      expect(machine.getState()).toBe("accumulating")

      // Drop probability significantly
      for (let i = 0; i < 50; i++) {
        machine.process({ pSinging: 0.0, timestamp: 200 + i * 10 })
      }

      // Should reset to idle (smoothed probability should be below threshold)
      expect(machine.getState()).toBe("idle")
    })
  })

  describe("hysteresis behavior", () => {
    it("should use stopThreshold for staying in triggered state after cooldown", () => {
      // After cooldown, if probability is still above stopThreshold, we should be triggered
      const config = { ...DEFAULT_CONFIG, holdMs: 100, cooldownMs: 100 }
      const machine = createTriggerStateMachine(config)

      // Build up and trigger
      let triggerTime = 0
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggerTime = i * 50
          break
        }
      }

      // Wait for cooldown to expire while keeping probability high
      const afterCooldown = machine.process({ pSinging: 0.8, timestamp: triggerTime + 200 })

      // After cooldown expires with high probability, should be triggered
      expect(afterCooldown.state).toBe("triggered")
    })

    it("should exit triggered state when below stopThreshold", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 100, cooldownMs: 100 }
      const machine = createTriggerStateMachine(config)

      // Build up and trigger
      let triggerTime = 0
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggerTime = i * 50
          break
        }
      }

      // Wait for cooldown to expire, then drop probability
      machine.process({ pSinging: 1.0, timestamp: triggerTime + 200 }) // exit cooldown while high

      // Now drop probability well below stopThreshold (0.6)
      for (let i = 0; i < 50; i++) {
        machine.process({ pSinging: 0.0, timestamp: triggerTime + 250 + i * 50 })
      }

      // Should exit triggered state
      expect(machine.getState()).toBe("idle")
    })
  })

  describe("cooldown behavior", () => {
    it("should enter cooldown after triggering", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 100, cooldownMs: 1000 }
      const machine = createTriggerStateMachine(config)

      // Build up and trigger
      let triggerResult = null
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggerResult = result
          break
        }
      }

      // When shouldTrigger is true, the returned state should be cooldown
      expect(triggerResult?.state).toBe("cooldown")
    })

    it("should suppress retriggers during cooldown", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 100, cooldownMs: 1000 }
      const machine = createTriggerStateMachine(config)

      // Build up and trigger
      let triggerTime = 0
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggerTime = i * 50
          break
        }
      }

      // During cooldown, even high probability shouldn't trigger
      const duringCooldown = machine.process({ pSinging: 1.0, timestamp: triggerTime + 500 })
      expect(duringCooldown.shouldTrigger).toBe(false)
      expect(duringCooldown.state).toBe("cooldown")
    })

    it("should allow new triggers after cooldown expires", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 100, cooldownMs: 500 }
      const machine = createTriggerStateMachine(config)

      // Build up and trigger
      let triggerTime = 0
      for (let i = 0; i < 100; i++) {
        const result = machine.process({ pSinging: 1.0, timestamp: i * 50 })
        if (result.shouldTrigger) {
          triggerTime = i * 50
          break
        }
      }

      // After cooldown expires, should be back to idle/accumulating
      const afterCooldown = machine.process({ pSinging: 1.0, timestamp: triggerTime + 600 })
      expect(afterCooldown.state).not.toBe("cooldown")
    })
  })

  describe("speech rejection", () => {
    it("should not accumulate when speech probability is high", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 10000 } // Long hold to prevent trigger
      const machine = createTriggerStateMachine(config)

      // Build up singing probability with low speech
      for (let i = 0; i < 15; i++) {
        machine.process({ pSinging: 1.0, pSpeech: 0.3, timestamp: i * 10 })
      }

      // Verify we're accumulating
      expect(machine.getState()).toBe("accumulating")

      // Now add high speech - should reset to idle
      for (let i = 0; i < 10; i++) {
        machine.process({
          pSinging: 1.0,
          pSpeech: 0.8, // Above speechMax of 0.6
          timestamp: 150 + i * 10,
        })
      }

      // Should reset to idle because speech blocks accumulation
      expect(machine.getState()).toBe("idle")
    })

    it("should allow accumulation when speech is below threshold", () => {
      const config = { ...DEFAULT_CONFIG, holdMs: 10000 } // Long hold to prevent trigger
      const machine = createTriggerStateMachine(config)

      // Build up singing probability with low speech
      for (let i = 0; i < 20; i++) {
        machine.process({
          pSinging: 1.0,
          pSpeech: 0.3, // Below speechMax of 0.6
          timestamp: i * 10,
        })
      }

      // Should be accumulating
      expect(machine.getState()).toBe("accumulating")
    })

    it("should not reject speech when rejectSpeech is disabled", () => {
      const config = { ...DEFAULT_CONFIG, rejectSpeech: false, holdMs: 10000 }
      const machine = createTriggerStateMachine(config)

      // Build up singing probability with high speech
      for (let i = 0; i < 20; i++) {
        machine.process({
          pSinging: 1.0,
          pSpeech: 0.9, // Would normally block
          timestamp: i * 10,
        })
      }

      // Should be accumulating despite high speech
      expect(machine.getState()).toBe("accumulating")
    })
  })

  describe("reset", () => {
    it("should reset all state", () => {
      const machine = createTriggerStateMachine(DEFAULT_CONFIG)

      // Build up state
      for (let i = 0; i < 20; i++) {
        machine.process({ pSinging: 1.0, timestamp: i * 50 })
      }

      // Reset
      machine.reset()

      // Should be back to initial state
      expect(machine.getState()).toBe("idle")
      expect(machine.getSmoothedProbability()).toBe(0)
    })
  })
})
