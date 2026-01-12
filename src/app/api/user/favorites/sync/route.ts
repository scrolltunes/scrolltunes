import { auth } from "@/auth"
import { normalizeSongInput } from "@/lib/db/normalize"
import { userSongItems } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

interface FavoriteInput {
  songId: string
  songProvider: string
  title: string
  artist: string
  album?: string
}

interface SyncRequest {
  favorites: FavoriteInput[]
}

const getFavorites = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new UnauthorizedError({}))
  }

  const userId = session.user.id
  const { db } = yield* DbService

  const serverFavorites = yield* Effect.tryPromise({
    try: () =>
      db
        .select({
          songId: userSongItems.songId,
          songProvider: userSongItems.songProvider,
          title: userSongItems.songTitle,
          artist: userSongItems.songArtist,
          album: userSongItems.songAlbum,
          addedAt: userSongItems.createdAt,
        })
        .from(userSongItems)
        .where(
          and(
            eq(userSongItems.userId, userId),
            eq(userSongItems.isFavorite, true),
            eq(userSongItems.deleted, false),
          ),
        )
        .orderBy(desc(userSongItems.createdAt)),
    catch: cause => new DatabaseError({ cause }),
  })

  return serverFavorites.map(f => ({
    songId: f.songId,
    songProvider: f.songProvider,
    title: f.title,
    artist: f.artist,
    album: f.album,
    addedAt: f.addedAt?.toISOString() ?? new Date().toISOString(),
  }))
})

export async function GET() {
  const exit = await Effect.runPromiseExit(getFavorites.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to get favorites", exit.cause)
    return NextResponse.json({ error: "Failed to get favorites" }, { status: 500 })
  }

  return NextResponse.json({ favorites: exit.value })
}

const syncFavorites = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<SyncRequest>,
      catch: cause => new ValidationError({ message: `Invalid request body: ${cause}` }),
    })

    if (!Array.isArray(body.favorites)) {
      return yield* Effect.fail(new ValidationError({ message: "favorites must be an array" }))
    }

    const { db } = yield* DbService

    // Use Effect.all with concurrency for parallel inserts
    yield* Effect.all(
      body.favorites.map(fav =>
        Effect.tryPromise({
          try: () =>
            db
              .insert(userSongItems)
              .values(
                normalizeSongInput({
                  userId,
                  songId: fav.songId,
                  songProvider: fav.songProvider,
                  songTitle: fav.title,
                  songArtist: fav.artist,
                  songAlbum: fav.album ?? "",
                  isFavorite: true,
                }),
              )
              .onConflictDoUpdate({
                target: [userSongItems.userId, userSongItems.songProvider, userSongItems.songId],
                set: {
                  isFavorite: true,
                  updatedAt: new Date(),
                },
              }),
          catch: cause => new DatabaseError({ cause }),
        }),
      ),
      { concurrency: 5 },
    )

    const serverFavorites = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            songId: userSongItems.songId,
            songProvider: userSongItems.songProvider,
            title: userSongItems.songTitle,
            artist: userSongItems.songArtist,
            album: userSongItems.songAlbum,
          })
          .from(userSongItems)
          .where(
            and(
              eq(userSongItems.userId, userId),
              eq(userSongItems.isFavorite, true),
              eq(userSongItems.deleted, false),
            ),
          ),
      catch: cause => new DatabaseError({ cause }),
    })

    return serverFavorites
  })

export async function POST(request: Request) {
  const exit = await Effect.runPromiseExit(syncFavorites(request).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "ValidationError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    console.error("Failed to sync favorites", exit.cause)
    return NextResponse.json({ error: "Failed to sync favorites" }, { status: 500 })
  }

  return NextResponse.json({ favorites: exit.value })
}
