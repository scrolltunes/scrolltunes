import { auth } from "@/auth"
import type * as schema from "@/lib/db/schema"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import {
  AuthError,
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import { type TursoSearchResult, TursoService } from "@/services/turso"
import { eq } from "drizzle-orm"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import { Effect } from "effect"
import { NextResponse } from "next/server"

// ============================================================================
// Types
// ============================================================================

interface CopyEnrichmentResponse {
  success: true
  songId: string
  created: boolean
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeText(text: string): string {
  return text.toLowerCase().trim()
}

/**
 * Format Spotify musical key to human-readable string
 * Key is 0-11 (C to B), mode is 0 (minor) or 1 (major)
 */
function formatMusicalKey(key: number | null, mode: number | null): string | null {
  if (key === null) return null

  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const note = notes[key]
  if (!note) return null

  const modeStr = mode === 1 ? "major" : mode === 0 ? "minor" : ""
  return modeStr ? `${note} ${modeStr}` : note
}

// ============================================================================
// Main Effect
// ============================================================================

const copyEnrichment = (lrclibId: number) =>
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

    // Get track from Turso
    const turso = yield* TursoService
    const track = yield* turso.getById(lrclibId)

    if (!track) {
      return yield* Effect.fail(new NotFoundError({ resource: "track", id: String(lrclibId) }))
    }

    // Check if track has Spotify enrichment
    if (!track.spotifyId && track.tempo === null) {
      return yield* Effect.fail(
        new ValidationError({ message: "Track has no Spotify enrichment to copy" }),
      )
    }

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
      // Update existing song with Turso enrichment
      yield* updateExistingSong(db, existingMapping.songId, track)
      return { success: true, songId: existingMapping.songId, created: false } as const
    }

    // Create new song entry
    const songId = yield* createNewSong(db, track, lrclibId)
    return { success: true, songId, created: true } as const
  })

// ============================================================================
// Database Operations
// ============================================================================

function updateExistingSong(
  db: NeonHttpDatabase<typeof schema>,
  songId: string,
  track: TursoSearchResult,
) {
  return Effect.tryPromise({
    try: () =>
      db
        .update(songs)
        .set({
          spotifyId: track.spotifyId ?? undefined,
          bpm: track.tempo ? Math.round(track.tempo) : undefined,
          musicalKey: formatMusicalKey(track.musicalKey, track.mode) ?? undefined,
          albumArtUrl: track.albumImageUrl ?? undefined,
          bpmSource: track.tempo ? "Turso" : undefined,
          updatedAt: new Date(),
        })
        .where(eq(songs.id, songId)),
    catch: cause => new DatabaseError({ cause }),
  })
}

function createNewSong(
  db: NeonHttpDatabase<typeof schema>,
  track: TursoSearchResult,
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

  const exit = await Effect.runPromiseExit(
    copyEnrichment(lrclibId).pipe(Effect.provide(ServerLayer)),
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
      if (error._tag === "ValidationError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error._tag === "TursoSearchError") {
        console.error("[CopyEnrichment] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Failed to fetch track" }, { status: 500 })
      }
    }
    console.error("[CopyEnrichment] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to copy enrichment" }, { status: 500 })
  }

  return NextResponse.json(exit.value satisfies CopyEnrichmentResponse)
}
