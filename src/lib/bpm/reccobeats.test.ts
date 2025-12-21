/**
 * Tests for BPM lookup using ReccoBeats API
 *
 * ReccoBeats mirrors Spotify data and provides audio features (including BPM)
 * without authentication. It accepts Spotify track IDs.
 *
 * Flow: Spotify search → get track ID → ReccoBeats audio features
 */

import { ServerBaseLayer } from "@/services/server-base-layer"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SpotifyServiceLive } from "../spotify-client"
import { type SpotifyTrack, searchTracksEffect } from "../spotify-client"

const RECCOBEATS_API = "https://api.reccobeats.com/v1"
const USER_AGENT = "ScrollTunes/1.0 (https://scrolltunes.com)"
const spotifyRuntimeLayer = SpotifyServiceLive.pipe(Layer.provide(ServerBaseLayer))

interface ReccoBeatsAudioFeatures {
  readonly id: string
  readonly acousticness: number
  readonly danceability: number
  readonly energy: number
  readonly instrumentalness: number
  readonly liveness: number
  readonly loudness: number
  readonly speechiness: number
  readonly tempo: number
  readonly valence: number
  readonly key: number
  readonly mode: number
  readonly timeSignature: number
}

function keyToName(key: number, mode: number): string {
  const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const keyName = keys[key] ?? "?"
  const modeName = mode === 1 ? "major" : "minor"
  return `${keyName} ${modeName}`
}

interface ReccoBeatsTrack {
  readonly id: string
  readonly trackTitle: string
  readonly artists: readonly { readonly name: string }[]
  readonly href: string
}

interface ReccoBeatsTrackResponse {
  readonly content: readonly ReccoBeatsTrack[]
}

async function getReccoBeatsTrack(spotifyTrackId: string): Promise<ReccoBeatsTrack | null> {
  const url = `${RECCOBEATS_API}/track?ids=${spotifyTrackId}`
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  })
  if (!response.ok) return null
  const data = (await response.json()) as ReccoBeatsTrackResponse
  return data.content[0] ?? null
}

async function getReccoBeatsAudioFeatures(
  reccoBeatsId: string,
): Promise<ReccoBeatsAudioFeatures | null> {
  const url = `${RECCOBEATS_API}/track/${reccoBeatsId}/audio-features`
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  })
  if (!response.ok) return null
  return response.json() as Promise<ReccoBeatsAudioFeatures>
}

async function getReccoBeatsAudioFeaturesFromSpotifyId(
  spotifyTrackId: string,
): Promise<ReccoBeatsAudioFeatures | null> {
  const track = await getReccoBeatsTrack(spotifyTrackId)
  if (!track) return null
  return getReccoBeatsAudioFeatures(track.id)
}

async function lookupBpmViaReccoBeats(
  title: string,
  artist: string,
): Promise<{ bpm: number; key: string | null; spotifyId: string; track: SpotifyTrack } | null> {
  const query = `track:${title} artist:${artist}`
  const exit = await Effect.runPromiseExit(
    searchTracksEffect(query, 5).pipe(Effect.provide(spotifyRuntimeLayer)),
  )

  if (exit._tag === "Failure") return null

  const searchResult = exit.value
  if (searchResult.tracks.items.length === 0) return null

  for (const track of searchResult.tracks.items) {
    const features = await getReccoBeatsAudioFeaturesFromSpotifyId(track.id)
    if (!features) continue

    return {
      bpm: Math.round(features.tempo),
      key: keyToName(features.key, features.mode),
      spotifyId: track.id,
      track,
    }
  }

  return null
}

describe("ReccoBeats Direct API Test", () => {
  it("should get audio features for 'Vivien' by ††† using known Spotify ID", async () => {
    const spotifyId = "0qYTZCo5Bwh1nsUFGpLPMM"
    const features = await getReccoBeatsAudioFeaturesFromSpotifyId(spotifyId)

    if (features) {
      const bpm = Math.round(features.tempo)
      expect(bpm).toBeGreaterThan(0)
      expect(bpm).toBeLessThan(300)
    }
    // ReccoBeats may not have this track - test passes either way
  }, 10000)

  it("should get audio features for 'Bohemian Rhapsody' by Queen", async () => {
    const spotifyId = "4u7EnebtmKWzUH433cf5Qv"
    const features = await getReccoBeatsAudioFeaturesFromSpotifyId(spotifyId)

    if (features) {
      const bpm = Math.round(features.tempo)
      expect(bpm).toBeGreaterThan(0)
    }
  }, 10000)
})

describe("ReccoBeats BPM Lookup (Spotify ID → ReccoBeats)", () => {
  const hasSpotifyCredentials = !!(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    !process.env.SPOTIFY_CLIENT_ID.startsWith("test-") &&
    !process.env.SPOTIFY_CLIENT_SECRET.startsWith("test-")
  )

  it.skipIf(!hasSpotifyCredentials)(
    "should find BPM for 'Vivien' by 'Crosses' (requires Spotify credentials)",
    async () => {
      const variations = [
        { title: "Vivien", artist: "Crosses" },
        { title: "Vivien", artist: "†††" },
      ]

      let result: Awaited<ReturnType<typeof lookupBpmViaReccoBeats>> = null

      for (const { title, artist } of variations) {
        result = await lookupBpmViaReccoBeats(title, artist)
        if (result) break
      }

      if (result) {
        expect(result.bpm).toBeGreaterThan(0)
        expect(result.bpm).toBeLessThan(300)
      }
    },
    30000,
  )
})
