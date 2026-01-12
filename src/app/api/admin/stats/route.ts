import { auth } from "@/auth"
import { appUserProfiles, userSongItems, users } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { count, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getStats = Effect.gen(function* () {
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

  // Run all queries in parallel using Effect.all
  const [topFavorites, [userCount], [lastUser]] = yield* Effect.all(
    [
      // Top 5 most favorited songs
      Effect.tryPromise({
        try: () =>
          db
            .select({
              songId: userSongItems.songId,
              title: userSongItems.songTitle,
              artist: userSongItems.songArtist,
              favoriteCount: count(),
            })
            .from(userSongItems)
            .where(eq(userSongItems.isFavorite, true))
            .groupBy(userSongItems.songId, userSongItems.songTitle, userSongItems.songArtist)
            .orderBy(desc(count()))
            .limit(5),
        catch: cause => new DatabaseError({ cause }),
      }),

      // Total users
      Effect.tryPromise({
        try: () => db.select({ count: count() }).from(users),
        catch: cause => new DatabaseError({ cause }),
      }),

      // Last joined user
      Effect.tryPromise({
        try: () =>
          db
            .select({
              email: users.email,
              createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(1),
        catch: cause => new DatabaseError({ cause }),
      }),
    ],
    { concurrency: "unbounded" },
  )

  return {
    topFavorites: topFavorites.map(song => ({
      title: song.title,
      artist: song.artist,
      favoriteCount: song.favoriteCount,
    })),
    totalUsers: userCount?.count ?? 0,
    lastJoinedUser: lastUser
      ? {
          email: lastUser.email,
          joinedAt: lastUser.createdAt.toISOString(),
        }
      : null,
  }
})

export async function GET() {
  const exit = await Effect.runPromiseExit(getStats.pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to fetch stats", exit.cause)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
