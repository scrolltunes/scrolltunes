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
import { BpmProviders, type LoggingContext } from "@/services/bpm-providers"
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

interface ProviderAttempt {
  provider: string
  success: boolean
  bpm?: number
  error?: string
  latencyMs: number
}

interface FetchBpmResponse {
  success: boolean
  bpm: number | null
  source: string | null
  attempts: ProviderAttempt[]
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

const fetchBpm = (lrclibId: number) =>
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

    // Get BPM providers with logging context
    const bpmService = yield* BpmProviders
    const loggingContext: LoggingContext = {
      lrclibId,
      songId: undefined,
      title: track.title,
      artist: track.artist,
    }
    const { fallbackProviders } = bpmService.withLogging(loggingContext)

    // Track attempts for response
    const attempts: ProviderAttempt[] = []
    const query = { title: track.title, artist: track.artist }

    // Try each provider sequentially to capture all attempts
    let bpmResult: { bpm: number; source: string } | null = null

    for (const provider of fallbackProviders) {
      const start = Date.now()
      const exit = yield* Effect.exit(provider.getBpm(query))

      if (exit._tag === "Success") {
        const result = exit.value
        attempts.push({
          provider: provider.name,
          success: true,
          bpm: result.bpm,
          latencyMs: Date.now() - start,
        })
        bpmResult = { bpm: result.bpm, source: result.source }
        break
      }

      const cause = exit.cause
      let errorMessage = "Unknown error"
      if (cause._tag === "Fail") {
        const error = cause.error
        if (error._tag === "BPMNotFoundError") {
          errorMessage = "Not found"
        } else if (error._tag === "BPMAPIError") {
          errorMessage = `API error: ${error.status} - ${error.message}`
        } else if (error._tag === "BPMRateLimitError") {
          errorMessage = "Rate limited"
        }
      }
      attempts.push({
        provider: provider.name,
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - start,
      })
    }

    // If successful, save to Neon
    if (bpmResult) {
      yield* saveBpmToNeon(db, lrclibId, track, bpmResult.bpm, bpmResult.source)
    }

    return {
      success: bpmResult !== null,
      bpm: bpmResult?.bpm ?? null,
      source: bpmResult?.source ?? null,
      attempts,
    } satisfies FetchBpmResponse
  })

// ============================================================================
// Database Operations
// ============================================================================

interface TursoTrack {
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
}

function saveBpmToNeon(
  db: NeonHttpDatabase<typeof schema>,
  lrclibId: number,
  track: TursoTrack,
  bpm: number,
  source: string,
) {
  return Effect.gen(function* () {
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
      // Update existing song
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(songs)
            .set({
              bpm,
              bpmSource: source,
              updatedAt: new Date(),
            })
            .where(eq(songs.id, existingMapping.songId)),
        catch: cause => new DatabaseError({ cause }),
      })
      return existingMapping.songId
    }

    // Create new song entry
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
            bpm,
            bpmSource: source,
            hasSyncedLyrics: true,
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

  const exit = await Effect.runPromiseExit(fetchBpm(lrclibId).pipe(Effect.provide(ServerLayer)))

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
        console.error("[FetchBpm] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Failed to fetch track" }, { status: 500 })
      }
    }
    console.error("[FetchBpm] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to fetch BPM" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
