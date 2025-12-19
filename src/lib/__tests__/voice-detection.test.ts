import { describe, expect, test } from "vitest"
import {
  DEFAULT_VAD_CONFIG,
  INITIAL_VAD_RUNTIME,
  computeRMSFromByteFrequency,
  detectVoiceActivity,
  smoothLevel,
} from "../voice-detection"

describe("computeRMSFromByteFrequency", () => {
  test("returns 0 for empty array", () => {
    const data = new Uint8Array([])
    expect(computeRMSFromByteFrequency(data)).toBe(0)
  })

  test("returns 0 for silence (all zeros)", () => {
    const data = new Uint8Array([0, 0, 0, 0])
    expect(computeRMSFromByteFrequency(data)).toBe(0)
  })

  test("returns 1 for maximum values", () => {
    const data = new Uint8Array([255, 255, 255, 255])
    expect(computeRMSFromByteFrequency(data)).toBe(1)
  })

  test("returns correct RMS for mixed values", () => {
    const data = new Uint8Array([0, 255])
    const expected = Math.sqrt((0 + 1) / 2)
    expect(computeRMSFromByteFrequency(data)).toBeCloseTo(expected, 5)
  })
})

describe("smoothLevel", () => {
  test("returns sample when smoothing factor is 1", () => {
    expect(smoothLevel(0.5, 0.8, 1)).toBe(0.8)
  })

  test("returns previous when smoothing factor is 0", () => {
    expect(smoothLevel(0.5, 0.8, 0)).toBe(0.5)
  })

  test("returns weighted average", () => {
    const result = smoothLevel(0.4, 0.8, 0.3)
    const expected = 0.3 * 0.8 + 0.7 * 0.4
    expect(result).toBeCloseTo(expected, 5)
  })
})

describe("detectVoiceActivity", () => {
  const config = DEFAULT_VAD_CONFIG

  test("stays silent when level is below threshold", () => {
    const runtime = INITIAL_VAD_RUNTIME
    const result = detectVoiceActivity(0.05, runtime, config, 200)
    expect(result.isSpeaking).toBe(false)
  })

  test("transitions to speaking when level exceeds threshold after hold time", () => {
    const runtime = { ...INITIAL_VAD_RUNTIME, lastStateChangeTime: 0 }
    const result = detectVoiceActivity(0.3, runtime, config, config.holdTimeMs + 50)
    expect(result.isSpeaking).toBe(true)
    expect(result.lastStateChangeTime).toBe(config.holdTimeMs + 50)
  })

  test("does not transition to speaking within hold time", () => {
    const runtime = { ...INITIAL_VAD_RUNTIME, lastStateChangeTime: 100 }
    const result = detectVoiceActivity(0.2, runtime, config, 200)
    expect(result.isSpeaking).toBe(false)
  })

  test("transitions to silent when level drops below off threshold after hold time", () => {
    const runtime = {
      ...INITIAL_VAD_RUNTIME,
      smoothedLevel: 0.2,
      lastStateChangeTime: 0,
      isSpeaking: true,
    }
    const result = detectVoiceActivity(0.05, runtime, config, config.holdTimeMs + 50)
    expect(result.isSpeaking).toBe(false)
    expect(result.lastStateChangeTime).toBe(config.holdTimeMs + 50)
  })

  test("hysteresis: stays speaking when level is between thresholds", () => {
    const runtime = {
      ...INITIAL_VAD_RUNTIME,
      smoothedLevel: 0.2,
      lastStateChangeTime: 0,
      isSpeaking: true,
    }
    const result = detectVoiceActivity(0.1, runtime, config, 200)
    expect(result.isSpeaking).toBe(true)
  })
})
