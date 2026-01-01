import { getAlbumArt } from "@/lib/deezer-client"
import { type LRCLibTrackResult, searchLRCLibTracks } from "@/lib/lyrics-client"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import type { SearchResultTrack } from "@/lib/search-api-types"
import {
  type SpotifyError,
  type SpotifyService,
  type SpotifyTrack,
  formatArtists,
  getAlbumImageUrl,
  searchTracksEffect,
} from "@/lib/spotify-client"
import type { FetchService } from "@/services/fetch"
import type { ServerConfig } from "@/services/server-config"
import { ServerLayer } from "@/services/server-layer"
import { type TursoSearchResult, TursoService } from "@/services/turso"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Search flow (Spotify-first with Turso verification):
 * 1. Search Spotify for top N results (popularity-ranked)
 * 2. For each result, verify LRCLIB availability via Turso FTS lookup
 * 3. Return Spotify metadata (album art, normalized names) + LRCLIB ID
 * 4. If Spotify fails, fall back to Turso direct search + Deezer album art
 */

interface SpotifyTrackWithLrclib {
  readonly spotifyTrack: SpotifyTrack
  readonly lrclibMatch: TursoSearchResult
  readonly normalizedName: string
  readonly normalizedArtist: string
  readonly normalizedAlbum: string
}

/**
 * Look up a Spotify track in Turso to get LRCLIB ID
 */
function findLrclibMatch(
  track: SpotifyTrack,
): Effect.Effect<SpotifyTrackWithLrclib | null, never, TursoService | ServerConfig> {
  const title = track.name
  const artist = formatArtists(track.artists)

  const normalizedName = normalizeTrackName(title)
  const normalizedArtist = normalizeArtistName(artist)
  const normalizedAlbum = normalizeAlbumName(track.album.name)

  return Effect.gen(function* () {
    const turso = yield* TursoService

    const match = yield* turso
      .findByTitleArtist(title, artist)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (!match) return null

    return {
      spotifyTrack: track,
      lrclibMatch: match,
      normalizedName,
      normalizedArtist,
      normalizedAlbum,
    }
  })
}

/**
 * Primary flow: Spotify search → Turso verification
 */
function searchSpotifyWithTurso(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], SpotifyError, SpotifyService | TursoService | ServerConfig> {
  return Effect.gen(function* () {
    const spotifyResult = yield* searchTracksEffect(query, Math.min(limit + 2, 8))
    const tracks = spotifyResult.tracks.items

    if (tracks.length === 0) {
      return []
    }

    const results = yield* Effect.all(tracks.map(findLrclibMatch), { concurrency: "unbounded" })

    const withLyrics = results.filter((r): r is SpotifyTrackWithLrclib => r !== null)

    const seenKeys = new Set<string>()
    const seenLrclibIds = new Set<number>()
    const deduplicated: SpotifyTrackWithLrclib[] = []

    for (const result of withLyrics) {
      const key = `${result.normalizedName.toLowerCase()}|${result.normalizedArtist.toLowerCase()}`
      const lrclibId = result.lrclibMatch.id
      if (seenKeys.has(key) || seenLrclibIds.has(lrclibId)) continue
      seenKeys.add(key)
      seenLrclibIds.add(lrclibId)
      deduplicated.push(result)
      if (deduplicated.length >= limit) break
    }

    return deduplicated.map(r => ({
      id: `lrclib-${r.lrclibMatch.id}`,
      lrclibId: r.lrclibMatch.id,
      spotifyId: r.spotifyTrack.id,
      name: r.normalizedName,
      artist: r.normalizedArtist,
      album: r.normalizedAlbum,
      albumArt: getAlbumImageUrl(r.spotifyTrack.album, "medium") ?? undefined,
      duration: r.spotifyTrack.duration_ms,
      hasLyrics: true,
    })) satisfies SearchResultTrack[]
  })
}

/**
 * Fallback flow: Turso direct search + Deezer album art
 */
function searchTursoWithDeezer(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, TursoService | ServerConfig | FetchService> {
  return Effect.gen(function* () {
    const turso = yield* TursoService
    const results = yield* turso.search(query, limit).pipe(
      Effect.catchAll(error => {
        console.log("[SEARCH] Turso search failed:", error.message)
        return Effect.succeed([] as const)
      }),
    )

    if (results.length === 0) {
      return []
    }

    console.log(`[SEARCH] Turso returned ${results.length} results`)

    const enriched = yield* Effect.all(
      results.map(r =>
        Effect.tryPromise({
          try: () => getAlbumArt(r.artist, r.title, "medium"),
          catch: () => null,
        }).pipe(
          Effect.map(
            (albumArt): SearchResultTrack => ({
              id: `lrclib-${r.id}`,
              lrclibId: r.id,
              spotifyId: undefined,
              name: r.title,
              artist: r.artist,
              album: r.album ?? "",
              albumArt: albumArt ?? undefined,
              duration: r.durationSec * 1000,
              hasLyrics: true,
            }),
          ),
          Effect.catchAll(() =>
            Effect.succeed<SearchResultTrack>({
              id: `lrclib-${r.id}`,
              lrclibId: r.id,
              spotifyId: undefined,
              name: r.title,
              artist: r.artist,
              album: r.album ?? "",
              albumArt: undefined,
              duration: r.durationSec * 1000,
              hasLyrics: true,
            }),
          ),
        ),
      ),
      { concurrency: 4 },
    )

    return enriched
  })
}

/**
 * LRCLIB API fallback (when both Spotify and Turso fail)
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
          } satisfies SearchResultTrack
        }),
      ),
      { concurrency: 4 },
    )

    return enriched
  })
}

/**
 * Combined search: Spotify → Turso → LRCLIB API
 */
function search(
  query: string,
  limit: number,
): Effect.Effect<
  SearchResultTrack[],
  never,
  FetchService | SpotifyService | TursoService | ServerConfig
> {
  return searchSpotifyWithTurso(query, limit).pipe(
    Effect.flatMap(results => {
      if (results.length > 0) {
        console.log(`[SEARCH] Spotify+Turso returned ${results.length} results`)
        return Effect.succeed(results)
      }
      console.log("[SEARCH] Spotify+Turso returned no results, falling back to Turso direct")
      return searchTursoWithDeezer(query, limit)
    }),
    Effect.catchAll(error => {
      console.log("[SEARCH] Spotify failed, falling back to Turso direct:", error._tag)
      return searchTursoWithDeezer(query, limit).pipe(
        Effect.flatMap(results => {
          if (results.length > 0) return Effect.succeed(results)
          console.log("[SEARCH] Turso returned no results, falling back to LRCLIB API")
          return searchLRCLibFallback(query, limit)
        }),
      )
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
