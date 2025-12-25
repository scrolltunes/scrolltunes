/**
 * Tick-to-time conversion utilities for Guitar Pro timing data.
 *
 * Guitar Pro stores timing in MIDI ticks. These utilities convert ticks
 * to milliseconds, handling tempo changes throughout the song.
 */

import type { TempoEvent } from "./types"
import { PPQ } from "./types"

/**
 * Convert ticks to milliseconds at a constant BPM.
 *
 * Formula: ms = ticks * 60000 / (bpm * PPQ)
 *
 * @param ticks - Number of MIDI ticks
 * @param bpm - Beats per minute
 * @param ppq - Pulses per quarter note (defaults to standard 960)
 * @returns Duration in milliseconds
 */
export function ticksToMsAtBpm(ticks: number, bpm: number, ppq: number = PPQ): number {
  return (ticks * 60000) / (bpm * ppq)
}

/**
 * Convert a tick position to milliseconds, accounting for tempo changes.
 *
 * Iterates through tempo events to compute the correct time, applying
 * each tempo for its duration before the next change.
 *
 * @param tick - MIDI tick position to convert
 * @param tempoEvents - Sorted array of tempo change events
 * @param ppq - Pulses per quarter note (defaults to standard 960)
 * @returns Absolute time in milliseconds
 */
export function tickToMs(tick: number, tempoEvents: TempoEvent[], ppq: number = PPQ): number {
  let ms = 0
  let lastTick = 0
  let lastBpm = tempoEvents[0]?.bpm ?? 120

  for (const event of tempoEvents) {
    if (event.tick > tick) break

    const deltaTicks = event.tick - lastTick
    ms += ticksToMsAtBpm(deltaTicks, lastBpm, ppq)
    lastTick = event.tick
    lastBpm = event.bpm
  }

  const remainingTicks = tick - lastTick
  ms += ticksToMsAtBpm(remainingTicks, lastBpm, ppq)

  return ms
}
