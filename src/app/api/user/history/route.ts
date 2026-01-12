import { auth } from "@/auth"
import { userSongItems } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getHistory = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new UnauthorizedError({}))
  }

  const { db } = yield* DbService
  const history = yield* Effect.tryPromise({
    try: () =>
      db
        .select({
          songId: userSongItems.songId,
          songProvider: userSongItems.songProvider,
          title: userSongItems.songTitle,
          artist: userSongItems.songArtist,
          lastPlayedAt: userSongItems.lastPlayedAt,
          playCount: userSongItems.playCount,
        })
        .from(userSongItems)
        .where(
          and(
            eq(userSongItems.userId, session.user.id),
            eq(userSongItems.inHistory, true),
            eq(userSongItems.deleted, false),
          ),
        )
        .orderBy(desc(userSongItems.lastPlayedAt)),
    catch: cause => new DatabaseError({ cause }),
  })

  return {
    history: history.map(item => ({
      songId: item.songId,
      songProvider: item.songProvider,
      title: item.title,
      artist: item.artist,
      lastPlayedAt: item.lastPlayedAt?.toISOString() ?? null,
      playCount: item.playCount,
    })),
  }
})

const deleteHistory = (songId: string | null) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    if (songId) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongItems)
            .set({ inHistory: false })
            .where(
              and(
                eq(userSongItems.userId, session.user.id),
                eq(userSongItems.songId, songId),
                eq(userSongItems.inHistory, true),
              ),
            ),
        catch: cause => new DatabaseError({ cause }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongItems)
            .set({ inHistory: false })
            .where(
              and(eq(userSongItems.userId, session.user.id), eq(userSongItems.inHistory, true)),
            ),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

export async function GET() {
  const exit = await Effect.runPromiseExit(getHistory.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to load history", exit.cause)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const songId = typeof body.songId === "string" ? body.songId : null

  const exit = await Effect.runPromiseExit(deleteHistory(songId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to delete history", exit.cause)
    return NextResponse.json({ error: "Failed to delete history" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
