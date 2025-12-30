import { songLrclibIds, songs } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { desc, eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly cause: unknown
}> {}

const getTopSongs = (limit: number) =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            lrclibId: songLrclibIds.lrclibId,
            title: songs.title,
            artist: songs.artist,
            album: songs.album,
          })
          .from(songs)
          .innerJoin(songLrclibIds, eq(songs.id, songLrclibIds.songId))
          .orderBy(desc(songs.totalPlayCount))
          .limit(limit),
      catch: cause => new DatabaseError({ cause }),
    })

    return { songs: results }
  })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get("limit")

  let limit = 20
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 50)
    }
  }

  const exit = await Effect.runPromiseExit(getTopSongs(limit).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    console.error("Failed to fetch top songs:", exit.cause)
    return NextResponse.json({ error: "Failed to fetch top songs" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
