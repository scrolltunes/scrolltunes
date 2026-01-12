import { auth } from "@/auth"
import { userSongItems } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const deleteFavorite = (compositeId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const colonIndex = compositeId.indexOf(":")

    if (colonIndex === -1) {
      return yield* Effect.fail(
        new ValidationError({
          message: "Invalid songId format. Expected: {provider}:{id}",
        }),
      )
    }

    const provider = compositeId.slice(0, colonIndex)
    const userId = session.user.id

    const { db } = yield* DbService

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(userSongItems)
          .set({
            isFavorite: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userSongItems.userId, userId),
              eq(userSongItems.songProvider, provider),
              eq(userSongItems.songId, compositeId),
            ),
          ),
      catch: cause => new DatabaseError({ cause }),
    })

    return { success: true }
  })

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { songId } = await params

  const exit = await Effect.runPromiseExit(deleteFavorite(songId).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to remove favorite", exit.cause)
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
