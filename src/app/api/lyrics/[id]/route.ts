import { type BPMResult, getBpmRace, getBpmWithFallback } from "@/lib/bpm"
import { db } from "@/lib/db"
import { lrcWordEnhancements } from "@/lib/db/schema"
import { getAlbumArt } from "@/lib/deezer-client"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import {
  LyricsAPIError,
  LyricsInvalidError,
  LyricsNotFoundError,
  findBestAlternativeLyrics,
  getLyricsById,
} from "@/lib/lyrics-client"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import {
  type SpotifyService,
  formatArtists,
  getAlbumImageUrl,
  getTrackEffect,
  searchTracksEffect,
} from "@/lib/spotify-client"
import { BpmProviders } from "@/services/bpm-providers"
import { ServerLayer } from "@/services/server-layer"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

function getBpmAttribution(source: string): { name: string; url: string } {
  switch (source) {
    case "ReccoBeats":
      return { name: "ReccoBeats", url: "https://reccobeats.com" }
    case "Deezer":
      return { name: "Deezer", url: "https://www.deezer.com" }
    case "RapidAPI":
      return { name: "Spotify", url: "https://www.spotify.com" }
    default:
      return { name: "GetSongBPM", url: "https://getsongbpm.com" }
  }
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

interface SpotifyLookupResult {
  readonly spotifyId: string
  readonly trackName: string
  readonly artistName: string
  readonly albumName?: string
  readonly albumArt: string | null
}

function lookupSpotifyById(
  spotifyId: string,
): Effect.Effect<SpotifyLookupResult | null, never, SpotifyService> {
  return getTrackEffect(spotifyId).pipe(
    Effect.map(track => ({
      spotifyId: track.id,
      trackName: normalizeTrackName(track.name),
      artistName: normalizeArtistName(formatArtists(track.artists)),
      albumName: normalizeAlbumName(track.album.name),
      albumArt: getAlbumImageUrl(track.album, "medium"),
    })),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

function lookupSpotifyBySearch(
  title: string,
  artist: string,
): Effect.Effect<SpotifyLookupResult | null, never, SpotifyService> {
  return searchTracksEffect(`${title} ${artist}`, 5).pipe(
    Effect.map(result => {
      const normalizedTitle = normalizeForMatch(title)
      const normalizedArtist = normalizeForMatch(artist)

      const match = result.tracks.items.find(track => {
        const spotifyTitle = normalizeForMatch(track.name)
        const spotifyArtist = normalizeForMatch(formatArtists(track.artists))
        const titleMatch =
          spotifyTitle.includes(normalizedTitle) || normalizedTitle.includes(spotifyTitle)
        const artistMatch =
          spotifyArtist.includes(normalizedArtist) || normalizedArtist.includes(spotifyArtist)
        return titleMatch && artistMatch
      })

      if (!match) return null
      return {
        spotifyId: match.id,
        trackName: normalizeTrackName(match.name),
        artistName: normalizeArtistName(formatArtists(match.artists)),
        albumName: normalizeAlbumName(match.album.name),
        albumArt: getAlbumImageUrl(match.album, "medium"),
      }
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const id = Number.parseInt(idParam, 10)
  const url = new URL(request.url)
  const spotifyId = url.searchParams.get("spotifyId")

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID: must be a positive integer" }, { status: 400 })
  }

  // Fetch lyrics with automatic fallback if primary ID has invalid data
  const lyricsEffect = getLyricsById(id).pipe(
    Effect.catchTag("LyricsInvalidError", error => {
      console.log(
        `[Lyrics] ID ${id} has invalid data ("${error.trackName}" by ${error.artistName}), searching for alternative...`,
      )
      // Use track info from the failed request to search for alternatives
      return findBestAlternativeLyrics(error.trackName, error.artistName, null, error.id)
    }),
  )

  const combinedEffect = lyricsEffect.pipe(
    Effect.flatMap(lyrics => {
      const spotifyLookupEffect = spotifyId
        ? lookupSpotifyById(spotifyId)
        : lookupSpotifyBySearch(lyrics.title, lyrics.artist)

      return Effect.flatMap(spotifyLookupEffect, spotifyResult => {
        const resolvedSpotifyId = spotifyResult?.spotifyId
        const spotifyTrackName = spotifyResult?.trackName ?? null
        const spotifyArtistName = spotifyResult?.artistName ?? null
        const spotifyAlbumName = spotifyResult?.albumName
        const spotifyAlbumArt = spotifyResult?.albumArt ?? null

        const bpmQuery = {
          title: lyrics.title,
          artist: lyrics.artist,
          spotifyId: resolvedSpotifyId,
        }

        const bpmEffect: Effect.Effect<BPMResult | null, never, BpmProviders> = BpmProviders.pipe(
          Effect.flatMap(({ fallbackProviders, raceProviders, lastResortProvider }) => {
            const primaryBpmEffect = resolvedSpotifyId
              ? getBpmRace(raceProviders, bpmQuery)
              : getBpmWithFallback(fallbackProviders, bpmQuery)

            const bpmWithLastResort = resolvedSpotifyId
              ? primaryBpmEffect.pipe(
                  Effect.catchAll(error =>
                    error._tag === "BPMNotFoundError"
                      ? lastResortProvider.getBpm(bpmQuery)
                      : Effect.fail(error),
                  ),
                )
              : primaryBpmEffect

            return bpmWithLastResort.pipe(
              Effect.catchAll(error => {
                if (error._tag === "BPMAPIError") {
                  console.error("BPM API error:", error.status, error.message)
                }
                return Effect.succeed(null)
              }),
              Effect.catchAllDefect(defect => {
                console.error("BPM defect:", defect)
                return Effect.succeed(null)
              }),
            )
          }),
        )

        return Effect.map(bpmEffect, bpm => ({
          lyrics,
          bpm,
          spotifyTrackName,
          spotifyArtistName,
          spotifyAlbumName,
          spotifyAlbumArt,
          resolvedSpotifyId,
        }))
      })
    }),
  )

  const result = await Effect.runPromiseExit(combinedEffect.pipe(Effect.provide(ServerLayer)))

  if (result._tag === "Failure") {
    const error = result.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof LyricsNotFoundError) {
        return NextResponse.json({ error: `No lyrics found for ID ${id}` }, { status: 404 })
      }
      if (failure instanceof LyricsAPIError) {
        console.error("Lyrics API error:", failure.message)
        return NextResponse.json(
          { error: "Lyrics service temporarily unavailable" },
          { status: failure.status >= 500 ? 502 : 500 },
        )
      }
      if (failure instanceof LyricsInvalidError) {
        return NextResponse.json(
          {
            error: `Invalid lyrics data for "${failure.trackName}" by ${failure.artistName}: ${failure.reason}`,
          },
          { status: 422 },
        )
      }
    }
    console.error("Lyrics fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch lyrics" }, { status: 502 })
  }

  const {
    lyrics,
    bpm: bpmResult,
    spotifyTrackName,
    spotifyArtistName,
    spotifyAlbumName,
    spotifyAlbumArt,
    resolvedSpotifyId,
  } = result.value

  const albumArt = spotifyAlbumArt ?? (await getAlbumArt(lyrics.artist, lyrics.title, "medium"))

  // Extract actual LRCLIB ID from lyrics (may differ from URL id if fallback occurred)
  const actualLrclibId = lyrics.songId.startsWith("lrclib-")
    ? Number.parseInt(lyrics.songId.slice(7), 10)
    : id

  // Fetch enhancement payload if it exists for this LRCLIB ID
  const [enhancement] = await db
    .select({ id: lrcWordEnhancements.id, payload: lrcWordEnhancements.payload })
    .from(lrcWordEnhancements)
    .where(eq(lrcWordEnhancements.sourceLrclibId, actualLrclibId))
    .limit(1)

  const normalizedLyrics = {
    ...lyrics,
    title: spotifyTrackName ?? normalizeTrackName(lyrics.title),
    artist: spotifyArtistName ?? normalizeArtistName(lyrics.artist),
    ...(spotifyAlbumName !== undefined && { album: spotifyAlbumName }),
  }

  const body: LyricsApiSuccessResponse = {
    lyrics: normalizedLyrics,
    bpm: bpmResult?.bpm ?? null,
    key: bpmResult?.key ?? null,
    albumArt: albumArt ?? null,
    spotifyId: resolvedSpotifyId ?? null,
    attribution: {
      lyrics: { name: "LRCLIB", url: "https://lrclib.net" },
      bpm: bpmResult ? getBpmAttribution(bpmResult.source) : null,
    },
    hasEnhancement: !!enhancement,
    enhancement: enhancement?.payload ?? null,
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
