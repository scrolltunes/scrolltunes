import { auth } from "@/auth"
import { userSongSettings } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const SONG_PROVIDER = "lrclib"

const getTranspose = (songId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const { db } = yield* DbService

    const settings = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ transposeSemitones: userSongSettings.transposeSemitones })
          .from(userSongSettings)
          .where(
            and(
              eq(userSongSettings.userId, userId),
              eq(userSongSettings.songProvider, SONG_PROVIDER),
              eq(userSongSettings.songId, songId),
            ),
          )
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    const transpose = settings[0]?.transposeSemitones ?? 0
    return { transpose }
  })

const saveTranspose = (songId: string, request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const { db } = yield* DbService

    const body = yield* Effect.tryPromise({
      try: () => request.json().catch(() => ({})),
      catch: cause => new ValidationError({ message: `Invalid JSON: ${String(cause)}` }),
    })

    const transpose = typeof body.transpose === "number" ? body.transpose : 0
    const clamped = Math.max(-12, Math.min(12, transpose))

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSongSettings.id })
          .from(userSongSettings)
          .where(
            and(
              eq(userSongSettings.userId, userId),
              eq(userSongSettings.songProvider, SONG_PROVIDER),
              eq(userSongSettings.songId, songId),
            ),
          )
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    const existingRecord = existing[0]
    if (existingRecord) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(userSongSettings)
            .set({
              transposeSemitones: clamped,
              updatedAt: new Date(),
            })
            .where(eq(userSongSettings.id, existingRecord.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    } else {
      yield* Effect.tryPromise({
        try: () =>
          db.insert(userSongSettings).values({
            userId,
            songId,
            songProvider: SONG_PROVIDER,
            transposeSemitones: clamped,
          }),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true, transpose: clamped }
  })

export async function GET(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const exit = await Effect.runPromiseExit(getTranspose(songId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function PUT(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const exit = await Effect.runPromiseExit(
    saveTranspose(songId, request).pipe(Effect.provide(DbLayer)),
  )

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof ValidationError) {
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
