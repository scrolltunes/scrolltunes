import {
  LyricsAPIError,
  LyricsNotFoundError,
  getLyrics,
  getLyricsCached,
  searchLyrics,
} from "@/lib/lyrics-client"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const track = searchParams.get("track")
  const artist = searchParams.get("artist")
  const album = searchParams.get("album")
  const rawDuration = searchParams.get("duration")
  const parsed = rawDuration !== null ? Number.parseFloat(rawDuration) : undefined
  const durationSeconds = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
  const id = searchParams.get("id")

  if (id) {
    return NextResponse.json({ error: "Lookup by Spotify ID not yet implemented" }, { status: 501 })
  }

  if (!track || !artist) {
    return NextResponse.json(
      { error: "Missing required parameters: track and artist" },
      { status: 400 },
    )
  }

  const effect = Effect.orElse(
    getLyricsCached(track, artist, album ?? "", durationSeconds ?? 0),
    () => getLyrics(track, artist, album ?? "", durationSeconds ?? 0),
  ).pipe(
    Effect.catchAll((error) =>
      error instanceof LyricsNotFoundError
        ? searchLyrics(track, artist, album ?? undefined)
        : Effect.fail(error),
    ),
  )

  const result = await Effect.runPromiseExit(effect)

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

  return NextResponse.json(
    {
      lyrics: result.value,
      attribution: "Lyrics provided by lrclib.net",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    },
  )
}
