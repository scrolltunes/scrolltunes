import { auth } from "@/auth"
import type * as schema from "@/lib/db/schema"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import {
  AuthError,
  ConflictError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/errors"
import { formatMusicalKey } from "@/lib/musical-key"
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

interface AddToCatalogResponse {
  success: true
  songId: string
  lrclibId: number
  title: string
  artist: string
  bpm: number | null
  musicalKey: string | null
  spotifyId: string | null
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

const addToCatalog = (lrclibId: number) =>
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

    // Check if already in catalog → return 409
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
      return yield* Effect.fail(
        new ConflictError({
          message: `Track already in catalog as song ${existingMapping.songId}`,
        }),
      )
    }

    // Fetch from Turso
    const turso = yield* TursoService
    const track = yield* turso.getById(lrclibId)

    if (!track) {
      return yield* Effect.fail(new NotFoundError({ resource: "track", id: String(lrclibId) }))
    }

    // Create song and link LRCLIB ID
    const songId = yield* createNewSong(db, track, lrclibId)

    const bpm = track.tempo ? Math.round(track.tempo) : null
    const musicalKey = formatMusicalKey(track.musicalKey, track.mode)

    return {
      success: true as const,
      songId,
      lrclibId,
      title: track.title,
      artist: track.artist,
      bpm,
      musicalKey,
      spotifyId: track.spotifyId,
    }
  })

// ============================================================================
// Database Operations
// ============================================================================

function createNewSong(
  db: NeonHttpDatabase<typeof schema>,
  track: {
    title: string
    artist: string
    album: string | null
    durationSec: number
    spotifyId: string | null
    tempo: number | null
    musicalKey: number | null
    mode: number | null
    albumImageUrl: string | null
  },
  lrclibId: number,
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
            spotifyId: track.spotifyId,
            bpm: track.tempo ? Math.round(track.tempo) : null,
            musicalKey: formatMusicalKey(track.musicalKey, track.mode),
            bpmSource: track.tempo ? "Turso" : null,
            albumArtUrl: track.albumImageUrl,
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
  _request: Request,
  { params }: { params: Promise<{ lrclibId: string }> },
) {
  const { lrclibId: lrclibIdParam } = await params
  const lrclibId = Number.parseInt(lrclibIdParam, 10)

  if (Number.isNaN(lrclibId)) {
    return NextResponse.json({ error: "Invalid lrclibId" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(addToCatalog(lrclibId).pipe(Effect.provide(ServerLayer)))

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
        return NextResponse.json({ error: `Track ${error.id} not found in Turso` }, { status: 404 })
      }
      if (error._tag === "ConflictError") {
        // Extract songId from message for client convenience
        const match = error.message.match(/song ([a-f0-9-]+)/)
        const existingSongId = match?.[1] ?? null
        return NextResponse.json({ error: error.message, songId: existingSongId }, { status: 409 })
      }
      if (error._tag === "TursoSearchError") {
        console.error("[AddToCatalog] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Failed to fetch track from Turso" }, { status: 500 })
      }
    }
    console.error("[AddToCatalog] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to add track to catalog" }, { status: 500 })
  }

  return NextResponse.json(exit.value satisfies AddToCatalogResponse)
}
