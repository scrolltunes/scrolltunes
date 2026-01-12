import { auth } from "@/auth"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import {
  AuthError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const deleteSong = (setlistId: string, compositeId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const [provider, ...idParts] = compositeId.split(":")
    const songId = idParts.join(":")

    if (!provider || !songId) {
      return yield* Effect.fail(
        new ValidationError({
          message: "Invalid songId format. Expected: {provider}:{id}",
        }),
      )
    }

    const { db } = yield* DbService

    const setlist = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlists.id })
          .from(userSetlists)
          .where(and(eq(userSetlists.id, setlistId), eq(userSetlists.userId, session.user.id)))
          .then(rows => rows[0]),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!setlist) {
      return yield* Effect.fail(new NotFoundError({ resource: "Setlist", id: setlistId }))
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        db
          .delete(userSetlistSongs)
          .where(
            and(
              eq(userSetlistSongs.setlistId, setlistId),
              eq(userSetlistSongs.songProvider, provider),
              eq(userSetlistSongs.songId, songId),
            ),
          )
          .returning({ id: userSetlistSongs.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (result.length === 0) {
      return yield* Effect.fail(new NotFoundError({ resource: "Song in setlist" }))
    }

    return { success: true }
  })

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; songId: string }> },
) {
  const { id, songId } = await params

  const exit = await Effect.runPromiseExit(deleteSong(id, songId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof ValidationError) {
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
      if (cause.error instanceof NotFoundError) {
        const message =
          cause.error.resource === "Setlist" ? "Setlist not found" : "Song not found in setlist"
        return NextResponse.json({ error: message }, { status: 404 })
      }
    }
    console.error("Failed to delete song from setlist", exit.cause)
    return NextResponse.json({ error: "Failed to delete song from setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
