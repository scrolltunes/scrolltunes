/**
 * Shared song data loader used by both the API route and server components.
 * Eliminates duplicate fetching and provides consistent data loading.
 */

import type { Lyrics } from "@/core"
import { logBpmAttempt } from "@/lib/bpm/bpm-log"
import { db } from "@/lib/db"
import { chordEnhancements, lrcWordEnhancements, songLrclibIds, songs } from "@/lib/db/schema"
import { getAlbumArt } from "@/lib/deezer-client"
import {
  LyricsAPIError,
  LyricsInvalidError,
  LyricsNotFoundError,
  findBestAlternativeLyrics,
  getLyricsById,
} from "@/lib/lyrics-client"
import { formatMusicalKey } from "@/lib/musical-key"
import { normalizeAlbumName, normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import {
  type SpotifyService,
  formatArtists,
  getAlbumImageUrl,
  getTrackEffect,
  searchTracksEffect,
} from "@/lib/spotify-client"
import { ServerLayer } from "@/services/server-layer"
import { TursoService } from "@/services/turso"
import { eq } from "drizzle-orm"
import { Effect } from "effect"

export interface AttributionSource {
  readonly name: string
  readonly url: string
}

export interface SongDataSuccess {
  readonly _tag: "Success"
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly timeSignature: number | null
  readonly albumArt: string | null
  readonly albumArtLarge: string | null
  readonly spotifyId: string | null
  readonly bpmSource: AttributionSource | null
  readonly lyricsSource: AttributionSource
  readonly hasEnhancement: boolean
  readonly hasChordEnhancement: boolean
}

export interface SongDataNotFound {
  readonly _tag: "NotFound"
}

export interface SongDataInvalidLyrics {
  readonly _tag: "InvalidLyrics"
  readonly trackName: string
  readonly artistName: string
  readonly reason: string
}

export interface SongDataError {
  readonly _tag: "Error"
  readonly message: string
  readonly status: number
}

export type SongDataResult =
  | SongDataSuccess
  | SongDataNotFound
  | SongDataInvalidLyrics
  | SongDataError

// Extended catalog cache including album art and spotify info
interface CatalogCacheResult {
  songId: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  bpmSourceUrl: string | null
  spotifyId: string | null
  albumArtUrl: string | null
  albumArtLargeUrl: string | null
}

async function getCachedSongFromCatalog(lrclibId: number): Promise<CatalogCacheResult | null> {
  try {
    const [result] = await db
      .select({
        songId: songs.id,
        bpm: songs.bpm,
        musicalKey: songs.musicalKey,
        bpmSource: songs.bpmSource,
        bpmSourceUrl: songs.bpmSourceUrl,
        spotifyId: songs.spotifyId,
        albumArtUrl: songs.albumArtUrl,
        albumArtLargeUrl: songs.albumArtLargeUrl,
      })
      .from(songLrclibIds)
      .innerJoin(songs, eq(songLrclibIds.songId, songs.id))
      .where(eq(songLrclibIds.lrclibId, lrclibId))
      .limit(1)

    if (result) {
      return result
    }
    return null
  } catch {
    return null
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

async function checkEnhancementsExist(actualLrclibId: number) {
  const [enhancementRows, chordEnhancementRows] = await Promise.all([
    db
      .select({ id: lrcWordEnhancements.id })
      .from(lrcWordEnhancements)
      .where(eq(lrcWordEnhancements.sourceLrclibId, actualLrclibId))
      .limit(1),
    db
      .select({ id: chordEnhancements.id })
      .from(chordEnhancements)
      .where(eq(chordEnhancements.sourceLrclibId, actualLrclibId))
      .limit(1),
  ])

  return {
    hasEnhancement: enhancementRows.length > 0,
    hasChordEnhancement: chordEnhancementRows.length > 0,
  }
}

async function fetchAlbumArt(artist: string, title: string) {
  const [albumArt, albumArtLarge] = await Promise.all([
    getAlbumArt(artist, title, "medium"),
    getAlbumArt(artist, title, "xl"),
  ])

  return { albumArt, albumArtLarge }
}

function getBpmAttribution(source: string, sourceUrl?: string | null): AttributionSource {
  if (sourceUrl) {
    return { name: source, url: sourceUrl }
  }

  switch (source) {
    case "Spotify":
      return { name: "Spotify", url: "https://www.spotify.com" }
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

// Fetch embedded tempo data from Turso by LRCLIB ID
function getEmbeddedTempoFromTurso(lrclibId: number) {
  return Effect.gen(function* () {
    const turso = yield* TursoService
    const result = yield* turso.getById(lrclibId).pipe(Effect.catchAll(() => Effect.succeed(null)))
    return result
  })
}

// Fire-and-forget catalog update with album art
export function fireAndForgetCatalogUpdate(
  actualLrclibId: number,
  lyrics: Lyrics,
  spotifyTrackName: string | null,
  spotifyArtistName: string | null,
  spotifyAlbumName: string | undefined,
  resolvedSpotifyId: string | undefined,
  albumArt: string | null,
  albumArtLarge: string | null,
  cachedSong: CatalogCacheResult | null,
) {
  ;(async () => {
    try {
      if (cachedSong) {
        // Update existing song with new metadata if we have new data
        const updates: Record<string, unknown> = {}
        let hasUpdates = false

        if (spotifyAlbumName && !cachedSong.spotifyId) {
          updates.album = spotifyAlbumName
          hasUpdates = true
        }
        if (resolvedSpotifyId && !cachedSong.spotifyId) {
          updates.spotifyId = resolvedSpotifyId
          hasUpdates = true
        }
        if (albumArt && !cachedSong.albumArtUrl) {
          updates.albumArtUrl = albumArt
          hasUpdates = true
        }
        if (albumArtLarge && !cachedSong.albumArtLargeUrl) {
          updates.albumArtLargeUrl = albumArtLarge
          hasUpdates = true
        }

        if (hasUpdates) {
          updates.updatedAt = new Date()
          await db.update(songs).set(updates).where(eq(songs.id, cachedSong.songId))
        }
      } else {
        // New song - insert into catalog
        const { prepareCatalogSong } = await import("@/lib/song-catalog")

        const prepared = prepareCatalogSong({
          title: spotifyTrackName ?? lyrics.title,
          artist: spotifyArtistName ?? lyrics.artist,
          album: spotifyAlbumName,
          spotifyId: resolvedSpotifyId,
          hasSyncedLyrics: true,
        })

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
            albumArtUrl: albumArt,
            albumArtLargeUrl: albumArtLarge,
          })
          .onConflictDoUpdate({
            target: [songs.artistLower, songs.titleLower],
            set: {
              updatedAt: new Date(),
              ...(prepared.album && { album: prepared.album }),
              ...(prepared.spotifyId && { spotifyId: prepared.spotifyId }),
              ...(albumArt && { albumArtUrl: albumArt }),
              ...(albumArtLarge && { albumArtLargeUrl: albumArtLarge }),
            },
          })
          .returning({ id: songs.id })

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
}

/**
 * Load song data by LRCLIB ID.
 * Uses catalog cache to skip external API calls when possible.
 * Defers BPM fetching on cache miss for faster initial load.
 */
export async function loadSongData(lrclibId: number): Promise<SongDataResult> {
  // Check catalog cache first (includes BPM, spotifyId, albumArt)
  const cachedSongPromise = getCachedSongFromCatalog(lrclibId)

  const lyricsEffect = getLyricsById(lrclibId).pipe(
    Effect.catchTag("LyricsInvalidError", error => {
      console.log(
        `[Lyrics] ID ${lrclibId} has invalid data ("${error.trackName}" by ${error.artistName}), searching for alternative...`,
      )
      return findBestAlternativeLyrics(error.trackName, error.artistName, null, error.id)
    }),
  )

  // Fetch lyrics (always needed)
  const lyricsResult = await Effect.runPromiseExit(lyricsEffect.pipe(Effect.provide(ServerLayer)))

  if (lyricsResult._tag === "Failure") {
    const error = lyricsResult.cause
    if (error._tag === "Fail") {
      const failure = error.error
      if (failure instanceof LyricsNotFoundError) {
        return { _tag: "NotFound" }
      }
      if (failure instanceof LyricsAPIError) {
        console.error("Lyrics API error:", failure.message)
        return {
          _tag: "Error",
          message: "Lyrics service temporarily unavailable",
          status: failure.status >= 500 ? 502 : 500,
        }
      }
      if (failure instanceof LyricsInvalidError) {
        return {
          _tag: "InvalidLyrics",
          trackName: failure.trackName,
          artistName: failure.artistName,
          reason: failure.reason,
        }
      }
    }
    console.error("Lyrics fetch failed:", error)
    return { _tag: "Error", message: "Failed to fetch lyrics", status: 502 }
  }

  const lyrics = lyricsResult.value
  const cachedSong = await cachedSongPromise

  const actualLrclibId = lyrics.songId.startsWith("lrclib-")
    ? Number.parseInt(lyrics.songId.slice(7), 10)
    : lrclibId

  // Use cached data if available
  const hasCachedBpm =
    cachedSong !== null && cachedSong.bpm !== null && cachedSong.bpmSource !== null
  const hasCachedAlbumArt = cachedSong !== null && cachedSong.albumArtUrl !== null
  const cachedSpotifyId = cachedSong?.spotifyId ?? null

  // Determine what we need to fetch
  let spotifyResult: SpotifyLookupResult | null = null
  let albumArt: string | null = cachedSong?.albumArtUrl ?? null
  let albumArtLarge: string | null = cachedSong?.albumArtLargeUrl ?? null
  let resolvedSpotifyId: string | undefined = cachedSpotifyId ?? undefined

  // Only fetch Spotify if we need album art
  if (!hasCachedAlbumArt) {
    if (cachedSpotifyId) {
      // Use cached Spotify ID for lookup
      const spotifyEffect = lookupSpotifyById(cachedSpotifyId)
      spotifyResult = await Effect.runPromise(spotifyEffect.pipe(Effect.provide(ServerLayer)))
      if (spotifyResult) {
        albumArt = spotifyResult.albumArt
        albumArtLarge = spotifyResult.albumArtLarge
        resolvedSpotifyId = spotifyResult.spotifyId
      }
    } else {
      // Search Spotify by title/artist
      const spotifyEffect = lookupSpotifyBySearch(lyrics.title, lyrics.artist)
      spotifyResult = await Effect.runPromise(spotifyEffect.pipe(Effect.provide(ServerLayer)))
      if (spotifyResult) {
        albumArt = spotifyResult.albumArt
        albumArtLarge = spotifyResult.albumArtLarge
        resolvedSpotifyId = spotifyResult.spotifyId
      }
    }

    // If still no album art, try Deezer
    if (!albumArt) {
      const deezerResult = await fetchAlbumArt(lyrics.artist, lyrics.title)
      albumArt = deezerResult.albumArt
      albumArtLarge = deezerResult.albumArtLarge
    }
  }

  // Check if enhancements exist (deferred loading - client fetches payload separately)
  const { hasEnhancement, hasChordEnhancement } = await checkEnhancementsExist(actualLrclibId)

  // BPM handling: use cached, embedded tempo, or defer fetching
  let bpm: number | null = null
  let key: string | null = null
  let timeSignature: number | null = null
  let bpmSource: AttributionSource | null = null

  if (hasCachedBpm && cachedSong && cachedSong.bpmSource) {
    // Priority 1: Use cached BPM from Neon catalog
    // Note: timeSignature is not cached in Neon, only available from Turso
    bpm = cachedSong.bpm
    key = cachedSong.musicalKey
    bpmSource = getBpmAttribution(cachedSong.bpmSource, cachedSong.bpmSourceUrl)
  } else {
    // Priority 2: Try embedded tempo from Turso (Spotify enrichment)
    const tursoStart = Date.now()
    const tursoTrack = await Effect.runPromise(
      getEmbeddedTempoFromTurso(actualLrclibId).pipe(Effect.provide(ServerLayer)),
    )

    if (tursoTrack?.tempo !== null && tursoTrack?.tempo !== undefined) {
      bpm = Math.round(tursoTrack.tempo)
      key = formatMusicalKey(tursoTrack.musicalKey, tursoTrack.mode)
      timeSignature = tursoTrack.timeSignature
      bpmSource = getBpmAttribution("Spotify")

      // Log successful Turso lookup
      logBpmAttempt({
        lrclibId: actualLrclibId,
        songId: cachedSong?.songId,
        title: lyrics.title,
        artist: lyrics.artist,
        stage: "turso_embedded",
        provider: "Turso",
        success: true,
        bpm,
        latencyMs: Date.now() - tursoStart,
      })

      // Cache the embedded BPM in Neon for future requests
      if (cachedSong) {
        db.update(songs)
          .set({
            bpm,
            musicalKey: key,
            bpmSource: "Spotify",
            updatedAt: new Date(),
          })
          .where(eq(songs.id, cachedSong.songId))
          .then(() => {})
          .catch(err => console.error("[BPM] Failed to cache embedded tempo:", err))
      }
    } else {
      // Log failed Turso lookup
      logBpmAttempt({
        lrclibId: actualLrclibId,
        songId: cachedSong?.songId,
        title: lyrics.title,
        artist: lyrics.artist,
        stage: "turso_embedded",
        provider: "Turso",
        success: false,
        errorReason: "not_found",
        latencyMs: Date.now() - tursoStart,
      })
    }
  }

  // Fire-and-forget catalog update (with album art)
  fireAndForgetCatalogUpdate(
    actualLrclibId,
    lyrics,
    spotifyResult?.trackName ?? null,
    spotifyResult?.artistName ?? null,
    spotifyResult?.albumName,
    resolvedSpotifyId,
    albumArt,
    albumArtLarge,
    cachedSong,
  )

  const normalizedLyrics: Lyrics = {
    ...lyrics,
    title: spotifyResult?.trackName ?? normalizeTrackName(lyrics.title),
    artist: spotifyResult?.artistName ?? normalizeArtistName(lyrics.artist),
    ...(spotifyResult?.albumName !== undefined && { album: spotifyResult.albumName }),
  }

  return {
    _tag: "Success",
    lyrics: normalizedLyrics,
    bpm,
    key,
    timeSignature,
    albumArt,
    albumArtLarge,
    spotifyId: resolvedSpotifyId ?? null,
    bpmSource,
    lyricsSource: { name: "LRCLIB", url: "https://lrclib.net" },
    hasEnhancement,
    hasChordEnhancement,
  }
}
