import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import { loadSongData } from "@/services/song-loader"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const id = Number.parseInt(idParam, 10)
  const url = new URL(request.url)
  const spotifyId = url.searchParams.get("spotifyId")

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID: must be a positive integer" }, { status: 400 })
  }

  const result = await loadSongData(id, spotifyId)

  if (result._tag === "NotFound") {
    return NextResponse.json({ error: `No lyrics found for ID ${id}` }, { status: 404 })
  }

  if (result._tag === "InvalidLyrics") {
    return NextResponse.json(
      {
        error: `Invalid lyrics data for "${result.trackName}" by ${result.artistName}: ${result.reason}`,
      },
      { status: 422 },
    )
  }

  if (result._tag === "Error") {
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  const body: LyricsApiSuccessResponse = {
    lyrics: result.lyrics,
    bpm: result.bpm,
    key: result.key,
    timeSignature: result.timeSignature,
    albumArt: result.albumArt,
    albumArtLarge: result.albumArtLarge,
    spotifyId: result.spotifyId,
    attribution: {
      lyrics: result.lyricsSource,
      bpm: result.bpmSource,
    },
    hasEnhancement: result.hasEnhancement,
    hasChordEnhancement: result.hasChordEnhancement,
  }

  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  })
}
