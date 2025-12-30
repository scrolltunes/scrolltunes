import { auth } from "@/auth"
import { songs } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

interface UpdateBpmRequest {
  bpm: number
  musicalKey?: string | null
  source?: string
  sourceUrl?: string
}

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class InvalidRequestError extends Data.TaggedClass("InvalidRequestError")<{
  readonly message: string
}> {}

class NotFoundError extends Data.TaggedClass("NotFoundError")<object> {}

class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly cause: unknown
}> {}

const updateBpm = (songId: string, request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<UpdateBpmRequest>,
      catch: () => new InvalidRequestError({ message: "Invalid JSON body" }),
    })

    if (typeof body.bpm !== "number" || body.bpm <= 0 || body.bpm > 300) {
      return yield* Effect.fail(
        new InvalidRequestError({ message: "bpm must be a number between 1 and 300" }),
      )
    }

    const { db } = yield* DbService

    const [updated] = yield* Effect.tryPromise({
      try: () =>
        db
          .update(songs)
          .set({
            bpm: Math.round(body.bpm),
            musicalKey: body.musicalKey ?? null,
            bpmSource: body.source ?? "Manual",
            bpmSourceUrl: body.sourceUrl ?? null,
            updatedAt: new Date(),
          })
          .where(eq(songs.id, songId))
          .returning({
            id: songs.id,
            title: songs.title,
            artist: songs.artist,
            bpm: songs.bpm,
            musicalKey: songs.musicalKey,
            bpmSource: songs.bpmSource,
            bpmSourceUrl: songs.bpmSourceUrl,
          }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!updated) {
      return yield* Effect.fail(new NotFoundError({}))
    }

    return updated
  })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const exit = await Effect.runPromiseExit(updateBpm(id, request).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "InvalidRequestError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      if (error._tag === "NotFoundError") {
        return NextResponse.json({ error: "Song not found" }, { status: 404 })
      }
    }
    console.error("Failed to update BPM:", exit.cause)
    return NextResponse.json({ error: "Failed to update BPM" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
