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
import { and, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const reorderSongs = (setlistId: string, songIds: string[]) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    // Empty songIds is a valid no-op
    if (songIds.length === 0) {
      return { success: true }
    }

    const { db } = yield* DbService

    // Verify setlist ownership
    const [setlist] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlists.id })
          .from(userSetlists)
          .where(and(eq(userSetlists.id, setlistId), eq(userSetlists.userId, session.user.id))),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!setlist) {
      return yield* Effect.fail(new NotFoundError({ resource: "Setlist", id: setlistId }))
    }

    // Verify all song IDs belong to this setlist
    const existingSongs = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlistSongs.id })
          .from(userSetlistSongs)
          .where(
            and(eq(userSetlistSongs.setlistId, setlistId), inArray(userSetlistSongs.id, songIds)),
          ),
      catch: cause => new DatabaseError({ cause }),
    })

    const existingIds = new Set(existingSongs.map(s => s.id))
    const invalidIds = songIds.filter(sid => !existingIds.has(sid))

    if (invalidIds.length > 0) {
      return yield* Effect.fail(
        new ValidationError({ message: `Invalid song IDs: ${invalidIds.join(", ")}` }),
      )
    }

    // Batch update sortOrder for all songs in a single request
    const updates = songIds.map((songId, i) =>
      db.update(userSetlistSongs).set({ sortOrder: i }).where(eq(userSetlistSongs.id, songId)),
    )
    const first = updates[0]
    if (first) {
      yield* Effect.tryPromise({
        try: () => db.batch([first, ...updates.slice(1)]),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { songIds } = body

  if (!Array.isArray(songIds)) {
    return NextResponse.json({ error: "songIds must be an array" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(
    reorderSongs(id, songIds as string[]).pipe(Effect.provide(DbLayer)),
  )

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof NotFoundError) {
        return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
      }
      if (cause.error instanceof ValidationError) {
        console.error("[reorder] Invalid song IDs:", cause.error.message)
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
    }
    console.error("[reorder] Error:", exit.cause)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
