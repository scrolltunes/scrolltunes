import { getAlbumArt } from "@/lib/deezer-client"
import {
  LyricsAPIError,
  type LyricsError,
  NON_STUDIO_PATTERNS,
  scoreTrackCandidate,
  searchLRCLibBySpotifyMetadata,
} from "@/lib/lyrics-client"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import type { SearchResultTrack } from "@/lib/search-api-types"
import {
  type SpotifyService,
  formatArtists,
  getAlbumImageUrl,
  searchTracksEffect,
} from "@/lib/spotify-client"
import type { FetchService } from "@/services/fetch"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeDisplayText(text: string): string {
  return text.replace(/_/g, " ").trim()
}

interface SpotifyMatch {
  readonly spotifyId: string
  readonly trackName: string
  readonly artistName: string
  readonly albumArt: string | null
  readonly albumName: string | null
  readonly durationMs: number
}

function findSpotifyMatch(
  query: string,
  trackName: string,
  artistName: string,
): Effect.Effect<SpotifyMatch | null, never, SpotifyService> {
  return searchTracksEffect(query, 10).pipe(
    Effect.map(result => {
      const normalizedTrack = normalizeForMatch(trackName)
      const normalizedArtist = normalizeForMatch(artistName)

      const match = result.tracks.items.find(track => {
        const spotifyTrack = normalizeForMatch(track.name)
        const spotifyArtist = normalizeForMatch(formatArtists(track.artists))
        return spotifyTrack.includes(normalizedTrack) || normalizedTrack.includes(spotifyTrack)
          ? spotifyArtist.includes(normalizedArtist) || normalizedArtist.includes(spotifyArtist)
          : false
      })

      if (!match) return null
      return {
        spotifyId: match.id,
        trackName: normalizeTrackName(match.name),
        artistName: normalizeArtistName(formatArtists(match.artists)),
        albumArt: getAlbumImageUrl(match.album, "medium"),
        albumName: match.album.name || null,
        durationMs: match.duration_ms,
      }
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

function getAlbumArtRace(
  artist: string,
  track: string,
  spotifyAlbumArt: string | null,
): Effect.Effect<string | null, never> {
  if (spotifyAlbumArt) {
    return Effect.succeed(spotifyAlbumArt)
  }

  return Effect.tryPromise({
    try: () => getAlbumArt(artist, track, "medium"),
    catch: () => null,
  }).pipe(
    Effect.map(art => art ?? null),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

/**
 * Create a deduplication key from track name and artist.
 * Normalizes to lowercase and removes non-alphanumeric chars.
 */
function dedupeKey(trackName: string, artistName: string): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  return `${normalize(trackName)}|${normalize(artistName)}`
}

function searchLRCLib(
  query: string,
  limit: number,
): Effect.Effect<SearchResultTrack[], LyricsError, FetchService | SpotifyService> {
  return Effect.gen(function* () {
    // Use Spotify-first flow for better accuracy
    const results = yield* searchLRCLibBySpotifyMetadata(query)

    // Filter to only valid synced lyrics
    const synced = results.filter(r => r.hasValidSyncedLyrics)

    // Detect if user wants non-studio version from query
    const wantsNonStudio = NON_STUDIO_PATTERNS.some(p => p.test(query))

    // Try to get canonical metadata from Spotify for the query
    const spotifyMatch = yield* findSpotifyMatch(query, query, "").pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    )

    // Score and rank results
    const scored = synced
      .map(r => ({
        result: r,
        score: scoreTrackCandidate(r, {
          targetDuration: spotifyMatch ? Math.round(spotifyMatch.durationMs / 1000) : null,
          targetTrackName: spotifyMatch?.trackName ?? undefined,
          targetArtistName: spotifyMatch?.artistName ?? undefined,
          canonicalAlbumName: spotifyMatch?.albumName ?? undefined,
          wantStudioVersion: !wantsNonStudio,
        }),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.result)

    // Deduplicate by track name + artist (not just ID)
    const seenKeys = new Set<string>()
    const uniqueTracks: typeof scored = []

    for (const r of scored) {
      const key = dedupeKey(r.trackName, r.artistName)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      uniqueTracks.push(r)
      if (uniqueTracks.length >= limit) break
    }

    const enrichedTracks = yield* Effect.all(
      uniqueTracks.map(r =>
        Effect.gen(function* () {
          const searchQuery = `${r.trackName} ${r.artistName}`
          const spotifyMatch = yield* findSpotifyMatch(searchQuery, r.trackName, r.artistName)
          const albumArt = yield* getAlbumArtRace(
            r.artistName,
            r.trackName,
            spotifyMatch?.albumArt ?? null,
          )

          const lrclibAlbum = r.albumName ? normalizeDisplayText(r.albumName) : ""
          const album = spotifyMatch?.albumName ?? (lrclibAlbum === "-" ? "" : lrclibAlbum)
          return {
            id: `lrclib-${r.id}`,
            lrclibId: r.id,
            spotifyId: spotifyMatch?.spotifyId,
            name: spotifyMatch?.trackName ?? normalizeDisplayText(r.trackName),
            artist: spotifyMatch?.artistName ?? normalizeDisplayText(r.artistName),
            album,
            albumArt: albumArt ?? undefined,
            duration: r.duration * 1000,
            hasLyrics: true,
          } satisfies SearchResultTrack
        }),
      ),
      { concurrency: 5 },
    )

    return enrichedTracks
  })
}

export async function GET(request: NextRequest) {
  // Log user agent for testing mobile detection
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
    searchLRCLib(query, parsedLimit).pipe(Effect.provide(ServerLayer)),
  )

  if (result._tag === "Failure") {
    const cause = result.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error instanceof LyricsAPIError) {
        console.error("LRCLIB API error:", error.status, error.message)
        return NextResponse.json(
          { error: "Search service temporarily unavailable" },
          { status: 502 },
        )
      }
    }
    console.error("Search failed:", cause)
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
