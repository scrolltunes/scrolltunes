import { getAlbumArt } from "@/lib/deezer-client"
import {
  type LRCLibTrackResult,
  type ScoredLrclibCandidate,
  checkLyricsAvailability,
  searchLRCLibByTitleArtist,
  searchLRCLibTracks,
} from "@/lib/lyrics-client"
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
import { CatalogService, type LrclibCandidate } from "@/services/catalog"
import type { DbService } from "@/services/db"
import type { FetchService } from "@/services/fetch"
import { ServerLayer } from "@/services/server-layer"
import { Effect, Fiber } from "effect"
import { type NextRequest, NextResponse } from "next/server"

/**
 * New search flow:
 * 1. Search Spotify for top 8 results
 * 2. For each result, check LRCLIB for lyrics availability (get-cached -> get)
 * 3. For each result with lyrics, fetch ALL valid LRCLIB candidates
 * 4. Upsert each song to catalog with all candidates (fire-and-forget)
 * 5. Return Spotify canonical data + LRCLIB ID for tracks with lyrics
 * 6. If Spotify fails, fall back to LRCLIB search API
 */

interface SpotifyTrackWithLyrics {
  readonly spotifyTrack: SpotifyTrack
  readonly lrclibId: number
  readonly candidates: readonly ScoredLrclibCandidate[]
  readonly normalizedName: string
  readonly normalizedArtist: string
  readonly normalizedAlbum: string
}

/**
 * Check lyrics availability for a Spotify track and fetch all valid candidates
 */
