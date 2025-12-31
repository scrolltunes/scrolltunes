import { songLrclibIds, songs } from "@/lib/db/schema"
import { selectBestAlbum } from "@/lib/normalize-track"
import { prepareCatalogSong } from "@/lib/song-catalog"
import { DbService } from "@/services/db"
import { and, desc, eq, sql } from "drizzle-orm"
import { Context, Data, Effect, Layer } from "effect"

// ============================================================================
// Types
// ============================================================================

export interface LrclibCandidate {
  readonly lrclibId: number
  readonly albumName: string | null
  readonly duration: number
  readonly score: number
}

export interface UpsertSongWithLrclibIdsInput {
  readonly title: string
  readonly artist: string
  readonly album?: string | null
  readonly durationMs?: number | null
  readonly spotifyId?: string | null
  readonly hasSyncedLyrics?: boolean
  readonly lrclibCandidates: readonly LrclibCandidate[]
}

export interface UpsertSongResult {
  readonly songId: string
  readonly title: string
  readonly artist: string
  readonly primaryLrclibId: number | null
  readonly isNew: boolean
}

export interface CatalogSong {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly album: string
  readonly hasEnhancement: boolean
  readonly hasChordEnhancement: boolean
  readonly bpm: number | null
  readonly musicalKey: string | null
}

// ============================================================================
// Error Type
// ============================================================================

