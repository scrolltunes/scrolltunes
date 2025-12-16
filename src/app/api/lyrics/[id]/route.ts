import {
  type BPMResult,
  deezerBpmProvider,
  getBpmRace,
  getBpmWithFallback,
  getSongBpmProvider,
  rapidApiSpotifyProvider,
  reccoBeatsProvider,
  withInMemoryCache,
} from "@/lib/bpm"
import { getAlbumArt } from "@/lib/deezer-client"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import { LyricsAPIError, LyricsNotFoundError, getLyricsById } from "@/lib/lyrics-client"
import { formatArtists, getAlbumImageUrl, searchTracksEffect } from "@/lib/spotify-client"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const bpmFallbackProviders = [
  withInMemoryCache(getSongBpmProvider),
  withInMemoryCache(deezerBpmProvider),
]

const bpmRaceProviders = [
  withInMemoryCache(reccoBeatsProvider),
  withInMemoryCache(getSongBpmProvider),
  withInMemoryCache(deezerBpmProvider),
]

const bpmLastResortProvider = withInMemoryCache(rapidApiSpotifyProvider)

function getBpmAttribution(source: string): { name: string; url: string } {
  switch (source) {
    case "ReccoBeats":
      return { name: "ReccoBeats", url: "https://reccobeats.com" }
    case "Deezer":
      return { name: "Deezer", url: "https://www.deezer.com" }
    case "RapidAPI-Spotify":
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
  readonly albumArt: string | null
}

function lookupSpotifyId(
  title: string,
  artist: string,
): Effect.Effect<SpotifyLookupResult | null, never> {
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

  const lyricsEffect = getLyricsById(id)

  const combinedEffect = lyricsEffect.pipe(
    Effect.flatMap(lyrics => {
      const spotifyLookupEffect: Effect.Effect<SpotifyLookupResult | null, never> = spotifyId
        ? Effect.succeed({ spotifyId, albumArt: null })
        : lookupSpotifyId(lyrics.title, lyrics.artist)

      return Effect.flatMap(spotifyLookupEffect, spotifyResult => {
        const resolvedSpotifyId = spotifyResult?.spotifyId
        const spotifyAlbumArt = spotifyResult?.albumArt ?? null

        const bpmQuery = {
          title: lyrics.title,
          artist: lyrics.artist,
          spotifyId: resolvedSpotifyId,
        }

        const primaryBpmEffect = resolvedSpotifyId
          ? getBpmRace(bpmRaceProviders, bpmQuery)
          : getBpmWithFallback(bpmFallbackProviders, bpmQuery)

        const bpmWithLastResort = resolvedSpotifyId
          ? primaryBpmEffect.pipe(
              Effect.catchAll(error =>
                error._tag === "BPMNotFoundError"
                  ? bpmLastResortProvider.getBpm(bpmQuery)
                  : Effect.fail(error),
              ),
            )
          : primaryBpmEffect

        const bpmEffect: Effect.Effect<BPMResult | null> = bpmWithLastResort.pipe(
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

        return Effect.map(bpmEffect, bpm => ({
          lyrics,
          bpm,
          spotifyAlbumArt,
          resolvedSpotifyId,
        }))
      })
    }),
  )

  const result = await Effect.runPromiseExit(combinedEffect)

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
    }
    console.error("Lyrics fetch failed:", error)
    return NextResponse.json({ error: "Failed to fetch lyrics" }, { status: 502 })
  }

  const { lyrics, bpm: bpmResult, spotifyAlbumArt, resolvedSpotifyId } = result.value

  const albumArt = spotifyAlbumArt ?? (await getAlbumArt(lyrics.artist, lyrics.title, "medium"))

  const body: LyricsApiSuccessResponse = {
    lyrics,
    bpm: bpmResult?.bpm ?? null,
    key: bpmResult?.key ?? null,
    albumArt: albumArt ?? null,
    spotifyId: resolvedSpotifyId ?? null,
    attribution: {
      lyrics: { name: "LRCLIB", url: "https://lrclib.net" },
      bpm: bpmResult ? getBpmAttribution(bpmResult.source) : null,
    },
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
