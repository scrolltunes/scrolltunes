import { auth } from "@/auth"
import type * as schema from "@/lib/db/schema"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import {
  AuthError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors"
import {
  type SpotifyError,
  SpotifyService,
  formatMusicalKey,
  getAlbumImageUrl,
} from "@/lib/spotify-client"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { TursoService } from "@/services/turso"
import { eq } from "drizzle-orm"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import { Effect } from "effect"
import { NextResponse } from "next/server"

// ============================================================================
// Types
// ============================================================================

interface LinkSpotifyBody {
  spotifyId: string
}

interface LinkSpotifyResponse {
  success: true
  songId: string
  bpm: number | null
  musicalKey: string | null
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeText(text: string): string {
  return text.toLowerCase().trim()
}

// ============================================================================
// Main Effect
// ============================================================================

const linkSpotify = (lrclibId: number, spotifyId: string) =>
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

    // Get track from Turso to verify it exists and get metadata
    const turso = yield* TursoService
    const track = yield* turso.getById(lrclibId)

    if (!track) {
      return yield* Effect.fail(new NotFoundError({ resource: "track", id: String(lrclibId) }))
    }

    // Fetch Spotify track to get album art and verify it exists
    const spotify = yield* SpotifyService
    const spotifyTrack = yield* spotify
      .getTrack(spotifyId)
      .pipe(Effect.mapError(error => error as SpotifyError))

    // Fetch audio features from Spotify
    const audioFeatures = yield* spotify
      .getAudioFeatures(spotifyId)
      .pipe(Effect.mapError(error => error as SpotifyError))

    // Calculate enrichment values
    const bpm = audioFeatures.tempo > 0 ? Math.round(audioFeatures.tempo) : null
    const musicalKey = formatMusicalKey(audioFeatures.key, audioFeatures.mode)
    const albumArtUrl = getAlbumImageUrl(spotifyTrack.album, "medium")
    const albumArtLargeUrl = getAlbumImageUrl(spotifyTrack.album, "large")

    // Check if lrclibId already exists in Neon
    const [existingMapping] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            songId: songLrclibIds.songId,
          })
          .from(songLrclibIds)
          .where(eq(songLrclibIds.lrclibId, lrclibId)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existingMapping) {
      // Update existing song with Spotify enrichment
      yield* updateExistingSong(db, existingMapping.songId, {
        spotifyId,
        bpm,
        musicalKey,
        albumArtUrl,
        albumArtLargeUrl,
      })
      return {
        success: true,
        songId: existingMapping.songId,
        bpm,
        musicalKey,
      } as const
    }

    // Create new song entry
    const songId = yield* createNewSong(db, track, lrclibId, {
      spotifyId,
      bpm,
      musicalKey,
      albumArtUrl,
      albumArtLargeUrl,
    })

    return { success: true, songId, bpm, musicalKey } as const
  })

// ============================================================================
// Database Operations
// ============================================================================

interface SpotifyEnrichment {
  readonly spotifyId: string
  readonly bpm: number | null
  readonly musicalKey: string | null
  readonly albumArtUrl: string | null
  readonly albumArtLargeUrl: string | null
}

function updateExistingSong(
  db: NeonHttpDatabase<typeof schema>,
  songId: string,
  enrichment: SpotifyEnrichment,
) {
  return Effect.tryPromise({
    try: () =>
      db
        .update(songs)
        .set({
          spotifyId: enrichment.spotifyId,
          bpm: enrichment.bpm ?? undefined,
          musicalKey: enrichment.musicalKey ?? undefined,
          albumArtUrl: enrichment.albumArtUrl ?? undefined,
          albumArtLargeUrl: enrichment.albumArtLargeUrl ?? undefined,
          bpmSource: enrichment.bpm ? "Spotify" : undefined,
          updatedAt: new Date(),
        })
        .where(eq(songs.id, songId)),
    catch: cause => new DatabaseError({ cause }),
  })
}

interface TursoTrack {
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
}

function createNewSong(
  db: NeonHttpDatabase<typeof schema>,
  track: TursoTrack,
  lrclibId: number,
  enrichment: SpotifyEnrichment,
) {
  return Effect.gen(function* () {
    // Insert new song
    const [newSong] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(songs)
          .values({
            title: track.title,
            artist: track.artist,
            album: track.album ?? "",
            durationMs: track.durationSec * 1000,
            artistLower: normalizeText(track.artist),
            titleLower: normalizeText(track.title),
            albumLower: track.album ? normalizeText(track.album) : null,
            spotifyId: enrichment.spotifyId,
            bpm: enrichment.bpm,
            musicalKey: enrichment.musicalKey,
            bpmSource: enrichment.bpm ? "Spotify" : null,
            albumArtUrl: enrichment.albumArtUrl,
            albumArtLargeUrl: enrichment.albumArtLargeUrl,
            hasSyncedLyrics: true, // From LRCLIB, so has synced lyrics
          })
          .returning({ id: songs.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!newSong) {
      return yield* Effect.fail(new DatabaseError({ cause: "Failed to create song" }))
    }

    // Create lrclib mapping
    yield* Effect.tryPromise({
      try: () =>
        db.insert(songLrclibIds).values({
          songId: newSong.id,
          lrclibId,
          isPrimary: true,
        }),
      catch: cause => new DatabaseError({ cause }),
    })

    return newSong.id
  })
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lrclibId: string }> },
) {
  const { lrclibId: lrclibIdParam } = await params
  const lrclibId = Number.parseInt(lrclibIdParam, 10)

  if (Number.isNaN(lrclibId)) {
    return NextResponse.json({ error: "Invalid lrclibId" }, { status: 400 })
  }

  // Parse request body
  let body: LinkSpotifyBody
  try {
    body = (await request.json()) as LinkSpotifyBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.spotifyId || typeof body.spotifyId !== "string") {
    return NextResponse.json({ error: "Missing spotifyId in request body" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(
    linkSpotify(lrclibId, body.spotifyId).pipe(Effect.provide(ServerLayer)),
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
      if (error._tag === "NotFoundError") {
        return NextResponse.json({ error: `Track ${error.id} not found` }, { status: 404 })
      }
      if (error._tag === "TursoSearchError") {
        console.error("[LinkSpotify] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Failed to fetch track" }, { status: 500 })
      }
      if (error._tag === "SpotifyRateLimitError") {
        return NextResponse.json({ error: "Rate limited, please try again later" }, { status: 429 })
      }
      if (error._tag === "SpotifyAPIError") {
        console.error("[LinkSpotify] Spotify error:", error.status, error.message)
        if (error.status === 404) {
          return NextResponse.json({ error: "Spotify track not found" }, { status: 404 })
        }
        return NextResponse.json({ error: "Spotify API error" }, { status: 502 })
      }
    }
    console.error("[LinkSpotify] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to link Spotify track" }, { status: 500 })
  }

  return NextResponse.json(exit.value satisfies LinkSpotifyResponse)
}