function checkTrackLyrics(
  track: SpotifyTrack,
): Effect.Effect<SpotifyTrackWithLyrics | null, never, FetchService> {
  // Use original Spotify values for LRCLIB query (maximizes match rate)
  const originalName = track.name
  const originalArtist = formatArtists(track.artists)
  const originalAlbum = track.album.name
  const durationSeconds = Math.round(track.duration_ms / 1000)

  // Normalized values for storage/display
  const normalizedName = normalizeTrackName(originalName)
  const normalizedArtist = normalizeArtistName(originalArtist)
  const normalizedAlbum = normalizeAlbumName(originalAlbum)

  return checkLyricsAvailability(originalName, originalArtist, originalAlbum, durationSeconds).pipe(
    Effect.flatMap(result => {
      if (!result) return Effect.succeed(null)

      // Fetch ALL valid candidates for this song
      return searchLRCLibByTitleArtist(originalName, originalArtist, durationSeconds).pipe(
        Effect.map(candidates => {
          // If no candidates found via search, use the single result we got from availability check
          const allCandidates: readonly ScoredLrclibCandidate[] =
            candidates.length > 0
              ? candidates
              : [
                  {
                    lrclibId: result.lrclibId,
                    trackName: result.trackName,
                    artistName: result.artistName,
                    albumName: result.albumName,
                    duration: result.duration,
                    score: 100,
                  },
                ]

          return {
            spotifyTrack: track,
            lrclibId: result.lrclibId,
            candidates: allCandidates,
            normalizedName,
            normalizedArtist,
            normalizedAlbum,
          } satisfies SpotifyTrackWithLyrics
        }),
        Effect.catchAll(() =>
          // If search fails, still return with the single known candidate
          Effect.succeed({
            spotifyTrack: track,
            lrclibId: result.lrclibId,
            candidates: [
              {
                lrclibId: result.lrclibId,
                trackName: result.trackName,
                artistName: result.artistName,
                albumName: result.albumName,
                duration: result.duration,
                score: 100,
              },
            ],
            normalizedName,
            normalizedArtist,
            normalizedAlbum,
          } satisfies SpotifyTrackWithLyrics),
        ),
      )
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

/**
 * Convert ScoredLrclibCandidate to LrclibCandidate for catalog upsert
 */
function toCatalogCandidate(candidate: ScoredLrclibCandidate): LrclibCandidate {
  return {
    lrclibId: candidate.lrclibId,
    albumName: candidate.albumName,
    duration: candidate.duration,
    score: candidate.score,
  }
}

/**
 * Fire-and-forget catalog upsert for a track with lyrics
 */
function upsertToCatalog(
  track: SpotifyTrackWithLyrics,
): Effect.Effect<void, never, CatalogService | DbService> {
  return Effect.gen(function* () {
    const catalog = yield* CatalogService

    yield* catalog
      .upsertSongWithLrclibIds({
        title: track.normalizedName,
        artist: track.normalizedArtist,
        album: track.normalizedAlbum,
        durationMs: track.spotifyTrack.duration_ms,
        spotifyId: track.spotifyTrack.id,
        hasSyncedLyrics: true,
        lrclibCandidates: track.candidates.map(toCatalogCandidate),
      })
      .pipe(
        Effect.catchAll(error => {
          console.error("[SEARCH] Catalog upsert failed:", error)
          return Effect.void
        }),
      )
  })
}

/**
 * Primary flow: Spotify search -> LRCLIB availability check
 */
function searchSpotifyFirst(
  query: string,
  limit: number,
): Effect.Effect<
  SearchResultTrack[],
  SpotifyError,
  FetchService | SpotifyService | CatalogService | DbService
> {
  return Effect.gen(function* () {
    // Search Spotify for top 8 results
    const spotifyResult = yield* searchTracksEffect(query, 8)
    const tracks = spotifyResult.tracks.items

    if (tracks.length === 0) {
      return []
    }

    // Check lyrics availability for each track in parallel
    const results = yield* Effect.all(tracks.map(checkTrackLyrics), { concurrency: 4 })

    // Filter to only tracks with lyrics
    const withLyrics = results.filter((r): r is SpotifyTrackWithLyrics => r !== null)

    // Deduplicate by normalized title+artist
    const seen = new Set<string>()
    const deduplicated: SpotifyTrackWithLyrics[] = []

    for (const result of withLyrics) {
      const key = `${result.normalizedName.toLowerCase()}|${result.normalizedArtist.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      deduplicated.push(result)
      if (deduplicated.length >= limit) break
    }

    // Fire-and-forget: upsert all tracks to catalog in parallel
    if (deduplicated.length > 0) {
      const upsertAll = Effect.all(deduplicated.map(upsertToCatalog), {
        concurrency: "unbounded",
        discard: true,
      })
      // Fork as daemon so it runs in background and doesn't block response
      const fiber = yield* Effect.fork(upsertAll)
      // Detach the fiber so it continues even after the main effect completes
      yield* Fiber.interruptFork(fiber).pipe(Effect.ignore)
    }

    // Map to SearchResultTrack format
    return deduplicated.map(r => ({
      id: `lrclib-${r.lrclibId}`,
      lrclibId: r.lrclibId,
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
 * Fallback flow: LRCLIB search (when Spotify fails)
 * Results will be backfilled with Spotify data later
 */
function searchLRCLibFallback(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], never, FetchService | CatalogService | DbService> {
  return Effect.gen(function* () {
    const results = yield* searchLRCLibTracks(query).pipe(
      Effect.catchAll(() => Effect.succeed([] as readonly LRCLibTrackResult[])),
    )

    // Filter to only valid synced lyrics
    const synced = results.filter(r => r.hasValidSyncedLyrics)

    // Deduplicate by title+artist
    const seen = new Set<string>()
    const deduplicated: LRCLibTrackResult[] = []

    for (const r of synced) {
      const key = `${r.trackName.toLowerCase()}|${r.artistName.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      deduplicated.push(r)
      if (deduplicated.length >= limit) break
    }

    // Enrich with album art from Deezer (Spotify unavailable)
    const enriched = yield* Effect.all(
      deduplicated.map(r =>
        Effect.gen(function* () {
          const albumArt = yield* Effect.tryPromise({
            try: () => getAlbumArt(r.artistName, r.trackName, "medium"),
            catch: () => null,
          }).pipe(Effect.catchAll(() => Effect.succeed(null)))

          const album = r.albumName && r.albumName !== "-" ? normalizeAlbumName(r.albumName) : ""
          const normalizedName = normalizeTrackName(r.trackName)
          const normalizedArtist = normalizeArtistName(r.artistName)

          return {
            result: r,
            searchResult: {
              id: `lrclib-${r.id}`,
              lrclibId: r.id,
              spotifyId: undefined,
              name: normalizedName,
              artist: normalizedArtist,
              album,
              albumArt: albumArt ?? undefined,
              duration: r.duration * 1000,
              hasLyrics: true,
            } satisfies SearchResultTrack,
            normalizedName,
            normalizedArtist,
            normalizedAlbum: album,
          }
        }),
      ),
      { concurrency: 4 },
    )

    // Fire-and-forget: upsert all tracks to catalog
    if (enriched.length > 0) {
      const catalog = yield* CatalogService

      const upsertAll = Effect.all(
        enriched.map(e =>
          catalog
            .upsertSongWithLrclibIds({
              title: e.normalizedName,
              artist: e.normalizedArtist,
              album: e.normalizedAlbum,
              durationMs: e.result.duration * 1000,
              hasSyncedLyrics: true,
              lrclibCandidates: [
                {
                  lrclibId: e.result.id,
                  albumName: e.result.albumName,
                  duration: e.result.duration,
                  score: 100,
                },
              ],
            })
            .pipe(
              Effect.catchAll(error => {
                console.error("[SEARCH] Catalog upsert failed:", error)
                return Effect.void
              }),
            ),
        ),
        { concurrency: "unbounded", discard: true },
      )

      const fiber = yield* Effect.fork(upsertAll)
      yield* Fiber.interruptFork(fiber).pipe(Effect.ignore)
    }

    return enriched.map(e => e.searchResult)
  })
}

/**
 * Combined search: try Spotify first, fall back to LRCLIB
 */
function search(
  query: string,
  limit: number,
): Effect.Effect<
  SearchResultTrack[],
  never,
  FetchService | SpotifyService | CatalogService | DbService
> {
  return searchSpotifyFirst(query, limit).pipe(
    Effect.catchAll(error => {
      console.log("[SEARCH] Spotify failed, falling back to LRCLIB:", error._tag)
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
