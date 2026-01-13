import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { type TursoSearchResult, TursoService } from "@/services/turso"
import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

// ============================================================================
// Types
// ============================================================================

type SearchType = "fts" | "lrclib_id" | "spotify_id"

interface SearchResult {
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  albumImageUrl: string | null
  inCatalog: boolean
  catalogSongId: string | null
}

interface SearchResponse {
  results: SearchResult[]
  searchType: SearchType
  query: string
}

// ============================================================================
// Constants
// ============================================================================

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20

// ============================================================================
// Helpers
// ============================================================================

function detectSearchType(q: string): SearchType {
  const trimmed = q.trim()

  // Pure digits = LRCLIB ID
  if (/^\d+$/.test(trimmed)) {
    return "lrclib_id"
  }

  // Spotify patterns
  if (trimmed.startsWith("spotify:track:") || trimmed.includes("open.spotify.com/track/")) {
    return "spotify_id"
  }

  return "fts"
}

function extractSpotifyId(q: string): string {
  const trimmed = q.trim()
  if (trimmed.startsWith("spotify:track:")) {
    return trimmed.replace("spotify:track:", "")
  }
  const match = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/)
  return match?.[1] ?? trimmed
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT
  if (parsed > MAX_LIMIT) return MAX_LIMIT
  return parsed
}

function mapTursoToSearchResult(
  track: TursoSearchResult,
  catalogMap: Map<number, string>,
): SearchResult {
  return {
    lrclibId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSec: track.durationSec,
    spotifyId: track.spotifyId,
    popularity: track.popularity,
    tempo: track.tempo,
    musicalKey: track.musicalKey,
    albumImageUrl: track.albumImageUrl,
    inCatalog: catalogMap.has(track.id),
    catalogSongId: catalogMap.get(track.id) ?? null,
  }
}

// ============================================================================
// Main Effect
// ============================================================================

const searchTracks = (query: string, limit: number) =>
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

    // Check admin permission
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

    const searchType = detectSearchType(query)
    const turso = yield* TursoService

    // Get results from Turso based on search type
    let tursoResults: readonly TursoSearchResult[]

    if (searchType === "lrclib_id") {
      const id = Number.parseInt(query.trim(), 10)
      const result = yield* turso.getById(id)
      tursoResults = result ? [result] : []
    } else if (searchType === "spotify_id") {
      const spotifyId = extractSpotifyId(query)
      // Search tracks with Spotify ID - use searchWithFilters and filter by spotifyId
      const searchResult = yield* turso.searchWithFilters({
        filter: "has_spotify",
        sort: "popular",
        offset: 0,
        limit: limit * 2, // Fetch more to filter
      })
      // Filter to match exact Spotify ID
      tursoResults = searchResult.tracks.filter(t => t.spotifyId === spotifyId).slice(0, limit)
    } else {
      // FTS search
      tursoResults = yield* turso.search(query, limit)
    }

    // Batch check catalog status
    const lrclibIds = tursoResults.map(r => r.id)
    const catalogMappings =
      lrclibIds.length > 0
        ? yield* Effect.tryPromise({
            try: () =>
              db
                .select({ lrclibId: songLrclibIds.lrclibId, songId: songLrclibIds.songId })
                .from(songLrclibIds)
                .where(inArray(songLrclibIds.lrclibId, lrclibIds)),
            catch: cause => new DatabaseError({ cause }),
          })
        : []

    const catalogMap = new Map(catalogMappings.map(m => [m.lrclibId, m.songId]))

    // Map to response format
    const results: SearchResult[] = tursoResults.map(t => mapTursoToSearchResult(t, catalogMap))

    return {
      results,
      searchType,
      query,
    } satisfies SearchResponse
  })

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const query = searchParams.get("q")?.trim()
  const limit = parseLimit(searchParams.get("limit"))

  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(
    searchTracks(query, limit).pipe(Effect.provide(ServerLayer)),
  )

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
      if (error._tag === "TursoSearchError") {
        console.error("[TrackSearch] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
      }
    }
    console.error("[TrackSearch] Failed:", exit.cause)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
