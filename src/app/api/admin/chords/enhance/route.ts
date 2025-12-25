import { auth } from "@/auth"
import {
  type ChordEnhancementPayloadV1,
  appUserProfiles,
  chordEnhancements,
  songs,
} from "@/lib/db/schema"
import { computeLrcHash } from "@/lib/lrc-hash"
import { DbLayer, DbService } from "@/services/db"
import { eq, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

interface SaveChordEnhancementRequest {
  songId: string
  lrclibId: number
  baseLrc: string
  payload: ChordEnhancementPayloadV1
  coverage: number
}

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class ForbiddenError extends Data.TaggedClass("ForbiddenError")<object> {}

class InvalidRequestError extends Data.TaggedClass("InvalidRequestError")<{
  readonly message: string
}> {}

class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly cause: unknown
}> {}

const saveChordEnhancement = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const { db } = yield* DbService

    const [profile] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ isAdmin: appUserProfiles.isAdmin })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, userId)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<SaveChordEnhancementRequest>,
      catch: () => new InvalidRequestError({ message: "Invalid JSON body" }),
    })

    if (!body.songId || typeof body.songId !== "string") {
      return yield* Effect.fail(new InvalidRequestError({ message: "songId is required" }))
    }
    if (!body.lrclibId || typeof body.lrclibId !== "number") {
      return yield* Effect.fail(new InvalidRequestError({ message: "lrclibId is required" }))
    }
    if (!body.baseLrc || typeof body.baseLrc !== "string") {
      return yield* Effect.fail(new InvalidRequestError({ message: "baseLrc is required" }))
    }
    if (!body.payload || typeof body.payload !== "object") {
      return yield* Effect.fail(new InvalidRequestError({ message: "payload is required" }))
    }
    if (typeof body.coverage !== "number") {
      return yield* Effect.fail(new InvalidRequestError({ message: "coverage is required" }))
    }

    const lrcHash = yield* Effect.tryPromise({
      try: () => computeLrcHash(body.baseLrc),
      catch: cause => new DatabaseError({ cause }),
    })

    const [enhancement] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(chordEnhancements)
          .values({
            songId: body.songId,
            sourceLrclibId: body.lrclibId,
            lrcHash,
            algoVersion: body.payload.algoVersion,
            patchFormatVersion: body.payload.patchFormatVersion,
            payload: body.payload,
            source: "admin",
            coverage: body.coverage,
            createdBy: userId,
          })
          .onConflictDoUpdate({
            target: [
              chordEnhancements.songId,
              chordEnhancements.lrcHash,
              chordEnhancements.algoVersion,
              chordEnhancements.patchFormatVersion,
            ],
            set: {
              payload: body.payload,
              coverage: body.coverage,
              createdBy: userId,
              createdAt: sql`now()`,
            },
          })
          .returning({ id: chordEnhancements.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    yield* Effect.tryPromise({
      try: () =>
        db.update(songs).set({ hasChordEnhancement: true }).where(eq(songs.id, body.songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { id: enhancement?.id }
  })

export async function POST(request: Request) {
  const exit = await Effect.runPromiseExit(
    saveChordEnhancement(request).pipe(Effect.provide(DbLayer)),
  )

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
      if (error._tag === "InvalidRequestError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    console.error("Failed to save chord enhancement", exit.cause)
    return NextResponse.json({ error: "Failed to save chord enhancement" }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: exit.value.id })
}

const getChordEnhancement = (lrclibId: number) =>
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

    const [enhancement] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: chordEnhancements.id,
            payload: chordEnhancements.payload,
            coverage: chordEnhancements.coverage,
            createdAt: chordEnhancements.createdAt,
          })
          .from(chordEnhancements)
          .where(eq(chordEnhancements.sourceLrclibId, lrclibId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return enhancement ?? null
  })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lrclibIdParam = url.searchParams.get("lrclibId")

  if (!lrclibIdParam) {
    return NextResponse.json({ error: "lrclibId is required" }, { status: 400 })
  }

  const lrclibId = Number.parseInt(lrclibIdParam, 10)
  if (Number.isNaN(lrclibId)) {
    return NextResponse.json({ error: "Invalid lrclibId" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(
    getChordEnhancement(lrclibId).pipe(Effect.provide(DbLayer)),
  )

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
    console.error("Failed to get chord enhancement", exit.cause)
    return NextResponse.json({ error: "Failed to get chord enhancement" }, { status: 500 })
  }

  if (!exit.value) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    enhancement: exit.value,
  })
}

interface DeleteChordEnhancementRequest {
  songId: string
  lrclibId: number
}

const deleteChordEnhancement = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const { db } = yield* DbService

    const [profile] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ isAdmin: appUserProfiles.isAdmin })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, userId)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<DeleteChordEnhancementRequest>,
      catch: () => new InvalidRequestError({ message: "Invalid JSON body" }),
    })

    if (!body.songId || typeof body.songId !== "string") {
      return yield* Effect.fail(new InvalidRequestError({ message: "songId is required" }))
    }
    if (!body.lrclibId || typeof body.lrclibId !== "number") {
      return yield* Effect.fail(new InvalidRequestError({ message: "lrclibId is required" }))
    }

    yield* Effect.tryPromise({
      try: () => db.delete(chordEnhancements).where(eq(chordEnhancements.songId, body.songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    yield* Effect.tryPromise({
      try: () =>
        db.update(songs).set({ hasChordEnhancement: false }).where(eq(songs.id, body.songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { success: true }
  })

export async function DELETE(request: Request) {
  const exit = await Effect.runPromiseExit(
    deleteChordEnhancement(request).pipe(Effect.provide(DbLayer)),
  )

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
      if (error._tag === "InvalidRequestError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    console.error("Failed to delete chord enhancement", exit.cause)
    return NextResponse.json({ error: "Failed to delete chord enhancement" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
