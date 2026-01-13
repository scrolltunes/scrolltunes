import { auth } from "@/auth"
import type * as schema from "@/lib/db/schema"
import { appUserProfiles, songLrclibIds, songs } from "@/lib/db/schema"
import { AuthError, DatabaseError, ForbiddenError, UnauthorizedError } from "@/lib/errors"
import { DbService } from "@/services/db"
import { ServerLayer } from "@/services/server-layer"
import {
  type TursoFilter,
  type TursoSearchResult,
  TursoService,
  type TursoSort,
} from "@/services/turso"
import { eq, inArray, isNotNull } from "drizzle-orm"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import { Effect } from "effect"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// ============================================================================
// Response Types
// ============================================================================

interface TrackWithEnrichment {
  // Turso fields
  lrclibId: number
  title: string
  artist: string
  album: string | null
  durationSec: number
  quality: number

  // Turso Spotify enrichment
  spotifyId: string | null
  popularity: number | null
  tempo: number | null
  musicalKey: number | null
  mode: number | null
  timeSignature: number | null
  isrc: string | null
  albumImageUrl: string | null

  // Neon enrichment (if in catalog)
  inCatalog: boolean
  neonSongId: string | null
  neonBpm: number | null
  neonMusicalKey: string | null
  neonBpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number | null
}

interface TracksResponse {
  tracks: TrackWithEnrichment[]
  total: number
  offset: number
  hasMore: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseFilter(value: string | null): TursoFilter {
  const valid: TursoFilter[] = ["all", "missing_spotify", "has_spotify"]
  return valid.includes(value as TursoFilter) ? (value as TursoFilter) : "all"
}

function parseSort(value: string | null): TursoSort {
  const valid: TursoSort[] = ["popular", "alpha"]
  return valid.includes(value as TursoSort) ? (value as TursoSort) : "popular"
}

type ExtendedFilter = TursoFilter | "in_catalog" | "missing_bpm"

function parseExtendedFilter(value: string | null): ExtendedFilter {
  const valid: ExtendedFilter[] = [
    "all",
    "missing_spotify",
    "has_spotify",
    "in_catalog",
    "missing_bpm",
  ]
  return valid.includes(value as ExtendedFilter) ? (value as ExtendedFilter) : "all"
}

function mapTursoToTrack(
  t: TursoSearchResult,
): Omit<
  TrackWithEnrichment,
  | "inCatalog"
  | "neonSongId"
  | "neonBpm"
  | "neonMusicalKey"
  | "neonBpmSource"
  | "hasEnhancement"
  | "hasChordEnhancement"
  | "totalPlayCount"
> {
  return {
    lrclibId: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    durationSec: t.durationSec,
    quality: t.quality,
    spotifyId: t.spotifyId,
    popularity: t.popularity,
    tempo: t.tempo,
    musicalKey: t.musicalKey,
    mode: t.mode,
    timeSignature: t.timeSignature,
    isrc: t.isrc,
    albumImageUrl: t.albumImageUrl,
  }
}

// ============================================================================
// Main Effect
// ============================================================================

const getTracks = (searchParams: URLSearchParams) =>
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

