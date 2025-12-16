import {
  type BPMResult,
  deezerBpmProvider,
  getBpmRace,
  getBpmWithFallback,
  getSongBpmProvider,
  reccoBeatsProvider,
  withInMemoryCache,
} from "@/lib/bpm"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import {
  LyricsAPIError,
  LyricsNotFoundError,
  getLyrics,
  getLyricsCached,
  searchLyrics,
} from "@/lib/lyrics-client"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

const bpmProviders = [withInMemoryCache(getSongBpmProvider), withInMemoryCache(deezerBpmProvider)]
const bpmRaceProviders = [
  withInMemoryCache(reccoBeatsProvider),
  withInMemoryCache(getSongBpmProvider),
  withInMemoryCache(deezerBpmProvider),
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const track = searchParams.get("track")
  const artist = searchParams.get("artist")
  const album = searchParams.get("album")
  const rawDuration = searchParams.get("duration")
  const parsed = rawDuration !== null ? Number.parseFloat(rawDuration) : undefined
  const durationSeconds = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
  const id = searchParams.get("id")
  const skipBpm = searchParams.get("skipBpm") === "1"
  const spotifyId = searchParams.get("spotifyId")

  if (id) {
    return NextResponse.json({ error: "Lookup by Spotify ID not yet implemented" }, { status: 501 })
  }

  if (!track || !artist) {
    return NextResponse.json(
      { error: "Missing required parameters: track and artist" },
      { status: 400 },
    )
  }

  const lyricsEffect = Effect.orElse(
    getLyricsCached(track, artist, album ?? "", durationSeconds ?? 0),
    () => getLyrics(track, artist, album ?? "", durationSeconds ?? 0),
  ).pipe(
    Effect.catchAll(error =>
      error instanceof LyricsNotFoundError
        ? searchLyrics(track, artist, album ?? undefined)
        : Effect.fail(error),
    ),
  )

  const bpmQuery = { title: track, artist, spotifyId: spotifyId ?? undefined }
  const bpmEffect: Effect.Effect<BPMResult | null> = skipBpm
    ? Effect.succeed(null)
    : (spotifyId
        ? getBpmRace(bpmRaceProviders, bpmQuery)
        : getBpmWithFallback(bpmProviders, bpmQuery)
      ).pipe(
        Effect.catchAll(error => {
          if (error._tag === "BPMAPIError") {
            console.error("BPM API error:", error.status, error.message)
          }
          return Effect.succeed(null)
        }),
      )

  const combinedEffect = Effect.all({
    lyrics: lyricsEffect,
    bpm: bpmEffect,
  })

  const result = await Effect.runPromiseExit(combinedEffect)

  if (result._tag === "Failure") {
    const error = result.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof LyricsNotFoundError) {
        return NextResponse.json(
          { error: `No synced lyrics found for "${track}" by ${artist}` },
          { status: 404 },
        )
      }
      if (failure instanceof LyricsAPIError) {
        console.error("Lyrics API error:", failure.message)
        return NextResponse.json(
          { error: "Lyrics service temporarily unavailable" },
          { status: failure.status >= 500 ? 502 : 500 },
        )
      }
    }
    console.error("Lyrics fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch lyrics" }, { status: 500 })
  }

  const body: LyricsApiSuccessResponse = {
    lyrics: result.value.lyrics,
    bpm: result.value.bpm?.bpm ?? null,
    key: result.value.bpm?.key ?? null,
    attribution: {
      lyrics: { name: "LRCLIB", url: "https://lrclib.net" },
      bpm: result.value.bpm
        ? result.value.bpm.source === "ReccoBeats"
          ? { name: "ReccoBeats", url: "https://reccobeats.com" }
          : result.value.bpm.source === "Deezer"
            ? { name: "Deezer", url: "https://www.deezer.com" }
            : { name: "GetSongBPM", url: "https://getsongbpm.com" }
        : null,
    },
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
