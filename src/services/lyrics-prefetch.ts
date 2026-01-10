"use client"

/**
 * Lyrics Prefetch Service
 *
 * Background prefetching of lyrics with enhancement application.
 * Uses Effect.ts for composable async operations with proper DI.
 */

import type { Lyrics } from "@/core"
import type { EnhancementPayload } from "@/lib/db/schema"
import { applyEnhancement } from "@/lib/enhancement"
import type { LyricsApiSuccessResponse } from "@/lib/lyrics-api-types"
import { LYRICS_CACHE_VERSION, LYRICS_KEY_PREFIX } from "@/lib/lyrics-cache"
import type { CachedLyrics, RecentSong } from "@/lib/recent-songs-types"
import { LYRICS_CACHE_TTL_MS } from "@/lib/recent-songs-types"
import type { TopCatalogSong } from "@/lib/sync-service"
import { Context, Data, Effect, Layer } from "effect"
import { FetchService } from "./fetch"
import { StorageService } from "./storage"

export class PrefetchError extends Data.TaggedClass("PrefetchError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class LyricsPrefetchService extends Context.Tag("LyricsPrefetchService")<
  LyricsPrefetchService,
  {
    readonly prefetchLyrics: (
      id: number,
    ) => Effect.Effect<PrefetchedLyricsData | null, PrefetchError, FetchService>
    readonly prefetchMultiple: (
      ids: readonly number[],
    ) => Effect.Effect<readonly PrefetchedLyricsData[], never, FetchService | StorageService>
    readonly prefetchTopSongs: (
      limit?: number,
    ) => Effect.Effect<readonly PrefetchedLyricsData[], never, FetchService | StorageService>
    readonly isCached: (id: number) => Effect.Effect<boolean, never, StorageService>
    readonly cacheLyrics: (
      id: number,
      data: PrefetchedLyricsData,
    ) => Effect.Effect<void, never, StorageService>
  }
>() {}

export interface PrefetchedLyricsData {
  readonly id: number
  readonly lyrics: Lyrics
  readonly albumArt: string | undefined
  readonly bpm: number | null
  readonly key: string | null
  readonly spotifyId: string | undefined
  readonly hasEnhancement: boolean
  readonly enhancement: EnhancementPayload | null | undefined
  readonly hasChordEnhancement: boolean
  readonly chordEnhancement: CachedLyrics["chordEnhancement"]
  readonly bpmSource: CachedLyrics["bpmSource"]
  readonly lyricsSource: CachedLyrics["lyricsSource"]
}

const lyricsKey = (id: number): string => `${LYRICS_KEY_PREFIX}${id}`

const isCachedImpl = (id: number): Effect.Effect<boolean, never, StorageService> =>
  Effect.gen(function* () {
    const storage = yield* StorageService
    const raw = yield* storage
      .getItem(lyricsKey(id))
      .pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (!raw) return false

    try {
      const parsed = JSON.parse(raw) as CachedLyrics
      const now = Date.now()

      if (parsed.version !== LYRICS_CACHE_VERSION) return false
      if (now - parsed.cachedAt > LYRICS_CACHE_TTL_MS) return false
      if (!parsed.lyrics?.lines || parsed.lyrics.lines.length === 0) return false

      return true
    } catch {
      return false
    }
  })

const cacheLyricsImpl = (
  id: number,
  data: PrefetchedLyricsData,
): Effect.Effect<void, never, StorageService> =>
  Effect.gen(function* () {
    const storage = yield* StorageService

    const cached: CachedLyrics = {
      version: LYRICS_CACHE_VERSION,
      lyrics: data.lyrics,
      bpm: data.bpm,
      key: data.key,
      albumArt: data.albumArt,
      spotifyId: data.spotifyId,
      bpmSource: data.bpmSource,
      lyricsSource: data.lyricsSource,
      hasEnhancement: data.hasEnhancement || undefined,
      enhancement: data.enhancement,
      hasChordEnhancement: data.hasChordEnhancement || undefined,
      chordEnhancement: data.chordEnhancement,
      cachedAt: Date.now(),
    }

    yield* storage
      .setItem(lyricsKey(id), JSON.stringify(cached))
      .pipe(Effect.catchAll(() => Effect.void))
  })

const prefetchLyricsImpl = (
  id: number,
): Effect.Effect<PrefetchedLyricsData | null, PrefetchError, FetchService> =>
  Effect.gen(function* () {
    const fetchSvc = yield* FetchService

    const response = yield* fetchSvc
      .fetch(`/api/lyrics/${id}`)
      .pipe(
        Effect.mapError(
          e => new PrefetchError({ message: `Failed to fetch lyrics ${id}`, cause: e }),
        ),
      )

    if (!response.ok) {
      return null
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<LyricsApiSuccessResponse>,
      catch: cause => new PrefetchError({ message: "Failed to parse response", cause }),
    })

    if (!data.lyrics) {
      return null
    }

    // Fetch enhancements separately if available
    let enhancement = null
    let chordEnhancement = null
    if (data.hasEnhancement || data.hasChordEnhancement) {
      const enhResponse = yield* fetchSvc
        .fetch(`/api/lyrics/${id}/enhancements`)
        .pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (enhResponse?.ok) {
        const enhData = yield* Effect.tryPromise({
          try: () => enhResponse.json(),
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))

        if (enhData) {
          enhancement = enhData.enhancement ?? null
          chordEnhancement = enhData.chordEnhancement ?? null
        }
      }
    }

    // Apply enhancement to lyrics if available
    const enhancedLyrics = enhancement
      ? applyEnhancement(data.lyrics, enhancement)
      : data.lyrics

    return {
      id,
      lyrics: enhancedLyrics,
      albumArt: data.albumArt ?? undefined,
      bpm: data.bpm ?? null,
      key: data.key ?? null,
      spotifyId: data.spotifyId ?? undefined,
      hasEnhancement: data.hasEnhancement ?? false,
      enhancement,
      hasChordEnhancement: data.hasChordEnhancement ?? false,
      chordEnhancement,
      bpmSource: data.attribution?.bpm ?? undefined,
      lyricsSource: data.attribution?.lyrics ?? undefined,
    }
  })