    // Parse query params
    const query = searchParams.get("q") ?? undefined
    const extendedFilter = parseExtendedFilter(searchParams.get("filter"))
    const sort = parseSort(searchParams.get("sort"))
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10))
    const limit = Math.min(Math.max(1, Number.parseInt(searchParams.get("limit") ?? "50", 10)), 100)

    const turso = yield* TursoService

    // Handle special filters that require Neon data
    if (extendedFilter === "in_catalog" || extendedFilter === "missing_bpm") {
      // Get lrclib IDs from Neon that are in catalog
      const catalogMappings = yield* Effect.tryPromise({
        try: () =>
          db
            .select({
              lrclibId: songLrclibIds.lrclibId,
              songId: songLrclibIds.songId,
            })
            .from(songLrclibIds),
        catch: cause => new DatabaseError({ cause }),
      })

      if (extendedFilter === "in_catalog") {
        // Filter Turso tracks to only those in catalog
        const lrclibIdsInCatalog = catalogMappings.map(m => m.lrclibId)

        if (lrclibIdsInCatalog.length === 0) {
          return {
            tracks: [],
            total: 0,
            offset,
            hasMore: false,
          } satisfies TracksResponse
        }

        // Query Turso with the catalog lrclib IDs
        const tursoResult = yield* turso.searchWithFilters({
          query,
          filter: "all", // Don't apply Turso filter since we're filtering by IDs
          sort,
          offset,
          limit,
          lrclibIds: lrclibIdsInCatalog,
        })

        // Get Neon enrichment for these tracks
        const neonEnrichment = yield* getNeonEnrichment(
          db,
          tursoResult.tracks.map(t => t.id),
        )

        const tracks = tursoResult.tracks.map(t => {
          const neon = neonEnrichment.get(t.id)
          return {
            ...mapTursoToTrack(t),
            inCatalog: neon !== undefined,
            neonSongId: neon?.songId ?? null,
            neonBpm: neon?.bpm ?? null,
            neonMusicalKey: neon?.musicalKey ?? null,
            neonBpmSource: neon?.bpmSource ?? null,
            hasEnhancement: neon?.hasEnhancement ?? false,
            hasChordEnhancement: neon?.hasChordEnhancement ?? false,
            totalPlayCount: neon?.totalPlayCount ?? null,
          }
        })

        return {
          tracks,
          total: tursoResult.total,
          offset,
          hasMore: offset + tracks.length < tursoResult.total,
        } satisfies TracksResponse
      }

      // missing_bpm filter: songs with no tempo in Turso AND no BPM in Neon
      // First get all songs from Neon that have BPM
      const songsWithBpm = yield* Effect.tryPromise({
        try: () => db.select({ id: songs.id }).from(songs).where(isNotNull(songs.bpm)),
        catch: cause => new DatabaseError({ cause }),
      })

      const songIdsWithBpm = new Set(songsWithBpm.map(s => s.id))

      // Get lrclib IDs that have BPM in Neon
      const lrclibIdsWithNeonBpm = catalogMappings
        .filter(m => songIdsWithBpm.has(m.songId))
        .map(m => m.lrclibId)

      // Query Turso for tracks missing Spotify tempo
      const tursoResult = yield* turso.searchWithFilters({
        query,
        filter: "all",
        sort,
        offset: 0,
        limit: 10000, // Get all to filter
      })

      // Filter to tracks that:
      // 1. Have no tempo in Turso
      // 2. Are not in the list of lrclib IDs with Neon BPM
      const lrclibIdsWithNeonBpmSet = new Set(lrclibIdsWithNeonBpm)
      const filteredTracks = tursoResult.tracks.filter(
        t => t.tempo === null && !lrclibIdsWithNeonBpmSet.has(t.id),
      )

      const paginatedTracks = filteredTracks.slice(offset, offset + limit)

      // Get Neon enrichment
      const neonEnrichment = yield* getNeonEnrichment(
        db,
        paginatedTracks.map(t => t.id),
      )

      const tracks = paginatedTracks.map(t => {
        const neon = neonEnrichment.get(t.id)
        return {
          ...mapTursoToTrack(t),
          inCatalog: neon !== undefined,
          neonSongId: neon?.songId ?? null,
          neonBpm: neon?.bpm ?? null,
          neonMusicalKey: neon?.musicalKey ?? null,
          neonBpmSource: neon?.bpmSource ?? null,
          hasEnhancement: neon?.hasEnhancement ?? false,
          hasChordEnhancement: neon?.hasChordEnhancement ?? false,
          totalPlayCount: neon?.totalPlayCount ?? null,
        }
      })

      return {
        tracks,
        total: filteredTracks.length,
        offset,
        hasMore: offset + tracks.length < filteredTracks.length,
      } satisfies TracksResponse
    }

    // Standard Turso-only filters (all, missing_spotify, has_spotify)
    const tursoFilter = parseFilter(searchParams.get("filter"))
    const tursoResult = yield* turso.searchWithFilters({
      query,
      filter: tursoFilter,
      sort,
      offset,
      limit,
    })

    // Get Neon enrichment for these tracks
    const neonEnrichment = yield* getNeonEnrichment(
      db,
      tursoResult.tracks.map(t => t.id),
    )

    const tracks = tursoResult.tracks.map(t => {
      const neon = neonEnrichment.get(t.id)
      return {
        ...mapTursoToTrack(t),
        inCatalog: neon !== undefined,
        neonSongId: neon?.songId ?? null,
        neonBpm: neon?.bpm ?? null,
        neonMusicalKey: neon?.musicalKey ?? null,
        neonBpmSource: neon?.bpmSource ?? null,
        hasEnhancement: neon?.hasEnhancement ?? false,
        hasChordEnhancement: neon?.hasChordEnhancement ?? false,
        totalPlayCount: neon?.totalPlayCount ?? null,
      }
    })

    return {
      tracks,
      total: tursoResult.total,
      offset,
      hasMore: offset + tracks.length < tursoResult.total,
    } satisfies TracksResponse
  })

