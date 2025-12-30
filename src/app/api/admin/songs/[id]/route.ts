import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class ForbiddenError extends Data.TaggedClass("ForbiddenError")<object> {}

class NotFoundError extends Data.TaggedClass("NotFoundError")<object> {}

class QueryError extends Data.TaggedClass("QueryError")<{
  readonly cause: unknown
}> {}

const getSong = (songId: string) =>
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
      catch: cause => new QueryError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    const [song] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: songs.id,
            title: songs.title,
            artist: songs.artist,
            album: songs.album,
            durationMs: songs.durationMs,
            spotifyId: songs.spotifyId,
            hasSyncedLyrics: songs.hasSyncedLyrics,
            hasEnhancement: songs.hasEnhancement,
            hasChordEnhancement: songs.hasChordEnhancement,
            totalPlayCount: songs.totalPlayCount,
            createdAt: songs.createdAt,
            updatedAt: songs.updatedAt,
            bpm: songs.bpm,
            musicalKey: songs.musicalKey,
            bpmSource: songs.bpmSource,
            bpmSourceUrl: songs.bpmSourceUrl,
          })
          .from(songs)
          .where(eq(songs.id, songId)),
      catch: cause => new QueryError({ cause }),
    })

    if (!song) {
      return yield* Effect.fail(new NotFoundError({}))
    }

    const lrclibIds = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            lrclibId: songLrclibIds.lrclibId,
            isPrimary: songLrclibIds.isPrimary,
          })
          .from(songLrclibIds)
          .where(eq(songLrclibIds.songId, songId)),
      catch: cause => new QueryError({ cause }),
    })

    return {
      ...song,
      createdAt: song.createdAt.toISOString(),
      updatedAt: song.updatedAt.toISOString(),
      lrclibIds: lrclibIds.map(l => ({
        id: l.lrclibId,
        isPrimary: l.isPrimary,
      })),
    }
  })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const exit = await Effect.runPromiseExit(getSong(id).pipe(Effect.provide(DbLayer)))

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
        return NextResponse.json({ error: "Song not found" }, { status: 404 })
      }
    }
    console.error("Failed to fetch song", exit.cause)
    return NextResponse.json({ error: "Failed to fetch song" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
