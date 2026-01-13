import { auth } from "@/auth"
import { appUserProfiles } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import {
  type SpotifyError,
  SpotifyService,
  formatArtists,
  getAlbumImageUrl,
} from "@/lib/spotify-client"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// ============================================================================
// Response Types
// ============================================================================

interface SpotifySearchResultItem {
  spotifyId: string
  name: string
  artist: string
  album: string
  albumArt: string | null
  durationMs: number
  popularity: number
}

interface SpotifySearchResponse {
  results: SpotifySearchResultItem[]
}

// ============================================================================
// Main Effect
// ============================================================================

const searchSpotify = (query: string) =>
  Effect.gen(function* () {
    // Auth check
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    const [profile] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ isAdmin: appUserProfiles.isAdmin })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, session.user.id)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    // Search Spotify
    const spotify = yield* SpotifyService

    const searchResult = yield* spotify
      .searchTracks(query, 5)
      .pipe(Effect.mapError(error => error as SpotifyError))

    // Map to response format
    const results: SpotifySearchResultItem[] = searchResult.tracks.items.map(track => ({
      spotifyId: track.id,
      name: track.name,
      artist: formatArtists(track.artists),
      album: track.album.name,
      albumArt: getAlbumImageUrl(track.album, "medium"),
      durationMs: track.duration_ms,
      popularity: 0, // Spotify search doesn't return popularity, would need separate call
    }))

    return { results } satisfies SpotifySearchResponse
  })

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(searchSpotify(query).pipe(Effect.provide(ServerLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "ForbiddenError") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (error._tag === "SpotifyRateLimitError") {
        return NextResponse.json({ error: "Rate limited, please try again later" }, { status: 429 })
      }
      if (error._tag === "SpotifyAPIError") {
        console.error("[Spotify Search] API error:", error.status, error.message)
        return NextResponse.json({ error: "Spotify search failed" }, { status: 502 })
      }
    }
    console.error("[Spotify Search] Failed", exit.cause)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