// ============================================================================
// Neon Enrichment Helper
// ============================================================================

interface NeonEnrichmentData {
  songId: string
  bpm: number | null
  musicalKey: string | null
  bpmSource: string | null
  hasEnhancement: boolean
  hasChordEnhancement: boolean
  totalPlayCount: number
}

function getNeonEnrichment(db: NeonHttpDatabase<typeof schema>, lrclibIds: readonly number[]) {
  return Effect.gen(function* () {
    if (lrclibIds.length === 0) {
      return new Map<number, NeonEnrichmentData>()
    }

    // Get song mappings
    const mappings = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            lrclibId: songLrclibIds.lrclibId,
            songId: songLrclibIds.songId,
          })
          .from(songLrclibIds)
          .where(inArray(songLrclibIds.lrclibId, [...lrclibIds])),
      catch: cause => new DatabaseError({ cause }),
    })

    if (mappings.length === 0) {
      return new Map<number, NeonEnrichmentData>()
    }

    const songIds = mappings.map(m => m.songId)

    // Get song data
    const songsData = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: songs.id,
            bpm: songs.bpm,
            musicalKey: songs.musicalKey,
            bpmSource: songs.bpmSource,
            hasEnhancement: songs.hasEnhancement,
            hasChordEnhancement: songs.hasChordEnhancement,
            totalPlayCount: songs.totalPlayCount,
          })
          .from(songs)
          .where(inArray(songs.id, songIds)),
      catch: cause => new DatabaseError({ cause }),
    })

    // Create lookup maps
    const songIdToLrclibId = new Map(mappings.map(m => [m.songId, m.lrclibId]))
    const result = new Map<number, NeonEnrichmentData>()

    for (const song of songsData) {
      const lrclibId = songIdToLrclibId.get(song.id)
      if (lrclibId !== undefined) {
        result.set(lrclibId, {
          songId: song.id,
          bpm: song.bpm,
          musicalKey: song.musicalKey,
          bpmSource: song.bpmSource,
          hasEnhancement: song.hasEnhancement,
          hasChordEnhancement: song.hasChordEnhancement,
          totalPlayCount: song.totalPlayCount,
        })
      }
    }

    return result
  })
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const exit = await Effect.runPromiseExit(
    getTracks(searchParams).pipe(Effect.provide(ServerLayer)),
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
      if (error._tag === "TursoSearchError") {
        console.error("[Tracks] Turso error:", error.message, error.cause)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
      }
    }
    console.error("[Tracks] Failed to fetch tracks", exit.cause)
    return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
