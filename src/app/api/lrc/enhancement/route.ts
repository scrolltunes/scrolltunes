import { lrcWordEnhancements } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { and, eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class MissingLrclibIdError extends Data.TaggedClass("MissingLrclibIdError")<object> {}

class InvalidLrclibIdError extends Data.TaggedClass("InvalidLrclibIdError")<object> {}

class LookupError extends Data.TaggedClass("LookupError")<{
  readonly cause: unknown
}> {}

const lookupEnhancement = (request: Request) =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    const lrclibIdParam = url.searchParams.get("lrclibId")
    const lrcHash = url.searchParams.get("lrcHash")

    if (!lrclibIdParam) {
      return yield* Effect.fail(new MissingLrclibIdError({}))
    }

    const lrclibId = Number.parseInt(lrclibIdParam, 10)
    if (Number.isNaN(lrclibId)) {
      return yield* Effect.fail(new InvalidLrclibIdError({}))
    }

    const { db } = yield* DbService

    const conditions = [eq(lrcWordEnhancements.sourceLrclibId, lrclibId)]
    if (lrcHash) {
      conditions.push(eq(lrcWordEnhancements.lrcHash, lrcHash))
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            lrcHash: lrcWordEnhancements.lrcHash,
            payload: lrcWordEnhancements.payload,
            coverage: lrcWordEnhancements.coverage,
          })
          .from(lrcWordEnhancements)
          .where(and(...conditions))
          .limit(1),
      catch: cause => new LookupError({ cause }),
    })

    const enhancement = result[0]
    if (!enhancement) {
      return { found: false as const }
    }

    return {
      found: true as const,
      lrclibId,
      lrcHash: enhancement.lrcHash,
      payload: enhancement.payload,
      coverage: enhancement.coverage,
    }
  })

export async function GET(request: Request) {
  const exit = await Effect.runPromiseExit(lookupEnhancement(request).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "MissingLrclibIdError") {
        return NextResponse.json({ error: "Missing lrclibId parameter" }, { status: 400 })
      }
      if (error._tag === "InvalidLrclibIdError") {
        return NextResponse.json({ error: "Invalid lrclibId parameter" }, { status: 400 })
      }
    }
    console.error("Failed to lookup enhancement", exit.cause)
    return NextResponse.json({ error: "Failed to lookup enhancement" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
