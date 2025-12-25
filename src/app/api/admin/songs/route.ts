import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import { DbLayer, DbService } from "@/services/db"
import { and, count, eq, ilike, or, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class ForbiddenError extends Data.TaggedClass("ForbiddenError")<object> {}

class QueryError extends Data.TaggedClass("QueryError")<{
  readonly cause: unknown
}> {}

type Filter = "all" | "synced" | "enhanced" | "unenhanced"

interface QueryParams {
  search: string | undefined
  filter: Filter
  limit: number
  offset: number
}

const parseQueryParams = (url: URL): QueryParams => {
  const search = url.searchParams.get("search") || undefined
  const filterParam = url.searchParams.get("filter") || "all"
  const filter: Filter =
    filterParam === "synced" || filterParam === "enhanced" || filterParam === "unenhanced"
      ? filterParam
      : "all"
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100)
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0)

  return { search, filter, limit, offset }
}

const getSongs = (request: Request) =>
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
      catch: cause => new QueryError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    const url = new URL(request.url)
    const { search, filter, limit, offset } = parseQueryParams(url)

    const conditions = []

    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`
      conditions.push(
        or(ilike(songs.artistLower, searchPattern), ilike(songs.titleLower, searchPattern)),
      )
    }

    if (filter === "synced") {
      conditions.push(eq(songs.hasSyncedLyrics, true))
    } else if (filter === "enhanced") {
      conditions.push(eq(songs.hasEnhancement, true))
    } else if (filter === "unenhanced") {
      conditions.push(and(eq(songs.hasSyncedLyrics, true), eq(songs.hasEnhancement, false)))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [songRows, [countResult]] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          db
            .select({
              id: songs.id,
              title: songs.title,
              artist: songs.artist,
              album: songs.album,
              durationMs: songs.durationMs,
              spotifyId: songs.spotifyId,
              hasSyncedLyrics: songs.hasSyncedLyrics,
              hasEnhancement: songs.hasEnhancement,
              hasChordEnhancement: songs.hasChordEnhancement,
              totalPlayCount: songs.totalPlayCount,
              createdAt: songs.createdAt,
              updatedAt: songs.updatedAt,
              lrclibId: songLrclibIds.lrclibId,
            })
            .from(songs)
            .leftJoin(songLrclibIds, eq(songs.id, songLrclibIds.songId))
            .where(whereClause)
            .orderBy(sql`${songs.totalPlayCount} DESC, ${songs.createdAt} DESC`)
            .limit(limit)
            .offset(offset),
          db.select({ count: count() }).from(songs).where(whereClause),
        ]),
      catch: cause => new QueryError({ cause }),
    })

    return {
      songs: songRows.map(song => ({
        ...song,
        lrclibId: song.lrclibId ?? null,
        createdAt: song.createdAt.toISOString(),
        updatedAt: song.updatedAt.toISOString(),
      })),
      total: countResult?.count ?? 0,
      limit,
      offset,
    }
  })

export async function GET(request: Request) {
  const exit = await Effect.runPromiseExit(getSongs(request).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to fetch songs", exit.cause)
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

const deleteSong = (songId: string) =>
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
      catch: cause => new QueryError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    // Delete the song (cascades to related tables via FK)
    yield* Effect.tryPromise({
      try: () => db.delete(songs).where(eq(songs.id, songId)),
      catch: cause => new QueryError({ cause }),
    })

    return { success: true }
  })

const deleteAllSongs = (params: QueryParams) =>
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
      catch: cause => new QueryError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    // Build conditions based on filter
    const conditions = []

    if (params.search) {
      const searchPattern = `%${params.search.toLowerCase()}%`
      conditions.push(
        or(ilike(songs.artistLower, searchPattern), ilike(songs.titleLower, searchPattern)),
      )
    }

    if (params.filter === "synced") {
      conditions.push(eq(songs.hasSyncedLyrics, true))
    } else if (params.filter === "enhanced") {
      conditions.push(eq(songs.hasEnhancement, true))
    } else if (params.filter === "unenhanced") {
      conditions.push(and(eq(songs.hasSyncedLyrics, true), eq(songs.hasEnhancement, false)))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Delete all matching songs
    const result = yield* Effect.tryPromise({
      try: () => db.delete(songs).where(whereClause),
      catch: cause => new QueryError({ cause }),
    })

    return { success: true, deleted: result.rowCount ?? 0 }
  })

export async function DELETE(request: Request) {
  const body = await request.json()
  const songId = body?.songId as string | undefined
  const deleteAll = body?.deleteAll as boolean | undefined
  const search = body?.search as string | undefined
  const filter = (body?.filter as Filter) ?? "all"

  // Bulk delete
  if (deleteAll) {
    const params: QueryParams = { search, filter, limit: 0, offset: 0 }
    const exit = await Effect.runPromiseExit(deleteAllSongs(params).pipe(Effect.provide(DbLayer)))

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
      console.error("Failed to delete songs", exit.cause)
      return NextResponse.json({ error: "Failed to delete songs" }, { status: 500 })
    }

    return NextResponse.json(exit.value)
  }

  // Single delete
  if (!songId) {
    return NextResponse.json({ error: "songId is required" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(deleteSong(songId).pipe(Effect.provide(DbLayer)))

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
    console.error("Failed to delete song", exit.cause)
    return NextResponse.json({ error: "Failed to delete song" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
