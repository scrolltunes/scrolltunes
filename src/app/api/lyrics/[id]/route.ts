import { type BPMResult, getBpmRace, getBpmWithFallback } from "@/lib/bpm"
import { db } from "@/lib/db"
import { chordEnhancements, lrcWordEnhancements, songLrclibIds, songs } from "@/lib/db/schema"
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

function getBpmAttribution(
  source: string,
  sourceUrl?: string | null,
): { name: string; url: string } {
  // If we have a cached source URL, use it
  if (sourceUrl) {
    return { name: source, url: sourceUrl }
  }

  // Map known provider names to URLs
  switch (source) {
    case "ReccoBeats":
      return { name: "ReccoBeats", url: "https://reccobeats.com" }
    case "Deezer":
      return { name: "Deezer", url: "https://www.deezer.com" }
    case "RapidAPI":
      return { name: "Spotify (via RapidAPI)", url: "https://www.spotify.com" }
    case "Spotify (via RapidAPI)":
      return { name: "Spotify (via RapidAPI)", url: "https://www.spotify.com" }
    case "Manual":
      return { name: "Manual", url: "" }
    default:
      return { name: source || "GetSongBPM", url: "https://getsongbpm.com" }
  }
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

interface CatalogBpmResult {
  bpm: number
  musicalKey: string | null
  bpmSource: string
  bpmSourceUrl: string | null
}

async function getCachedBpmFromCatalog(lrclibId: number): Promise<CatalogBpmResult | null> {
  try {
    const [result] = await db
      .select({
        bpm: songs.bpm,
        musicalKey: songs.musicalKey,
        bpmSource: songs.bpmSource,
        bpmSourceUrl: songs.bpmSourceUrl,
      })
      .from(songLrclibIds)
      .innerJoin(songs, eq(songLrclibIds.songId, songs.id))
      .where(eq(songLrclibIds.lrclibId, lrclibId))
      .limit(1)

    if (result?.bpm && result.bpmSource) {
      return {
        bpm: result.bpm,
        musicalKey: result.musicalKey,
        bpmSource: result.bpmSource,
        bpmSourceUrl: result.bpmSourceUrl,
      }
    }
    return null
  } catch {
    return null
  }
}

interface SpotifyLookupResult {
  readonly spotifyId: string
  readonly trackName: string
  readonly artistName: string
  readonly albumName?: string
  readonly albumArt: string | null
  readonly albumArtLarge: string | null
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
      albumArtLarge: getAlbumImageUrl(track.album, "large"),
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
        albumArtLarge: getAlbumImageUrl(match.album, "large"),
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

  // Check catalog for cached BPM first (fast path)
  const cachedBpm = await getCachedBpmFromCatalog(id)

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
        const spotifyAlbumArtLarge = spotifyResult?.albumArtLarge ?? null

        // Use cached BPM from catalog if available, otherwise fetch from external providers
        const bpmEffect: Effect.Effect<BPMResult | null, never, BpmProviders> = cachedBpm
          ? Effect.succeed({
              bpm: cachedBpm.bpm,
              source: cachedBpm.bpmSource,
              key: cachedBpm.musicalKey,
            })
          : BpmProviders.pipe(
              Effect.flatMap(({ fallbackProviders, raceProviders, lastResortProvider }) => {
                const bpmQuery = {
                  title: lyrics.title,
                  artist: lyrics.artist,
                  spotifyId: resolvedSpotifyId,
                }

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
          spotifyAlbumArtLarge,
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
    spotifyAlbumArtLarge,
    resolvedSpotifyId,
  } = result.value

  const albumArt = spotifyAlbumArt ?? (await getAlbumArt(lyrics.artist, lyrics.title, "medium"))
  // Deezer uses "xl" for large size, Spotify uses "large"
  const albumArtLarge = spotifyAlbumArtLarge ?? (await getAlbumArt(lyrics.artist, lyrics.title, "xl"))

  // Extract actual LRCLIB ID from lyrics (may differ from URL id if fallback occurred)
  const actualLrclibId = lyrics.songId.startsWith("lrclib-")
    ? Number.parseInt(lyrics.songId.slice(7), 10)
    : id

  // Update catalog with album name and BPM if available (fire and forget)
  // Also register the LRCLIB ID if not already in catalog
  const hasAlbumUpdate = !!spotifyAlbumName
  const hasBpmUpdate = bpmResult && !cachedBpm // Only update if BPM was fetched fresh (not from cache)

  // Fire-and-forget catalog update/registration
  ;(async () => {
    try {
      // Check if this LRCLIB ID is already in catalog
      const [existingMapping] = await db
        .select({ songId: songLrclibIds.songId })
        .from(songLrclibIds)
        .where(eq(songLrclibIds.lrclibId, actualLrclibId))
        .limit(1)

      if (existingMapping) {
        // Update existing song with new metadata
        if (hasAlbumUpdate || hasBpmUpdate) {
          const updates: Record<string, unknown> = { updatedAt: new Date() }
          if (hasAlbumUpdate) {
            updates.album = spotifyAlbumName
          }
          if (hasBpmUpdate && bpmResult) {
            updates.bpm = bpmResult.bpm
            updates.musicalKey = bpmResult.key ?? null
            updates.bpmSource = bpmResult.source
          }
          await db.update(songs).set(updates).where(eq(songs.id, existingMapping.songId))
        }
      } else {
        // LRCLIB ID not in catalog - register it via upsert
        const { prepareCatalogSong } = await import("@/lib/song-catalog")

        const prepared = prepareCatalogSong({
          title: spotifyTrackName ?? lyrics.title,
          artist: spotifyArtistName ?? lyrics.artist,
          album: spotifyAlbumName,
          spotifyId: resolvedSpotifyId,
          hasSyncedLyrics: true,
          bpmAttribution: bpmResult
            ? {
                bpm: bpmResult.bpm,
                source: bpmResult.source,
                sourceUrl: "",
                musicalKey: bpmResult.key,
              }
            : undefined,
        })

        // Upsert song
        const [upsertedSong] = await db
          .insert(songs)
          .values({
            title: prepared.title,
            artist: prepared.artist,
            album: prepared.album ?? "",
            artistLower: prepared.artistLower,
            titleLower: prepared.titleLower,
            albumLower: prepared.albumLower,
            spotifyId: prepared.spotifyId,
            hasSyncedLyrics: prepared.hasSyncedLyrics,
            bpm: prepared.bpm,
            musicalKey: prepared.musicalKey,
            bpmSource: prepared.bpmSource,
            bpmSourceUrl: prepared.bpmSourceUrl,
          })
          .onConflictDoUpdate({
            target: [songs.artistLower, songs.titleLower],
            set: {
              updatedAt: new Date(),
              ...(prepared.album && { album: prepared.album }),
              ...(prepared.spotifyId && { spotifyId: prepared.spotifyId }),
              ...(prepared.bpm && {
                bpm: prepared.bpm,
                musicalKey: prepared.musicalKey,
                bpmSource: prepared.bpmSource,
              }),
            },
          })
          .returning({ id: songs.id })

        // Register the LRCLIB ID
        if (upsertedSong) {
          await db
            .insert(songLrclibIds)
            .values({
              songId: upsertedSong.id,
              lrclibId: actualLrclibId,
              isPrimary: true,
            })
            .onConflictDoNothing()
        }
      }
    } catch (error) {
      console.error("[Lyrics] Catalog update failed:", error)
    }
  })()

  // Fetch enhancement payload if it exists for this LRCLIB ID
  const [enhancement] = await db
    .select({ id: lrcWordEnhancements.id, payload: lrcWordEnhancements.payload })
    .from(lrcWordEnhancements)
    .where(eq(lrcWordEnhancements.sourceLrclibId, actualLrclibId))
    .limit(1)

  // Fetch chord enhancement if it exists for this LRCLIB ID
  const [chordEnhancement] = await db
    .select({ payload: chordEnhancements.payload })
    .from(chordEnhancements)
    .where(eq(chordEnhancements.sourceLrclibId, actualLrclibId))
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
    albumArtLarge: albumArtLarge ?? null,
    spotifyId: resolvedSpotifyId ?? null,
    attribution: {
      lyrics: { name: "LRCLIB", url: "https://lrclib.net" },
      bpm: bpmResult ? getBpmAttribution(bpmResult.source, cachedBpm?.bpmSourceUrl) : null,
    },
    hasEnhancement: !!enhancement,
    enhancement: enhancement?.payload ?? null,
    hasChordEnhancement: !!chordEnhancement,
    chordEnhancement: chordEnhancement?.payload ?? null,
  }
  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  })
}
