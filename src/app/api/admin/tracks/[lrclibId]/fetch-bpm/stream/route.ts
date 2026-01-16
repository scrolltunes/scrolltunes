import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"
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

// ============================================================================
// Types
// ============================================================================

interface ProviderEvent {
  type: "provider_start" | "provider_result" | "complete" | "error"
  provider?: string
  success?: boolean
  bpm?: number
  error?: string
  latencyMs?: number
  source?: string
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeText(text: string): string {
  return text.toLowerCase().trim()
}

function sendEvent(controller: ReadableStreamDefaultController, event: ProviderEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  controller.enqueue(new TextEncoder().encode(data))
}

// ============================================================================
// Auth & Track Fetch Effect
// ============================================================================

interface TrackInfo {
  title: string
  artist: string
  album: string | null
  durationSec: number
}

const getTrackWithAuth = (lrclibId: number) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

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

    const turso = yield* TursoService
    const track = yield* turso.getById(lrclibId)

    if (!track) {
      return yield* Effect.fail(new NotFoundError({ resource: "track", id: String(lrclibId) }))
    }

    return { db, track }
  })

// ============================================================================
// Database Operations
// ============================================================================

function saveBpmToNeon(
  db: NeonHttpDatabase<typeof schema>,
  lrclibId: number,
  track: TrackInfo,
  bpm: number,
  source: string,
) {
  const roundedBpm = Math.round(bpm)

  return Effect.gen(function* () {
    const [existingMapping] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ songId: songLrclibIds.songId })
          .from(songLrclibIds)
          .where(eq(songLrclibIds.lrclibId, lrclibId)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existingMapping) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(songs)
            .set({ bpm: roundedBpm, bpmSource: source, updatedAt: new Date() })
            .where(eq(songs.id, existingMapping.songId)),
        catch: cause => new DatabaseError({ cause }),
      })
      return existingMapping.songId
    }

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
            bpm: roundedBpm,
            bpmSource: source,
            hasSyncedLyrics: true,
          })
          .returning({ id: songs.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!newSong) {
      return yield* Effect.fail(new DatabaseError({ cause: "Failed to create song" }))
    }

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lrclibId: string }> },
) {
  const { lrclibId: lrclibIdParam } = await params
  const lrclibId = Number.parseInt(lrclibIdParam, 10)

  if (Number.isNaN(lrclibId)) {
    return new Response(JSON.stringify({ error: "Invalid lrclibId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Pre-flight: verify auth and get track info
  const preflightExit = await Effect.runPromiseExit(
    getTrackWithAuth(lrclibId).pipe(Effect.provide(ServerLayer)),
  )

  if (preflightExit._tag === "Failure") {
    const cause = preflightExit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      }
      if (error._tag === "ForbiddenError") {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
      }
      if (error._tag === "NotFoundError") {
        return new Response(JSON.stringify({ error: `Track ${error.id} not found` }), {
          status: 404,
        })
      }
    }
    return new Response(JSON.stringify({ error: "Failed to fetch track" }), { status: 500 })
  }

  const { db, track } = preflightExit.value

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const bpmServiceExit = await Effect.runPromiseExit(
          BpmProviders.pipe(Effect.provide(ServerLayer)),
        )

        if (bpmServiceExit._tag === "Failure") {
          sendEvent(controller, { type: "error", error: "Failed to initialize BPM service" })
          controller.close()
          return
        }

        const bpmService = bpmServiceExit.value
        const loggingContext: LoggingContext = {
          lrclibId,
          songId: undefined,
          title: track.title,
          artist: track.artist,
        }
        const { fallbackProviders } = bpmService.withLogging(loggingContext)
        const query = { title: track.title, artist: track.artist }

        let bpmResult: { bpm: number; source: string } | null = null

        for (const provider of fallbackProviders) {
          sendEvent(controller, { type: "provider_start", provider: provider.name })

          const start = Date.now()
          const exit = await Effect.runPromiseExit(
            provider.getBpm(query).pipe(Effect.provide(ServerLayer)),
          )

          if (exit._tag === "Success") {
            const result = exit.value
            sendEvent(controller, {
              type: "provider_result",
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
              errorMessage = `API error: ${error.status}`
            } else if (error._tag === "BPMRateLimitError") {
              errorMessage = "Rate limited"
            }
          }

          sendEvent(controller, {
            type: "provider_result",
            provider: provider.name,
            success: false,
            error: errorMessage,
            latencyMs: Date.now() - start,
          })
        }

        // Save to Neon if successful
        if (bpmResult) {
          await Effect.runPromise(
            saveBpmToNeon(db, lrclibId, track, bpmResult.bpm, bpmResult.source).pipe(
              Effect.provide(ServerLayer),
            ),
          )
        }

        sendEvent(controller, {
          type: "complete",
          success: bpmResult !== null,
          ...(bpmResult && { bpm: bpmResult.bpm, source: bpmResult.source }),
        })
      } catch (err) {
        sendEvent(controller, { type: "error", error: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
