import { searchSongs } from "@/lib/chords/songsterr-client"
import { Effect } from "effect"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artist = searchParams.get("artist")
  const title = searchParams.get("title")

  if (!artist || !title) {
    return NextResponse.json({ error: "Missing artist or title" }, { status: 400 })
  }

  const query = `${artist} ${title}`

  const result = await Effect.runPromiseExit(searchSongs(query))

  if (result._tag === "Failure") {
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }

  const results = result.value
    .filter(r => r.hasChords)
    .slice(0, 5)
    .map(r => ({
      songId: r.songId,
      artist: r.artist,
      title: r.title,
      hasChords: r.hasChords,
    }))

  return NextResponse.json({ results })
}
