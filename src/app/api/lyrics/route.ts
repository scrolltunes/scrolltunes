import { type BPMResult, getBpmRace, getBpmWithFallback } from "@/lib/bpm"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import {
  LyricsAPIError,
  LyricsNotFoundError,
  getLyrics,
  getLyricsCached,
  searchLyrics,
} from "@/lib/lyrics-client"
import { BpmProviders } from "@/services/bpm-providers"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

function getBpmAttribution(source: string): { name: string; url: string } {
  switch (source) {
    case "ReccoBeats":
      return { name: "ReccoBeats", url: "https://reccobeats.com" }
    case "Deezer":
      return { name: "Deezer", url: "https://www.deezer.com" }
    case "RapidAPI":
      return { name: "Spotify", url: "https://www.spotify.com" }
    default:
      return { name: "GetSongBPM", url: "https://getsongbpm.com" }
  }
}

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

  const bpmEffect: Effect.Effect<BPMResult | null, never, BpmProviders> = skipBpm
    ? Effect.succeed(null)
    : BpmProviders.pipe(
        Effect.flatMap(({ fallbackProviders, raceProviders, lastResortProvider }) => {
          const primaryBpmEffect = spotifyId
            ? getBpmRace(raceProviders, bpmQuery)
            : getBpmWithFallback(fallbackProviders, bpmQuery)

          const bpmWithLastResort = spotifyId
            ? primaryBpmEffect.pipe(
                Effect.catchAll(error =>
                  error._tag === "BPMNotFoundError"
                    ? lastResortProvider.getBpm(bpmQuery)
                    : Effect.fail(error),
                ),
              )
            : primaryBpmEffect

          return bpmWithLastResort.pipe(
            Effect.catchAll(error => {
              if (error._tag === "BPMAPIError") {
                console.error("BPM API error:", error.status, error.message)
              }
              return Effect.succeed(null)
            }),
          )
        }),
      )

  const combinedEffect = Effect.all({
    lyrics: lyricsEffect,
    bpm: bpmEffect,
  })

  const result = await Effect.runPromiseExit(combinedEffect.pipe(Effect.provide(ServerLayer)))

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
      bpm: result.value.bpm ? getBpmAttribution(result.value.bpm.source) : null,
    },
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
