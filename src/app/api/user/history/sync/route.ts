import { auth } from "@/auth"
import { normalizeSongInput } from "@/lib/db/normalize"
import { songLrclibIds, songs, userSongItems } from "@/lib/db/schema"
import { prepareCatalogSong } from "@/lib/song-catalog"
import { DbLayer, DbService } from "@/services/db"
import { and, desc, eq, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

interface SyncSongInput {
  songId: string
  songProvider: string
  title: string
  artist: string
  album?: string
  durationMs?: number
  lastPlayedAt: string
  playCount?: number
}

interface SyncRequestBody {
  songs: SyncSongInput[]
}

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class InvalidRequestError extends Data.TaggedClass("InvalidRequestError")<{
  readonly cause?: unknown
}> {}

class SyncError extends Data.TaggedClass("SyncError")<{
  readonly cause: unknown
}> {}

class FetchHistoryError extends Data.TaggedClass("FetchHistoryError")<{
  readonly cause: unknown
}> {}

const syncHistory = (request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const userId = session.user.id
    const body = (yield* Effect.tryPromise({
      try: () => request.json() as Promise<SyncRequestBody>,
      catch: cause => new InvalidRequestError({ cause }),
    })) as SyncRequestBody

    if (!Array.isArray(body.songs)) {
      return yield* Effect.fail(new InvalidRequestError({}))
    }

    const { db } = yield* DbService
    const now = new Date()

    for (const song of body.songs) {
      const lastPlayedAt = new Date(song.lastPlayedAt)
      const playCount = song.playCount ?? 1

      // Parse lrclib ID from songId if provider is lrclib
      const lrclibId =
        song.songProvider === "lrclib"
          ? Number.parseInt(song.songId.replace("lrclib:", ""), 10)
          : null

      // Upsert into global songs catalog
      if (lrclibId && !Number.isNaN(lrclibId)) {
        const prepared = prepareCatalogSong({
          title: song.title,
          artist: song.artist,
          album: song.album,
          durationMs: song.durationMs,
          lrclibId,
          hasSyncedLyrics: true,
        })

        // First, check if song already exists
        const [existingSong] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ id: songs.id })
              .from(songs)
              .where(
                and(
                  eq(songs.artistLower, prepared.artistLower),
                  eq(songs.titleLower, prepared.titleLower),
                ),
              ),
          catch: cause => new SyncError({ cause }),
        })

        let catalogSongId: string

        if (existingSong) {
          // Song exists - don't increment play count, just use existing ID
          catalogSongId = existingSong.id
        } else {
          // Song doesn't exist - insert with initial play count
          const [newSong] = yield* Effect.tryPromise({
            try: () =>
              db
                .insert(songs)
                .values({
                  title: prepared.title,
                  artist: prepared.artist,
                  album: prepared.album ?? "",
                  durationMs: prepared.durationMs,
                  artistLower: prepared.artistLower,
                  titleLower: prepared.titleLower,
                  albumLower: prepared.albumLower,
                  hasSyncedLyrics: prepared.hasSyncedLyrics,
                  totalPlayCount: playCount,
                })
                .onConflictDoNothing()
                .returning({ id: songs.id }),
            catch: cause => new SyncError({ cause }),
          })

          if (!newSong) continue // Race condition - song was inserted by another request
          catalogSongId = newSong.id
        }

        // Link lrclibId to the song
        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(songLrclibIds)
              .values({
                songId: catalogSongId,
                lrclibId,
                isPrimary: true,
              })
              .onConflictDoNothing(),
          catch: cause => new SyncError({ cause }),
        })
      }

      // Sync to user history
      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(userSongItems)
            .values(
              normalizeSongInput({
                userId,
                songId: song.songId,
                songProvider: song.songProvider,
                songTitle: song.title,
                songArtist: song.artist,
                songAlbum: song.album ?? "",
                songDurationMs: song.durationMs,
                inHistory: true,
                firstPlayedAt: lastPlayedAt,
                lastPlayedAt,
                playCount,
                createdAt: now,
                updatedAt: now,
              }),
            )
            .onConflictDoUpdate({
              target: [userSongItems.userId, userSongItems.songProvider, userSongItems.songId],
              set: {
                inHistory: true,
                lastPlayedAt: sql`GREATEST(${userSongItems.lastPlayedAt}, ${lastPlayedAt})`,
                playCount: sql`${userSongItems.playCount} + ${playCount}`,
                updatedAt: now,
              },
            }),
        catch: cause => new SyncError({ cause }),
      })
    }

    const history = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            songId: userSongItems.songId,
            songProvider: userSongItems.songProvider,
            title: userSongItems.songTitle,
            artist: userSongItems.songArtist,
            lastPlayedAt: userSongItems.lastPlayedAt,
            playCount: userSongItems.playCount,
          })
          .from(userSongItems)
          .where(
            and(
              eq(userSongItems.userId, userId),
              eq(userSongItems.inHistory, true),
              eq(userSongItems.deleted, false),
            ),
          )
          .orderBy(desc(userSongItems.lastPlayedAt)),
      catch: cause => new FetchHistoryError({ cause }),
    })

    return history.map(item => ({
      songId: item.songId,
      songProvider: item.songProvider,
      title: item.title,
      artist: item.artist,
      lastPlayedAt: item.lastPlayedAt?.toISOString() ?? null,
      playCount: item.playCount,
    }))
  })

export async function POST(request: Request) {
  const exit = await Effect.runPromiseExit(syncHistory(request).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "InvalidRequestError") {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
      }
    }
    console.error("Failed to sync history", exit.cause)
    return NextResponse.json({ error: "Failed to sync history" }, { status: 500 })
  }

  return NextResponse.json({ history: exit.value })
}
