import { type NextRequest, NextResponse } from "next/server"
import { getLyrics } from "@/lib/lyrics-client"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const track = searchParams.get("track")
  const artist = searchParams.get("artist")
  const id = searchParams.get("id")

  if (id) {
    return NextResponse.json(
      { error: "Lookup by Spotify ID not yet implemented" },
      { status: 501 }
    )
  }

  if (!track || !artist) {
    return NextResponse.json(
      { error: "Missing required parameters: track and artist" },
      { status: 400 }
    )
  }

  try {
    const lyrics = await getLyrics(track, artist)

    if (!lyrics) {
      return NextResponse.json(
        { error: "Lyrics not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        lyrics,
        attribution: "Lyrics provided by lrclib.net",
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      }
    )
  } catch (error) {
    console.error("Lyrics API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    )
  }
}
