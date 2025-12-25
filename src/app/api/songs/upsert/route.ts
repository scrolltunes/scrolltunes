import { auth } from "@/auth"
import { songLrclibIds, songs } from "@/lib/db/schema"
import { prepareCatalogSong } from "@/lib/song-catalog"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

interface UpsertSongRequest {
  title: string
  artist: string
  album?: string
  durationMs?: number
  spotifyId?: string
  lrclibId?: number
  hasSyncedLyrics?: boolean
}

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class InvalidRequestError extends Data.TaggedClass("InvalidRequestError")<{
  readonly message: string
}> {}

class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly cause: unknown
}> {}

const upsertSong = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<UpsertSongRequest>,
      catch: () => new InvalidRequestError({ message: "Invalid JSON body" }),
    })

    if (!body.title || !body.artist) {
      return yield* Effect.fail(new InvalidRequestError({ message: "title and artist required" }))
    }

    const prepared = prepareCatalogSong({
      title: body.title,
      artist: body.artist,
      album: body.album,
      durationMs: body.durationMs,
      spotifyId: body.spotifyId,
      lrclibId: body.lrclibId,
      hasSyncedLyrics: body.hasSyncedLyrics,
    })

    const { db } = yield* DbService

    const [song] = yield* Effect.tryPromise({
      try: () =>
        db
          .insert(songs)
          .values({
            title: prepared.title,
            artist: prepared.artist,
            album: prepared.album,
            durationMs: prepared.durationMs,
            spotifyId: prepared.spotifyId,
            artistLower: prepared.artistLower,
            titleLower: prepared.titleLower,
            hasSyncedLyrics: prepared.hasSyncedLyrics,
          })
          .onConflictDoUpdate({
            target: [songs.artistLower, songs.titleLower],
            set: {
              ...(prepared.album && { album: prepared.album }),
              ...(prepared.durationMs && { durationMs: prepared.durationMs }),
              ...(prepared.spotifyId && { spotifyId: prepared.spotifyId }),
              ...(prepared.hasSyncedLyrics && { hasSyncedLyrics: prepared.hasSyncedLyrics }),
              updatedAt: new Date(),
            },
          })
          .returning({
            id: songs.id,
            title: songs.title,
            artist: songs.artist,
            hasEnhancement: songs.hasEnhancement,
          }),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!song) {
      return yield* Effect.fail(new DatabaseError({ cause: "No song returned from upsert" }))
    }

    // Link lrclibId if provided
    if (body.lrclibId !== undefined) {
      const lrclibIdValue = body.lrclibId
      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(songLrclibIds)
            .values({
              songId: song.id,
              lrclibId: lrclibIdValue,
              isPrimary: true,
            })
            .onConflictDoNothing(),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      hasEnhancement: song.hasEnhancement,
    }
  })

export async function POST(request: Request) {
  const exit = await Effect.runPromiseExit(upsertSong(request).pipe(Effect.provide(DbLayer)))

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
    }
    console.error("Failed to upsert song:", exit.cause)
    return NextResponse.json({ error: "Failed to upsert song" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

const lookupByLrclibId = (lrclibId: number) =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const [mapping] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            songId: songs.id,
            title: songs.title,
            artist: songs.artist,
            hasEnhancement: songs.hasEnhancement,
          })
          .from(songLrclibIds)
          .innerJoin(songs, eq(songLrclibIds.songId, songs.id))
          .where(eq(songLrclibIds.lrclibId, lrclibId))
          .limit(1),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!mapping) {
      return { found: false as const }
    }

    return {
      found: true as const,
      songId: mapping.songId,
      title: mapping.title,
      artist: mapping.artist,
      hasEnhancement: mapping.hasEnhancement,
    }
  })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lrclibIdParam = searchParams.get("lrclibId")

  if (!lrclibIdParam) {
    return NextResponse.json({ error: "lrclibId is required" }, { status: 400 })
  }

  const lrclibId = Number.parseInt(lrclibIdParam, 10)
  if (Number.isNaN(lrclibId)) {
    return NextResponse.json({ error: "Invalid lrclibId" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(lookupByLrclibId(lrclibId).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    console.error("Failed to lookup song:", exit.cause)
    return NextResponse.json({ error: "Failed to lookup song" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
