/**
 * Mock BPM data for demo and testing
 *
 * Provides BPM values for mock songs without external API calls.
 */

import { Effect } from "effect"
import { BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import { makeCacheKey } from "./bpm-types"

/**
 * Mock BPM database keyed by normalized "artist:title"
 */
const MOCK_BPM_DATA: Record<string, BPMResult> = {
  "scrolltunes:demo song": {
    bpm: 120,
    source: "MockBPM",
    key: "C",
  },
  "scrolltunes test:long test song": {
    bpm: 100,
    source: "MockBPM",
    key: "G",
  },
}

/**
 * Get mock BPM for testing/demo
 * Returns null if no mock data available
 */
export function getMockBpm(query: BPMTrackQuery): BPMResult | null {
  const key = makeCacheKey(query)
  return MOCK_BPM_DATA[key] ?? null
}

/**
 * Check if we have mock BPM data for a track
 */
export function hasMockBpm(query: BPMTrackQuery): boolean {
  const key = makeCacheKey(query)
  return key in MOCK_BPM_DATA
}

/**
 * Mock BPM provider for testing
 * Uses MOCK_BPM_DATA instead of real API
 */
export const mockBpmProvider: BPMProvider = {
  name: "MockBPM",

  getBpm(query: BPMTrackQuery) {
    const result = getMockBpm(query)
    if (result) {
      return Effect.succeed(result)
    }
    return Effect.fail(new BPMNotFoundError({ title: query.title, artist: query.artist }))
  },
}
