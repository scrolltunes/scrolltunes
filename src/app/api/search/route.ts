import { getAlbumArt } from "@/lib/deezer-client"
import {
  LyricsAPIError,
  type LyricsError,
  searchLRCLibBySpotifyMetadata,
} from "@/lib/lyrics-client"
import type { SearchResultTrack } from "@/lib/search-api-types"
import { formatArtists, getAlbumImageUrl, searchTracksEffect } from "@/lib/spotify-client"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

const NON_STUDIO_PATTERNS = [
  /\bremaster(ed)?\b/i,
  /\bremix(ed)?\b/i,
  /\blive\b/i,
  /\bacoustic\b/i,
  /\bradio edit\b/i,
  /\bsingle version\b/i,
  /\bdemo\b/i,
  /\bbonus track\b/i,
  /\bdeluxe\b/i,
  /\banniversary\b/i,
  /\bextended\b/i,
  /\binstrumental\b/i,
  /\bkaraoke\b/i,
]

function isStudioVersion(trackName: string, albumName: string | null): boolean {
  const text = `${trackName} ${albumName ?? ""}`
  return !NON_STUDIO_PATTERNS.some(pattern => pattern.test(text))
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

interface SpotifyMatch {
  readonly spotifyId: string
  readonly albumArt: string | null
}

function findSpotifyMatch(
  query: string,
  trackName: string,
  artistName: string,
): Effect.Effect<SpotifyMatch | null, never> {
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
        albumArt: getAlbumImageUrl(match.album, "small"),
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
    try: () => getAlbumArt(artist, track, "small"),
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
): Effect.Effect<SearchResultTrack[], LyricsError> {
  return Effect.gen(function* () {
    // Use Spotify-first flow for better accuracy
    const results = yield* searchLRCLibBySpotifyMetadata(query)
    const synced = results.filter(r => r.hasSyncedLyrics)

    // Sort studio versions first
    const sorted = [...synced].sort((a, b) => {
      const aIsStudio = isStudioVersion(a.trackName, a.albumName)
      const bIsStudio = isStudioVersion(b.trackName, b.albumName)
      if (aIsStudio && !bIsStudio) return -1
      if (!aIsStudio && bIsStudio) return 1
      return 0
    })

    // Deduplicate by track name + artist (not just ID)
    const seenKeys = new Set<string>()
    const uniqueTracks: typeof sorted = []

    for (const r of sorted) {
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

          return {
            id: `lrclib-${r.id}`,
            lrclibId: r.id,
            spotifyId: spotifyMatch?.spotifyId,
            name: r.trackName,
            artist: r.artistName,
            album: r.albumName ?? "",
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

  const result = await Effect.runPromiseExit(searchLRCLib(query, parsedLimit))

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