const prefetchMultipleImpl = (
  ids: readonly number[],
): Effect.Effect<readonly PrefetchedLyricsData[], never, FetchService | StorageService> =>
  Effect.gen(function* () {
    // Filter out already cached IDs
    const uncachedIds = yield* Effect.filter(ids, id =>
      isCachedImpl(id).pipe(Effect.map(cached => !cached)),
    )

    if (uncachedIds.length === 0) {
      return []
    }

    // Fetch and cache each song (parallel, but limit concurrency)
    const results = yield* Effect.forEach(
      uncachedIds,
      id =>
        prefetchLyricsImpl(id).pipe(
          Effect.flatMap(data => {
            if (!data) return Effect.succeed(null)
            return cacheLyricsImpl(id, data).pipe(Effect.map(() => data))
          }),
          Effect.catchAll(() => Effect.succeed(null)),
        ),
      { concurrency: 3 },
    )

    return results.filter((r): r is PrefetchedLyricsData => r !== null)
  })

const prefetchTopSongsImpl = (
  limit = 20,
): Effect.Effect<readonly PrefetchedLyricsData[], never, FetchService | StorageService> =>
  Effect.gen(function* () {
    const fetchSvc = yield* FetchService

    const response = yield* fetchSvc
      .fetch(`/api/songs/top?limit=${limit}`)
      .pipe(Effect.catchAll(() => Effect.succeed(null)))

    if (!response || !response.ok) {
      return []
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ songs: TopCatalogSong[] }>,
      catch: () => new PrefetchError({ message: "Failed to parse top songs response" }),
    }).pipe(Effect.catchAll(() => Effect.succeed({ songs: [] as TopCatalogSong[] })))

    const ids = data.songs.map(s => s.lrclibId)
    return yield* prefetchMultipleImpl(ids)
  })

export const LyricsPrefetchServiceLive = Layer.succeed(LyricsPrefetchService, {
  prefetchLyrics: prefetchLyricsImpl,
  prefetchMultiple: prefetchMultipleImpl,
  prefetchTopSongs: prefetchTopSongsImpl,
  isCached: isCachedImpl,
  cacheLyrics: cacheLyricsImpl,
})

/**
 * Convenience function to run prefetch for top songs on the client.
 * Handles Effect execution with the client layer.
 */
export const runPrefetchTopSongs = (limit = 20): Promise<void> =>
  import("./client-layer").then(({ ClientLayer }) =>
    Effect.runPromise(
      LyricsPrefetchService.pipe(
        Effect.flatMap(svc => svc.prefetchTopSongs(limit)),
        Effect.provide(LyricsPrefetchServiceLive),
        Effect.provide(ClientLayer),
        Effect.catchAll(() => Effect.succeed([])),
      ),
    ).then(() => undefined),
  )

/**
 * Prefetch lyrics for a list of song IDs (e.g., from recents or favorites).
 */
export const runPrefetchSongs = (ids: readonly number[]): Promise<void> =>
  import("./client-layer").then(({ ClientLayer }) =>
    Effect.runPromise(
      LyricsPrefetchService.pipe(
        Effect.flatMap(svc => svc.prefetchMultiple(ids)),
        Effect.provide(LyricsPrefetchServiceLive),
        Effect.provide(ClientLayer),
        Effect.catchAll(() => Effect.succeed([])),
      ),
    ).then(() => undefined),
  )

/**
 * Prefetch lyrics for recent songs, applying enhancements.
 */
export const runPrefetchRecents = (recents: readonly RecentSong[]): Promise<void> =>
  runPrefetchSongs(recents.map(r => r.id))

/**
 * Refresh metadata for a song (re-fetches from API to get missing album info).
 * Forces a fresh fetch even if cached, updating the cache with new data.
 */
const refreshMetadataImpl = (
  id: number,
): Effect.Effect<PrefetchedLyricsData | null, never, FetchService | StorageService> =>
  prefetchLyricsImpl(id).pipe(
    Effect.flatMap(data => {
      if (!data) return Effect.succeed(null)
      return cacheLyricsImpl(id, data).pipe(Effect.map(() => data))
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  )

/**
 * Refresh metadata for songs missing album info.
 * Re-fetches from API which triggers Spotify lookup for album names.
 */
export const runRefreshMissingAlbums = (
  songs: ReadonlyArray<{ id: number; album: string | undefined }>,
): Promise<void> => {
  const idsNeedingRefresh = songs.filter(s => !s.album || s.album.trim() === "").map(s => s.id)

  if (idsNeedingRefresh.length === 0) {
    return Promise.resolve()
  }

  return import("./client-layer").then(({ ClientLayer }) =>
    Effect.runPromise(
      Effect.forEach(idsNeedingRefresh, id => refreshMetadataImpl(id), { concurrency: 2 }).pipe(
        Effect.provide(ClientLayer),
        Effect.catchAll(() => Effect.succeed([])),
      ),
    ).then(() => undefined),
  )
}
