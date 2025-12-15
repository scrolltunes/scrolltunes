import { formatArtists, getAlbumImageUrl, searchTracks } from "@/lib/spotify-client"
import { type NextRequest, NextResponse } from "next/server"

export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly duration: number
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")
  const limit = searchParams.get("limit")

  if (!query) {
    return NextResponse.json({ error: "Missing required parameter: q" }, { status: 400 })
  }

  const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined
  if (
    parsedLimit !== undefined &&
    (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50)
  ) {
    return NextResponse.json(
      { error: "Invalid limit: must be a number between 1 and 50" },
      { status: 400 },
    )
  }

  try {
    const result = await searchTracks(query, parsedLimit)

    const tracks: SearchResultTrack[] = result.tracks.items.map(track => ({
      id: track.id,
      name: track.name,
      artist: formatArtists(track.artists),
      album: track.album.name,
      albumArt: getAlbumImageUrl(track.album, "small") ?? undefined,
      duration: track.duration_ms,
    }))

    return NextResponse.json(
      { tracks },
      {
        headers: {
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "29",
        },
      },
    )
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json(
      { error: "Failed to search tracks. Please try again." },
      { status: 500 },
    )
  }
}
