import { LyricsAPIError, searchLRCLibTracks } from "@/lib/lyrics-client"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly duration: number
  readonly hasLyrics: boolean
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")?.trim()
  const limit = searchParams.get("limit")

  if (!query) {
    return NextResponse.json({ error: "Missing required parameter: q" }, { status: 400 })
  }

  const parsedLimit = limit ? Number.parseInt(limit, 10) : 20
  if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    return NextResponse.json(
      { error: "Invalid limit: must be a number between 1 and 50" },
      { status: 400 },
    )
  }

  const effect = Effect.map(searchLRCLibTracks(query), (results) =>
    results.slice(0, parsedLimit).map((r) => ({
      id: `lrclib-${r.id}`,
      name: r.trackName,
      artist: r.artistName,
      album: r.albumName ?? "",
      albumArt: undefined,
      duration: r.duration * 1000,
      hasLyrics: r.hasSyncedLyrics,
    })),
  )

  const result = await Effect.runPromiseExit(effect)

  if (result._tag === "Failure") {
    const cause = result.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error instanceof LyricsAPIError) {
        console.error("LRCLIB API error:", error.status, error.message)
        return NextResponse.json(
          { error: "Search service temporarily unavailable" },
          { status: 502 },
        )
      }
    }
    console.error("Search failed:", cause)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }

  return NextResponse.json(
    { tracks: result.value },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    },
  )
}
