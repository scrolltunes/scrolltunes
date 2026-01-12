import { auth } from "@/auth"
import { INPUT_LIMITS } from "@/constants/limits"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import {
  AuthError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getSetlist = (id: string) =>
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
          .select()
          .from(userSetlists)
          .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
          .then(rows => rows[0]),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!setlist) {
      return yield* Effect.fail(new NotFoundError({ resource: "Setlist", id }))
    }

    const songs = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(userSetlistSongs)
          .where(eq(userSetlistSongs.setlistId, id))
          .orderBy(asc(userSetlistSongs.sortOrder)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { setlist: { ...setlist, songs } }
  })

interface UpdateSetlistInput {
  name?: unknown
  description?: unknown
  color?: unknown
  icon?: unknown
  sortOrder?: unknown
}

const updateSetlist = (id: string, input: UpdateSetlistInput) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { name, description, color, icon, sortOrder } = input

    if (name !== undefined && typeof name === "string" && name.length > INPUT_LIMITS.SETLIST_NAME) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Name must be ${INPUT_LIMITS.SETLIST_NAME} characters or less`,
        }),
      )
    }

    if (
      description !== undefined &&
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

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlists.id })
          .from(userSetlists)
          .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
          .then(rows => rows[0]),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!existing) {
      return yield* Effect.fail(new NotFoundError({ resource: "Setlist", id }))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color
    if (icon !== undefined) updates.icon = icon
    if (sortOrder !== undefined) updates.sortOrder = sortOrder

    const [setlist] = yield* Effect.tryPromise({
      try: () => db.update(userSetlists).set(updates).where(eq(userSetlists.id, id)).returning(),
      catch: cause => new DatabaseError({ cause }),
    })

    return { setlist }
  })

const deleteSetlist = (id: string) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    const existing = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ id: userSetlists.id })
          .from(userSetlists)
          .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
          .then(rows => rows[0]),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!existing) {
      return yield* Effect.fail(new NotFoundError({ resource: "Setlist", id }))
    }

    yield* Effect.tryPromise({
      try: () => db.delete(userSetlists).where(eq(userSetlists.id, id)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { success: true }
  })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const exit = await Effect.runPromiseExit(getSetlist(id).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to fetch setlist", exit.cause)
    return NextResponse.json({ error: "Failed to fetch setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const exit = await Effect.runPromiseExit(updateSetlist(id, body).pipe(Effect.provide(DbLayer)))

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
    }
    console.error("Failed to update setlist", exit.cause)
    return NextResponse.json({ error: "Failed to update setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const exit = await Effect.runPromiseExit(deleteSetlist(id).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to delete setlist", exit.cause)
    return NextResponse.json({ error: "Failed to delete setlist" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
