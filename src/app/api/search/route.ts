import {
  SpotifyAPIError,
  SpotifyAuthError,
  SpotifyConfigError,
  formatArtists,
  getAlbumImageUrl,
  searchTracksEffect,
} from "@/lib/spotify-client"
import { Effect } from "effect"
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

  const effect = Effect.map(searchTracksEffect(query, parsedLimit), result =>
    result.tracks.items.map(track => ({
      id: track.id,
      name: track.name,
      artist: formatArtists(track.artists),
      album: track.album.name,
      albumArt: getAlbumImageUrl(track.album, "small") ?? undefined,
      duration: track.duration_ms,
    })),
  )

  const result = await Effect.runPromiseExit(effect)

  if (result._tag === "Failure") {
    const error = result.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof SpotifyConfigError) {
        console.error("Spotify config error:", failure.message)
        return NextResponse.json({ error: "Search service misconfigured" }, { status: 500 })
      }
      if (failure instanceof SpotifyAuthError) {
        console.error("Spotify auth error:", failure.cause)
        return NextResponse.json({ error: "Search service unavailable" }, { status: 503 })
      }
      if (failure instanceof SpotifyAPIError) {
        console.error("Spotify API error:", failure.status, failure.message)
        return NextResponse.json(
          { error: "Failed to search tracks" },
          { status: failure.status >= 500 ? 502 : 500 },
        )
      }
    }
    console.error("Search failed:", error)
    return NextResponse.json({ error: "Failed to search tracks" }, { status: 500 })
  }

  return NextResponse.json(
    { tracks: result.value },
    {
      headers: {
        "X-RateLimit-Limit": "30",
        "X-RateLimit-Remaining": "29",
      },
    },
  )
}
