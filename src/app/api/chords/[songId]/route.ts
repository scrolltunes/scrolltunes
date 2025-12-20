import { parseChordProDocument } from "@/lib/chords/chord-parser"
import { getRawChordProData } from "@/lib/chords/songsterr-client"
import {
  SongsterrError,
  SongsterrNotFoundError,
  SongsterrParseError,
} from "@/lib/chords/songsterr-types"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { songId: songIdStr } = await params
  const songId = Number.parseInt(songIdStr, 10)

  if (!Number.isInteger(songId) || songId <= 0) {
    return NextResponse.json(
      { error: "Invalid songId: must be a positive integer" },
      { status: 400 },
    )
  }

  const { searchParams } = new URL(request.url)
  const artist = searchParams.get("artist")
  const title = searchParams.get("title")

  if (!artist || !title) {
    return NextResponse.json({ error: "Missing artist or title parameter" }, { status: 400 })
  }

  const effect = Effect.gen(function* () {
    const rawChordProDoc = yield* getRawChordProData(songId, artist, title)
    return parseChordProDocument(rawChordProDoc, songId, artist, title)
  })

  const result = await Effect.runPromiseExit(effect.pipe(Effect.provide(ServerLayer)))

  if (result._tag === "Failure") {
    const error = result.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof SongsterrNotFoundError) {
        return NextResponse.json({ error: "Chords not found for this song" }, { status: 404 })
      }
      if (failure instanceof SongsterrParseError) {
        console.error("Songsterr parse error:", failure.message)
        return NextResponse.json({ error: "Failed to parse chord data" }, { status: 500 })
      }
      if (failure instanceof SongsterrError) {
        console.error("Songsterr API error:", failure.status, failure.message)
        return NextResponse.json(
          { error: "Chord service temporarily unavailable" },
          { status: failure.status >= 500 ? 502 : 500 },
        )
      }
    }
    console.error("Chord fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch chord data" }, { status: 500 })
  }

  return NextResponse.json(result.value, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
