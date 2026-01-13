import { auth } from "@/auth"
import { appUserProfiles, songLrclibIds, songs, userSongItems } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services"
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

// ============================================================================
// Types
// ============================================================================

interface CatalogTrack {
  id: string
  lrclibId: number | null
  title: string
  artist: string
  album: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  spotifyId: string | null
  albumArtUrl: string | null
  totalPlayCount: number
  uniqueUsers: number
  lastPlayedAt: string | null
}

interface CatalogResponse {
  tracks: CatalogTrack[]
  total: number
  offset: number
  hasMore: boolean
}

type CatalogFilter = "all" | "missing_bpm" | "missing_enhancement" | "missing_spotify"
type CatalogSort = "plays" | "recent" | "alpha"

// ============================================================================
// Constants
// ============================================================================

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50
const DEFAULT_OFFSET = 0

// ============================================================================
// Helpers
// ============================================================================

function parseFilter(value: string | null): CatalogFilter {
  if (value === "missing_bpm" || value === "missing_enhancement" || value === "missing_spotify") {
    return value
  }
  return "all"
}

function parseSort(value: string | null): CatalogSort {
  if (value === "recent" || value === "alpha") {
    return value
  }
  return "plays"
}

function parseNumber(value: string | null, defaultValue: number, max?: number): number {
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) return defaultValue
  if (max !== undefined && parsed > max) return max
  return parsed
}

// ============================================================================
// Main Effect
// ============================================================================

const getCatalog = (params: {
  filter: CatalogFilter
  sort: CatalogSort
  limit: number
  offset: number
}) =>
  Effect.gen(function* () {
    // Auth check
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    // Check admin permission
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

    // Build WHERE conditions based on filter
    const whereConditions = []
    if (params.filter === "missing_bpm") {
      whereConditions.push(isNull(songs.bpm))
    } else if (params.filter === "missing_enhancement") {
      whereConditions.push(eq(songs.hasEnhancement, false))
    } else if (params.filter === "missing_spotify") {
      whereConditions.push(isNull(songs.spotifyId))
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

    // Get total count
    const [countResult] = yield* Effect.tryPromise({
      try: () => db.select({ total: count() }).from(songs).where(whereClause),
      catch: cause => new DatabaseError({ cause }),
    })

    const total = countResult?.total ?? 0

    // Build ORDER BY clause based on sort
    const orderByClause =
      params.sort === "recent"
        ? desc(songs.updatedAt)
        : params.sort === "alpha"
          ? asc(songs.artist)
          : desc(sql`COALESCE(${songs.totalPlayCount}, 0)`)

    // Main query with subqueries for usage metrics
    const tracks = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: songs.id,
            title: songs.title,
            artist: songs.artist,
            album: songs.album,
            bpm: songs.bpm,
            musicalKey: songs.musicalKey,
            bpmSource: songs.bpmSource,
            hasEnhancement: songs.hasEnhancement,
            hasChordEnhancement: songs.hasChordEnhancement,
            spotifyId: songs.spotifyId,
            albumArtUrl: songs.albumArtUrl,
            totalPlayCount: songs.totalPlayCount,
            lrclibId: songLrclibIds.lrclibId,
            uniqueUsers: sql<number>`(
              SELECT COUNT(DISTINCT ${userSongItems.userId})
              FROM ${userSongItems}
              WHERE ${userSongItems.catalogSongId} = ${songs.id}
            )`.as("unique_users"),
            lastPlayedAt: sql<string | null>`(
              SELECT MAX(${userSongItems.lastPlayedAt})
              FROM ${userSongItems}
              WHERE ${userSongItems.catalogSongId} = ${songs.id}
            )`.as("last_played_at"),
          })
          .from(songs)
          .leftJoin(songLrclibIds, eq(songs.id, songLrclibIds.songId))
          .where(whereClause)
          .orderBy(orderByClause)
          .limit(params.limit)
          .offset(params.offset),
      catch: cause => new DatabaseError({ cause }),
    })

    // Map to response format
    const catalogTracks: CatalogTrack[] = tracks.map(track => ({
      id: track.id,
      lrclibId: track.lrclibId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      bpm: track.bpm,
      musicalKey: track.musicalKey,
      bpmSource: track.bpmSource,
      hasEnhancement: track.hasEnhancement,
      hasChordEnhancement: track.hasChordEnhancement,
      spotifyId: track.spotifyId,
      albumArtUrl: track.albumArtUrl,
      totalPlayCount: track.totalPlayCount,
      uniqueUsers: Number(track.uniqueUsers) || 0,
      lastPlayedAt: track.lastPlayedAt,
    }))

    return {
      tracks: catalogTracks,
      total,
      offset: params.offset,
      hasMore: params.offset + tracks.length < total,
    } satisfies CatalogResponse
  })

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const filter = parseFilter(searchParams.get("filter"))
  const sort = parseSort(searchParams.get("sort"))
  const limit = parseNumber(searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
  const offset = parseNumber(searchParams.get("offset"), DEFAULT_OFFSET)

  const exit = await Effect.runPromiseExit(
    getCatalog({ filter, sort, limit, offset }).pipe(Effect.provide(DbLayer)),
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
    console.error("[Catalog] Failed:", exit.cause)
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 })
  }

  return NextResponse.json(exit.value, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  })
}
