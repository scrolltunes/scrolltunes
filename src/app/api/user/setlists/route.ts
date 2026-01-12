import { auth } from "@/auth"
import { INPUT_LIMITS } from "@/constants/limits"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getSetlists = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new UnauthorizedError({}))
  }

  const { db } = yield* DbService

  const setlistRows = yield* Effect.tryPromise({
    try: () =>
      db
        .select({
          id: userSetlists.id,
          name: userSetlists.name,
          description: userSetlists.description,
          color: userSetlists.color,
          icon: userSetlists.icon,
          sortOrder: userSetlists.sortOrder,
        })
        .from(userSetlists)
        .where(eq(userSetlists.userId, session.user.id))
        .orderBy(asc(userSetlists.sortOrder)),
    catch: cause => new DatabaseError({ cause }),
  })

  const setlistIds = setlistRows.map(s => s.id)

  const songRows = yield* Effect.tryPromise({
    try: () =>
      setlistIds.length > 0
        ? db
            .select({
              setlistId: userSetlistSongs.setlistId,
              songId: userSetlistSongs.songId,
              songProvider: userSetlistSongs.songProvider,
              songTitle: userSetlistSongs.songTitle,
              songArtist: userSetlistSongs.songArtist,
              sortOrder: userSetlistSongs.sortOrder,
            })
            .from(userSetlistSongs)
            .where(inArray(userSetlistSongs.setlistId, setlistIds))
        : Promise.resolve([]),
    catch: cause => new DatabaseError({ cause }),
  })

  const songsBySetlist = new Map<string, typeof songRows>()
  for (const song of songRows) {
    const existing = songsBySetlist.get(song.setlistId) ?? []
    existing.push(song)
    songsBySetlist.set(song.setlistId, existing)
  }

  const setlists = setlistRows.map(setlist => {
    const songs = songsBySetlist.get(setlist.id) ?? []
    return {
      ...setlist,
      songCount: songs.length,
      songs: songs
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(s => ({
          songId: s.songId,
          songProvider: s.songProvider,
          title: s.songTitle,
          artist: s.songArtist,
          sortOrder: s.sortOrder,
        })),
    }
  })

  return { setlists }
})

interface CreateSetlistInput {
  name?: unknown
  description?: unknown
  color?: unknown
  icon?: unknown
}

const createSetlist = (input: CreateSetlistInput) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { name, description, color, icon } = input

    if (!name || typeof name !== "string") {
      return yield* Effect.fail(new ValidationError({ message: "Name is required" }))
    }

    if (name.length > INPUT_LIMITS.SETLIST_NAME) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Name must be ${INPUT_LIMITS.SETLIST_NAME} characters or less`,
        }),
      )
    }

    if (
      description &&
      typeof description === "string" &&
      description.length > INPUT_LIMITS.SETLIST_DESCRIPTION
    ) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Description must be ${INPUT_LIMITS.SETLIST_DESCRIPTION} characters or less`,
        }),
      )
    }

    const { db } = yield* DbService

    const maxSortOrder = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ max: userSetlists.sortOrder })
          .from(userSetlists)
          .where(eq(userSetlists.userId, session.user.id))
          .then(rows => rows[0]?.max ?? -1),
      catch: cause => new DatabaseError({ cause }),
    })

    const [setlist] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(userSetlists)
          .values({
            userId: session.user.id,
            name,
            description: typeof description === "string" ? description : null,
            color: typeof color === "string" ? color : null,
            icon: typeof icon === "string" ? icon : null,
            sortOrder: maxSortOrder + 1,
          })
          .returning(),
      catch: cause => new DatabaseError({ cause }),
    })

    return { setlist }
  })

export async function GET() {
  const exit = await Effect.runPromiseExit(getSetlists.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to fetch setlists", exit.cause)
    return NextResponse.json({ error: "Failed to fetch setlists" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const exit = await Effect.runPromiseExit(createSetlist(body).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to create setlist", exit.cause)
    return NextResponse.json({ error: "Failed to create setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value, { status: 201 })
}
