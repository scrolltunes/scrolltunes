import { getAlbumArt } from "@/lib/deezer-client"
import { type LRCLibTrackResult, searchLRCLibTracks } from "@/lib/lyrics-client"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import type { SearchResultTrack } from "@/lib/search-api-types"
import type { FetchService } from "@/services/fetch"
import type { ServerConfig } from "@/services/server-config"
import { ServerLayer } from "@/services/server-layer"
import { type TursoSearchResult, TursoService } from "@/services/turso"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Search flow (Turso-first with embedded Spotify enrichment):
 * 1. Search Turso FTS for results (ranked by popularity, quality, BM25)
 * 2. Enrich with album art (use stored URL or Deezer fallback)
 * 3. If Turso fails/empty, fall back to LRCLIB API + Deezer album art
 */

/**
 * Enrich a Turso search result with album art
 */
function enrichWithAlbumArt(
  result: TursoSearchResult,
): Effect.Effect<SearchResultTrack, never, FetchService> {
  return Effect.gen(function* () {
    // Priority 1: Stored URL from Spotify dump (instant)
    let albumArt = result.albumImageUrl

    // Priority 2: Deezer lookup (if no stored URL)
    if (!albumArt) {
      albumArt = yield* Effect.tryPromise({
        try: () => getAlbumArt(result.artist, result.title, "medium"),
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    }

    return {
      id: `lrclib-${result.id}`,
      lrclibId: result.id,
      spotifyId: result.spotifyId ?? undefined,
      name: result.title,
      artist: result.artist,
      album: result.album ?? "",
      albumArt: albumArt ?? undefined,
      duration: result.durationSec * 1000,
      hasLyrics: true,
      popularity: result.popularity ?? undefined,
      tempo: result.tempo ?? undefined,
    } satisfies SearchResultTrack
  })
}

/**
 * Primary flow: Turso FTS search with popularity ranking
 */
function searchTurso(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, TursoService | ServerConfig | FetchService> {
  return Effect.gen(function* () {
    const turso = yield* TursoService
    const results = yield* turso.search(query, limit).pipe(
      Effect.catchAll(error => {
        console.log("[SEARCH] Turso search failed:", error.message)
        return Effect.succeed([] as readonly TursoSearchResult[])
      }),
    )

    if (results.length === 0) {
      return []
    }

    console.log(`[SEARCH] Turso returned ${results.length} results`)

    // Enrich with album art (use stored URL or fallback to Deezer)
    const enriched = yield* Effect.all(
      results.map(r => enrichWithAlbumArt(r)),
      { concurrency: 4 },
    )

    return enriched
  })
}

/**
 * LRCLIB API fallback (when Turso returns no results)
 */
function searchLRCLibFallback(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, FetchService> {
  return Effect.gen(function* () {
    const results = yield* searchLRCLibTracks(query).pipe(
      Effect.catchAll(() => Effect.succeed([] as readonly LRCLibTrackResult[])),
    )

    const synced = results.filter(r => r.hasValidSyncedLyrics)

    const seen = new Set<string>()
    const deduplicated: LRCLibTrackResult[] = []

    for (const r of synced) {
      const key = `${r.trackName.toLowerCase()}|${r.artistName.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      deduplicated.push(r)
      if (deduplicated.length >= limit) break
    }

    const enriched = yield* Effect.all(
      deduplicated.map(r =>
        Effect.gen(function* () {
          const albumArt = yield* Effect.tryPromise({
            try: () => getAlbumArt(r.artistName, r.trackName, "medium"),
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)))

          const album = r.albumName && r.albumName !== "-" ? normalizeAlbumName(r.albumName) : ""

          return {
            id: `lrclib-${r.id}`,
            lrclibId: r.id,
            spotifyId: undefined,
            name: normalizeTrackName(r.trackName),
            artist: normalizeArtistName(r.artistName),
            album,
            albumArt: albumArt ?? undefined,
            duration: r.duration * 1000,
            hasLyrics: true,
            popularity: undefined,
            tempo: undefined,
          } satisfies SearchResultTrack
        }),
      ),
      { concurrency: 4 },
    )

    return enriched
  })
}

/**
 * Combined search: Turso → LRCLIB API fallback
 */
function search(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, FetchService | TursoService | ServerConfig> {
  return searchTurso(query, limit).pipe(
    Effect.flatMap(results => {
      if (results.length > 0) {
        console.log(`[SEARCH] Turso returned ${results.length} results`)
        return Effect.succeed(results)
      }
      console.log("[SEARCH] Turso returned no results, falling back to LRCLIB API")
      return searchLRCLibFallback(query, limit)
    }),
  )
}

export async function GET(request: NextRequest) {
  const userAgent = request.headers.get("user-agent")
  console.log("[SEARCH] User-Agent:", userAgent)

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

  const result = await Effect.runPromiseExit(
    search(query, parsedLimit).pipe(Effect.provide(ServerLayer)),
  )

  if (result._tag === "Failure") {
    console.error("Search failed:", result.cause)
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
