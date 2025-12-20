import { LyricsAPIError, searchLRCLibTracks } from "@/lib/lyrics-client"
import { buildLRCLibSearchQuery } from "@/lib/track-normalization"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const title = searchParams.get("title")?.trim()
  const artist = searchParams.get("artist")?.trim()

  if (!title || !artist) {
    return NextResponse.json(
      { error: "Missing required parameters: title and artist" },
      { status: 400 },
    )
  }

  const query = buildLRCLibSearchQuery(title, artist)

  const effect = Effect.map(searchLRCLibTracks(query), results => {
    const syncedTrack = results.find(r => r.hasSyncedLyrics)
    if (!syncedTrack) {
      return { found: false as const }
    }
    return {
      found: true as const,
      lrclibId: syncedTrack.id,
      trackName: syncedTrack.trackName,
      artistName: syncedTrack.artistName,
      duration: syncedTrack.duration,
    }
  })

  const result = await Effect.runPromiseExit(effect.pipe(Effect.provide(ServerLayer)))

  if (result._tag === "Failure") {
    const cause = result.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error instanceof LyricsAPIError) {
        console.error("LRCLIB API error:", error.status, error.message)
        return NextResponse.json(
          { error: "LRCLIB service temporarily unavailable" },
          { status: 502 },
        )
      }
    }
    console.error("Verify failed:", cause)
    return NextResponse.json({ error: "Failed to verify lyrics availability" }, { status: 500 })
  }

  return NextResponse.json(result.value, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
