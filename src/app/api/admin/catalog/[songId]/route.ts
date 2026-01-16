import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const deleteSong = (songId: string) =>
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

    // Delete mapping first (foreign key constraint)
    yield* Effect.tryPromise({
      try: () => db.delete(songLrclibIds).where(eq(songLrclibIds.songId, songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    // Delete song
    yield* Effect.tryPromise({
      try: () => db.delete(songs).where(eq(songs.id, songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { deleted: true }
  })

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { songId } = await params

  const exit = await Effect.runPromiseExit(deleteSong(songId).pipe(Effect.provide(DbLayer)))

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
    }
    console.error("[Catalog Delete] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to delete song" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