export class CatalogError extends Data.TaggedClass("CatalogError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

// ============================================================================
// Service Interface
// ============================================================================

export interface CatalogServiceShape {
  readonly upsertSongWithLrclibIds: (
    input: UpsertSongWithLrclibIdsInput,
  ) => Effect.Effect<UpsertSongResult, CatalogError, DbService>

  readonly findSongByLrclibId: (
    lrclibId: number,
  ) => Effect.Effect<CatalogSong | null, CatalogError, DbService>

  readonly demoteLrclibId: (lrclibId: number) => Effect.Effect<void, CatalogError, DbService>

  readonly registerLrclibId: (
    songId: string,
    lrclibId: number,
    isPrimary: boolean,
  ) => Effect.Effect<void, CatalogError, DbService>
}

export class CatalogService extends Context.Tag("CatalogService")<
  CatalogService,
  CatalogServiceShape
>() {}

// ============================================================================
// Implementation
// ============================================================================

const makeCatalogService = Effect.gen(function* () {
  const upsertSongWithLrclibIds: CatalogServiceShape["upsertSongWithLrclibIds"] = input =>
    Effect.gen(function* () {
      const { db } = yield* DbService

      // Determine album: use provided or select best from candidates
      let album = input.album
      if (!album && input.lrclibCandidates.length > 0) {
        const candidateAlbums = input.lrclibCandidates
          .map(c => c.albumName)
          .filter((a): a is string => a !== null && a.length > 0)
        if (candidateAlbums.length > 0) {
          album = selectBestAlbum(candidateAlbums)
        }
      }

      // Prepare normalized song data
      const prepared = prepareCatalogSong({
        title: input.title,
        artist: input.artist,
        album,
        durationMs: input.durationMs,
        spotifyId: input.spotifyId,
        hasSyncedLyrics: input.hasSyncedLyrics,
      })

      // Upsert song with ON CONFLICT DO UPDATE
      const [upsertedSong] = yield* Effect.tryPromise({
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
              spotifyId: prepared.spotifyId,
              hasSyncedLyrics: prepared.hasSyncedLyrics,
            })
            .onConflictDoUpdate({
              target: [songs.artistLower, songs.titleLower],
              set: {
                // Only update fields if they provide more info
                album: sql`COALESCE(NULLIF(${songs.album}, ''), excluded.album)`,
                durationMs: sql`COALESCE(${songs.durationMs}, excluded.duration_ms)`,
                albumLower: sql`COALESCE(${songs.albumLower}, excluded.album_lower)`,
                spotifyId: sql`COALESCE(${songs.spotifyId}, excluded.spotify_id)`,
                hasSyncedLyrics: sql`${songs.hasSyncedLyrics} OR excluded.has_synced_lyrics`,
                updatedAt: sql`NOW()`,
              },
            })
            .returning({
              id: songs.id,
              title: songs.title,
              artist: songs.artist,
              createdAt: songs.createdAt,
              updatedAt: songs.updatedAt,
            }),
        catch: e => new CatalogError({ operation: "upsertSongWithLrclibIds:upsertSong", cause: e }),
      })

      if (!upsertedSong) {
        return yield* Effect.fail(
          new CatalogError({
            operation: "upsertSongWithLrclibIds",
            cause: new Error("Failed to upsert song - no result returned"),
          }),
        )
      }

      const isNew =
        upsertedSong.createdAt.getTime() === upsertedSong.updatedAt.getTime() ||
        Date.now() - upsertedSong.createdAt.getTime() < 1000

      // Sort candidates by score (highest first)
      const sortedCandidates = [...input.lrclibCandidates].sort((a, b) => b.score - a.score)

      // Get existing LRCLIB IDs for this song
      const existingLinks = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ lrclibId: songLrclibIds.lrclibId })
            .from(songLrclibIds)
            .where(eq(songLrclibIds.songId, upsertedSong.id)),
        catch: e =>
          new CatalogError({ operation: "upsertSongWithLrclibIds:getExistingLinks", cause: e }),
      })

      const existingLrclibIds = new Set(existingLinks.map(l => l.lrclibId))

      // Filter to only new candidates
      const newCandidates = sortedCandidates.filter(c => !existingLrclibIds.has(c.lrclibId))

      // Insert new LRCLIB IDs with ON CONFLICT DO NOTHING
      if (newCandidates.length > 0) {
        const highestNewScore = newCandidates[0]?.score ?? Number.NEGATIVE_INFINITY

        // Check if we have any existing primary
        const existingPrimary = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ lrclibId: songLrclibIds.lrclibId })
              .from(songLrclibIds)
              .where(
                and(eq(songLrclibIds.songId, upsertedSong.id), eq(songLrclibIds.isPrimary, true)),
              )
              .limit(1),
          catch: e =>
            new CatalogError({ operation: "upsertSongWithLrclibIds:checkPrimary", cause: e }),
        })

        const hasPrimary = existingPrimary.length > 0

        const valuesToInsert = newCandidates.map(c => ({
          songId: upsertedSong.id,
          lrclibId: c.lrclibId,
          // Only mark as primary if no existing primary AND this is highest scoring new candidate
          isPrimary: !hasPrimary && c.score === highestNewScore && c === newCandidates[0],
        }))

        yield* Effect.tryPromise({
          try: () =>
            db.insert(songLrclibIds).values(valuesToInsert).onConflictDoNothing({
              target: songLrclibIds.lrclibId,
            }),
          catch: e =>
            new CatalogError({ operation: "upsertSongWithLrclibIds:insertLrclibIds", cause: e }),
        })
      }

      // Get current primary LRCLIB ID
      const primaryLink = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ lrclibId: songLrclibIds.lrclibId })
            .from(songLrclibIds)
            .where(
              and(eq(songLrclibIds.songId, upsertedSong.id), eq(songLrclibIds.isPrimary, true)),
            )
            .limit(1),
        catch: e => new CatalogError({ operation: "upsertSongWithLrclibIds:getPrimary", cause: e }),
      })

      return {
        songId: upsertedSong.id,
        title: upsertedSong.title,
        artist: upsertedSong.artist,
        primaryLrclibId: primaryLink[0]?.lrclibId ?? null,
        isNew,
      }
    })

  const findSongByLrclibId: CatalogServiceShape["findSongByLrclibId"] = lrclibId =>
    Effect.gen(function* () {
      const { db } = yield* DbService

      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .select({
              id: songs.id,
              title: songs.title,
              artist: songs.artist,
              album: songs.album,
              hasEnhancement: songs.hasEnhancement,
              hasChordEnhancement: songs.hasChordEnhancement,
              bpm: songs.bpm,
              musicalKey: songs.musicalKey,
            })
            .from(songs)
            .innerJoin(songLrclibIds, eq(songLrclibIds.songId, songs.id))
            .where(eq(songLrclibIds.lrclibId, lrclibId))
            .limit(1),
        catch: e => new CatalogError({ operation: "findSongByLrclibId", cause: e }),
      })

      const row = result[0]
      if (!row) {
        return null
      }

      return {
        id: row.id,
        title: row.title,
        artist: row.artist,
        album: row.album,
        hasEnhancement: row.hasEnhancement,
        hasChordEnhancement: row.hasChordEnhancement,
        bpm: row.bpm,
        musicalKey: row.musicalKey,
      }
    })

  const demoteLrclibId: CatalogServiceShape["demoteLrclibId"] = lrclibId =>
    Effect.gen(function* () {
      const { db } = yield* DbService

      // Find the link to demote
      const linkTodemote = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: songLrclibIds.id, songId: songLrclibIds.songId })
            .from(songLrclibIds)
            .where(eq(songLrclibIds.lrclibId, lrclibId))
            .limit(1),
        catch: e => new CatalogError({ operation: "demoteLrclibId:findLink", cause: e }),
      })

      const link = linkTodemote[0]
      if (!link) {
        return
      }

      // Demote this LRCLIB ID
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(songLrclibIds)
            .set({ isPrimary: false })
            .where(eq(songLrclibIds.lrclibId, lrclibId)),
        catch: e => new CatalogError({ operation: "demoteLrclibId:demote", cause: e }),
      })

      // Promote next best (oldest remaining link for this song that isn't this one)
      const nextBest = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: songLrclibIds.id })
            .from(songLrclibIds)
            .where(
              and(
                eq(songLrclibIds.songId, link.songId),
                sql`${songLrclibIds.lrclibId} != ${lrclibId}`,
              ),
            )
            .orderBy(desc(songLrclibIds.createdAt))
            .limit(1),
        catch: e => new CatalogError({ operation: "demoteLrclibId:findNextBest", cause: e }),
      })

      const next = nextBest[0]
      if (next) {
        yield* Effect.tryPromise({
          try: () =>
            db.update(songLrclibIds).set({ isPrimary: true }).where(eq(songLrclibIds.id, next.id)),
          catch: e => new CatalogError({ operation: "demoteLrclibId:promote", cause: e }),
        })
      }
    })

  const registerLrclibId: CatalogServiceShape["registerLrclibId"] = (songId, lrclibId, isPrimary) =>
    Effect.gen(function* () {
      const { db } = yield* DbService

      // If setting as primary, demote existing primary first
      if (isPrimary) {
        yield* Effect.tryPromise({
          try: () =>
            db
              .update(songLrclibIds)
              .set({ isPrimary: false })
              .where(and(eq(songLrclibIds.songId, songId), eq(songLrclibIds.isPrimary, true))),
          catch: e => new CatalogError({ operation: "registerLrclibId:demoteExisting", cause: e }),
        })
      }

      // Insert the new link
      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(songLrclibIds)
            .values({
              songId,
              lrclibId,
              isPrimary,
            })
            .onConflictDoNothing({
              target: songLrclibIds.lrclibId,
            }),
        catch: e => new CatalogError({ operation: "registerLrclibId:insert", cause: e }),
      })
    })

  return {
    upsertSongWithLrclibIds,
    findSongByLrclibId,
    demoteLrclibId,
    registerLrclibId,
  }
})

// ============================================================================
// Layer
// ============================================================================

export const CatalogServiceLive = Layer.effect(CatalogService, makeCatalogService)
