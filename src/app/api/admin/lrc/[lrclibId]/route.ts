import { auth } from "@/auth"
import { appUserProfiles } from "@/lib/db/schema"
import type { LRCLibResponse } from "@/lib/lyrics-client"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

class ForbiddenError extends Data.TaggedClass("ForbiddenError")<object> {}

class FetchError extends Data.TaggedClass("FetchError")<{
  readonly status: number
  readonly message: string
}> {}

const LRCLIB_BASE_URL = "https://lrclib.net/api"
const LRCLIB_HEADERS = { "User-Agent": "ScrollTunes/1.0 (https://scrolltunes.com)" }

const fetchLrclib = async (url: string): Promise<Response> => {
  return fetch(url, { headers: LRCLIB_HEADERS })
}

const isValidSyncedLyrics = (syncedLyrics: string | null): boolean => {
  if (!syncedLyrics) return false
  // Valid LRC should start with timestamp like [00:
  return syncedLyrics.trim().startsWith("[")
}

const getRawLrc = (lrclibId: number) =>
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
      catch: cause => new AuthError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    // Fetch from LRCLIB
    const response = yield* Effect.tryPromise({
      try: () => fetchLrclib(`${LRCLIB_BASE_URL}/get/${lrclibId}`),
      catch: () => new FetchError({ status: 502, message: "Failed to reach LRCLIB" }),
    })

    if (!response.ok) {
      return yield* Effect.fail(
        new FetchError({ status: response.status, message: "LRCLIB request failed" }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LRCLibResponse>,
      catch: () => new FetchError({ status: 502, message: "Invalid response from LRCLIB" }),
    })

    // Check if syncedLyrics looks valid
    if (isValidSyncedLyrics(data.syncedLyrics)) {
      return {
        id: data.id,
        title: data.trackName,
        artist: data.artistName,
        album: data.albumName ?? null,
        duration: data.duration,
        syncedLyrics: data.syncedLyrics,
        alternativeId: null,
      }
    }

    // Try to find alternative lyrics via search
    const searchParams = new URLSearchParams({
      track_name: data.trackName,
      artist_name: data.artistName,
    })

    const searchResponse = yield* Effect.tryPromise({
      try: () => fetchLrclib(`${LRCLIB_BASE_URL}/search?${searchParams.toString()}`),
      catch: () => new FetchError({ status: 502, message: "Failed to search LRCLIB" }),
    })

    if (!searchResponse.ok) {
      return yield* Effect.fail(
        new FetchError({ status: 404, message: "No valid synced lyrics available" }),
      )
    }

    const searchResults = yield* Effect.tryPromise({
      try: () => searchResponse.json() as Promise<LRCLibResponse[]>,
      catch: () => new FetchError({ status: 502, message: "Invalid search response" }),
    })

    // Find best alternative (exclude original ID, must have valid synced lyrics)
    const alternative = searchResults.find(
      r => r.id !== lrclibId && isValidSyncedLyrics(r.syncedLyrics),
    )

    if (!alternative?.syncedLyrics) {
      return yield* Effect.fail(
        new FetchError({ status: 404, message: "No valid synced lyrics available" }),
      )
    }

    return {
      id: alternative.id,
      title: alternative.trackName,
      artist: alternative.artistName,
      album: alternative.albumName ?? null,
      duration: alternative.duration,
      syncedLyrics: alternative.syncedLyrics,
      alternativeId: alternative.id,
    }
  })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lrclibId: string }> },
) {
  const { lrclibId: lrclibIdParam } = await params
  const lrclibId = Number.parseInt(lrclibIdParam, 10)

  if (Number.isNaN(lrclibId)) {
    return NextResponse.json({ error: "Invalid lrclibId" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(getRawLrc(lrclibId).pipe(Effect.provide(DbLayer)))

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
      if (error._tag === "FetchError") {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
    }
    console.error("Failed to fetch LRC:", exit.cause)
    return NextResponse.json({ error: "Failed to fetch LRC" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
