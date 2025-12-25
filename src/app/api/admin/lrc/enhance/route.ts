import { auth } from "@/auth"
import {
  type EnhancementPayload,
  appUserProfiles,
  lrcWordEnhancements,
  songs,
} from "@/lib/db/schema"
import { computeLrcHash } from "@/lib/lrc-hash"
import { DbLayer, DbService } from "@/services/db"
import { eq, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

interface EnhanceRequestBody {
  songId: string
  lrclibId: number
  baseLrc: string
  payload: EnhancementPayload
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

const enhanceLrc = (request: Request) =>
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
      try: () => request.json() as Promise<EnhanceRequestBody>,
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
          .insert(lrcWordEnhancements)
          .values({
            songId: body.songId,
            sourceLrclibId: body.lrclibId,
            lrcHash,
            payload: body.payload,
            source: "admin",
            coverage: body.coverage,
            createdBy: userId,
          })
          .onConflictDoUpdate({
            target: [lrcWordEnhancements.sourceLrclibId, lrcWordEnhancements.lrcHash],
            set: {
              payload: body.payload,
              coverage: body.coverage,
              createdBy: userId,
              createdAt: sql`now()`,
            },
          })
          .returning({ id: lrcWordEnhancements.id }),
      catch: cause => new DatabaseError({ cause }),
    })

    yield* Effect.tryPromise({
      try: () => db.update(songs).set({ hasEnhancement: true }).where(eq(songs.id, body.songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { id: enhancement?.id }
  })

export async function POST(request: Request) {
  const exit = await Effect.runPromiseExit(enhanceLrc(request).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to enhance LRC", exit.cause)
    return NextResponse.json({ error: "Failed to enhance LRC" }, { status: 500 })
  }

  return NextResponse.json({ success: true, enhancementId: exit.value.id })
}

interface DeleteRequestBody {
  songId: string
  lrclibId: number
}

const deleteEnhancement = (request: Request) =>
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
      try: () => request.json() as Promise<DeleteRequestBody>,
      catch: () => new InvalidRequestError({ message: "Invalid JSON body" }),
    })

    if (!body.songId || typeof body.songId !== "string") {
      return yield* Effect.fail(new InvalidRequestError({ message: "songId is required" }))
    }
    if (!body.lrclibId || typeof body.lrclibId !== "number") {
      return yield* Effect.fail(new InvalidRequestError({ message: "lrclibId is required" }))
    }

    // Delete enhancement by LRCLIB ID
    yield* Effect.tryPromise({
      try: () =>
        db.delete(lrcWordEnhancements).where(eq(lrcWordEnhancements.sourceLrclibId, body.lrclibId)),
      catch: cause => new DatabaseError({ cause }),
    })

    // Update song's hasEnhancement flag
    yield* Effect.tryPromise({
      try: () => db.update(songs).set({ hasEnhancement: false }).where(eq(songs.id, body.songId)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { success: true }
  })

export async function DELETE(request: Request) {
  const exit = await Effect.runPromiseExit(deleteEnhancement(request).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to delete enhancement", exit.cause)
    return NextResponse.json({ error: "Failed to delete enhancement" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
