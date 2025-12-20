import { auth } from "@/auth"
import { userSongItems } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { and, count, eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class HistoryCountError extends Data.TaggedClass("HistoryCountError")<{
  readonly cause: unknown
}> {}

const getHistoryCount = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return 0
  }

  const { db } = yield* DbService
  const result = yield* Effect.tryPromise({
    try: () =>
      db
        .select({ count: count() })
        .from(userSongItems)
        .where(
          and(
            eq(userSongItems.userId, session.user.id),
            eq(userSongItems.inHistory, true),
            eq(userSongItems.deleted, false),
          ),
        ),
    catch: cause => new HistoryCountError({ cause }),
  })

  return result[0]?.count ?? 0
})

export async function GET() {
  const exit = await Effect.runPromiseExit(
    getHistoryCount.pipe(Effect.provide(DbLayer)),
  )

  if (exit._tag === "Failure") {
    console.error("Failed to load history count", exit.cause)
    return NextResponse.json({ error: "Failed to load history count" }, { status: 500 })
  }

  return NextResponse.json({ count: exit.value })
}
