/**
 * ReccoBeats API client
 *
 * Provides BPM lookup via reccobeats.com API using Spotify track IDs.
 * API: https://api.reccobeats.com/v1
 *
 * Two-step flow:
 * 1. GET /track?ids={spotifyId} → ReccoBeats UUID
 * 2. GET /track/{uuid}/audio-features → tempo, key, mode
 *
 * No authentication required.
 */

import { Effect } from "effect"
import { BPMAPIError, BPMNotFoundError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"

const RECCOBEATS_BASE_URL = "https://api.reccobeats.com/v1"

const headers = {
  "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)",
}

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

let lastRequestTime = 0
const RATE_LIMIT_MS = 500

interface ReccoBeatsTrack {
  readonly id: string
  readonly trackTitle: string
  readonly artists: readonly string[]
}

interface ReccoBeatsTrackResponse {
  readonly content: readonly ReccoBeatsTrack[]
}

interface ReccoBeatsAudioFeatures {
  readonly tempo: number
  readonly key: number
  readonly mode: number
}

export interface ReccoBeatsQuery extends BPMTrackQuery {
  readonly spotifyId: string
}

function formatKey(keyIndex: number, mode: number): string | null {
  if (keyIndex < 0 || keyIndex > 11) return null
  const pitchClass = PITCH_CLASSES[keyIndex]
  if (!pitchClass) return null
  const modeName = mode === 1 ? "major" : "minor"
  return `${pitchClass} ${modeName}`
}

const enforceRateLimit = (): Effect.Effect<void> =>
  Effect.suspend(() => {
    const now = Date.now()
    const elapsed = now - lastRequestTime
    if (elapsed < RATE_LIMIT_MS) {
      const delay = RATE_LIMIT_MS - elapsed
      lastRequestTime = now + delay
      return Effect.sleep(delay)
    }
    lastRequestTime = now
    return Effect.void
  })

const lookupReccoBeatsUuid = (
  spotifyId: string,
  query: BPMTrackQuery,
): Effect.Effect<string, BPMNotFoundError | BPMAPIError> =>
  Effect.gen(function* () {
    yield* enforceRateLimit()

    const url = `${RECCOBEATS_BASE_URL}/track?ids=${encodeURIComponent(spotifyId)}`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers }),
      catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }
      return yield* Effect.fail(
        new BPMAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<ReccoBeatsTrackResponse>,
      catch: () => new BPMAPIError({ status: 0, message: "Failed to parse track response" }),
    })

    const track = data.content[0]
    if (!track) {
      return yield* Effect.fail(new BPMNotFoundError({ title: query.title, artist: query.artist }))
    }

    return track.id
  })

const fetchAudioFeatures = (
  uuid: string,
  query: BPMTrackQuery,
): Effect.Effect<ReccoBeatsAudioFeatures, BPMNotFoundError | BPMAPIError> =>
  Effect.gen(function* () {
    yield* enforceRateLimit()

    const url = `${RECCOBEATS_BASE_URL}/track/${encodeURIComponent(uuid)}/audio-features`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers }),
      catch: () => new BPMAPIError({ status: 0, message: "Network error" }),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }
      return yield* Effect.fail(
        new BPMAPIError({ status: response.status, message: response.statusText }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<ReccoBeatsAudioFeatures>,
      catch: () => new BPMAPIError({ status: 0, message: "Failed to parse audio features" }),
    })

    return data
  })

/**
 * ReccoBeats provider implementation.
 *
 * Requires a spotifyId in the query. If the query doesn't have a spotifyId,
 * returns BPMNotFoundError to allow fallback to other providers.
 */
export const reccoBeatsProvider: BPMProvider = {
  name: "ReccoBeats",

  getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMNotFoundError | BPMAPIError> {
    return Effect.gen(function* () {
      const spotifyId = (query as ReccoBeatsQuery).spotifyId
      if (!spotifyId) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      const uuid = yield* lookupReccoBeatsUuid(spotifyId, query)
      const features = yield* fetchAudioFeatures(uuid, query)

      const bpm = Math.round(features.tempo)
      if (bpm <= 0) {
        return yield* Effect.fail(
          new BPMNotFoundError({ title: query.title, artist: query.artist }),
        )
      }

      return {
        bpm,
        source: "ReccoBeats",
        key: formatKey(features.key, features.mode),
      }
    })
  },
}
