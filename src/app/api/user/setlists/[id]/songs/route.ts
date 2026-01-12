import { auth } from "@/auth"
import { normalizeSongInput } from "@/lib/db/normalize"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import {
  AuthError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, asc, eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getSongs = (setlistId: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
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

    const songs = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(userSetlistSongs)
          .where(eq(userSetlistSongs.setlistId, setlistId))
          .orderBy(asc(userSetlistSongs.sortOrder)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { songs }
  })

interface AddSongInput {
  songId?: unknown
  songProvider?: unknown
  title?: unknown
  artist?: unknown
  album?: unknown
}

const addSong = (setlistId: string, input: AddSongInput) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { songId, songProvider, title, artist, album } = input

    if (
      typeof songId !== "string" ||
      typeof songProvider !== "string" ||
      typeof title !== "string" ||
      typeof artist !== "string"
    ) {
      return yield* Effect.fail(
        new ValidationError({
          message: "Missing required fields: songId, songProvider, title, artist",
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

    // Check if song already exists in this setlist
    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlistSongs.id })
          .from(userSetlistSongs)
          .where(
            and(
              eq(userSetlistSongs.setlistId, setlistId),
              eq(userSetlistSongs.songId, songId),
              eq(userSetlistSongs.songProvider, songProvider),
            ),
          )
          .then(rows => rows[0]),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existing) {
      return yield* Effect.fail(new ConflictError({ message: "Song already in setlist" }))
    }

    const maxSortOrderResult = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ max: sql<number>`COALESCE(MAX(${userSetlistSongs.sortOrder}), -1)` })
          .from(userSetlistSongs)
          .where(eq(userSetlistSongs.setlistId, setlistId))
          .then(rows => rows[0]?.max ?? -1),
      catch: cause => new DatabaseError({ cause }),
    })

    const [song] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(userSetlistSongs)
          .values(
            normalizeSongInput({
              setlistId,
              songId,
              songProvider,
              songTitle: title,
              songArtist: artist,
              songAlbum: typeof album === "string" ? album : "",
              sortOrder: maxSortOrderResult + 1,
            }),
          )
          .returning(),
      catch: cause => new DatabaseError({ cause }),
    })

    return { song }
  })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const exit = await Effect.runPromiseExit(getSongs(id).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof NotFoundError) {
        return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
      }
    }
    console.error("Failed to fetch setlist songs", exit.cause)
    return NextResponse.json({ error: "Failed to fetch setlist songs" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const exit = await Effect.runPromiseExit(addSong(id, body).pipe(Effect.provide(DbLayer)))

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
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
      if (cause.error instanceof ConflictError) {
        return NextResponse.json({ error: cause.error.message }, { status: 409 })
      }
    }
    console.error("Failed to add song to setlist", exit.cause)
    return NextResponse.json({ error: "Failed to add song to setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value, { status: 201 })
}
