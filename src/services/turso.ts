import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { type Client, createClient } from "@libsql/client/web"
import { Context, Data, Effect, Layer } from "effect"
import { ServerConfig } from "./server-config"

export interface TursoSearchResult {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
  readonly quality: number
}

export class TursoSearchError extends Data.TaggedClass("TursoSearchError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class TursoService extends Context.Tag("TursoService")<
  TursoService,
  {
    readonly search: (
      query: string,
      limit?: number,
    ) => Effect.Effect<readonly TursoSearchResult[], TursoSearchError, ServerConfig>
    readonly getById: (
      lrclibId: number,
    ) => Effect.Effect<TursoSearchResult | null, TursoSearchError, ServerConfig>
    readonly findByTitleArtist: (
      title: string,
      artist: string,
      targetDurationSec?: number,
    ) => Effect.Effect<TursoSearchResult | null, TursoSearchError, ServerConfig>
  }
>() {}

let clientInstance: Client | null = null

const getClient = Effect.gen(function* () {
  if (clientInstance) return clientInstance

  const config = yield* ServerConfig

  console.log("[TURSO] Connecting to:", config.tursoLrclibUrl)

  clientInstance = createClient({
    url: config.tursoLrclibUrl,
    authToken: config.tursoLrclibAuthToken,
  })

  return clientInstance
})

const search = (query: string, limit = 10) =>
  Effect.gen(function* () {
    console.log(`[TURSO] Searching for: "${query}" (limit: ${limit})`)
    const client = yield* getClient

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality DESC, t.id ASC
            LIMIT ?
          `,
          args: [query, limit],
        })
        return rs.rows
      },
      catch: error => {
        console.error("[TURSO] Query error:", error)
        return new TursoSearchError({ message: "Turso search failed", cause: error })
      },
    })

    return result.map(row => ({
      id: row.id as number,
      title: row.title as string,
      artist: row.artist as string,
      album: row.album as string | null,
      durationSec: row.duration_sec as number,
      quality: row.quality as number,
    }))
  })

const getById = (lrclibId: number) =>
  Effect.gen(function* () {
    const client = yield* getClient

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT id, title, artist, album, duration_sec, quality
            FROM tracks
            WHERE id = ?
            LIMIT 1
          `,
          args: [lrclibId],
        })
        return rs.rows[0] ?? null
      },
      catch: error => new TursoSearchError({ message: "Turso getById failed", cause: error }),
    })

    if (!result) return null

    return {
      id: result.id as number,
      title: result.title as string,
      artist: result.artist as string,
      album: result.album as string | null,
      durationSec: result.duration_sec as number,
      quality: result.quality as number,
    }
  })

const findByTitleArtist = (title: string, artist: string, targetDurationSec?: number) =>
  Effect.gen(function* () {
    const client = yield* getClient

    // Normalize title/artist to strip remaster suffixes, live tags, featured artists, etc.
    const cleanTitle = normalizeTrackName(title)
    const cleanArtist = normalizeArtistName(artist)

    // Use column-specific FTS matching to ensure artist phrase matches artist column
    // This prevents compilation tracks with "Artist - Song" titles from matching
    const escapedTitle = cleanTitle.replace(/"/g, '""')
    const escapedArtist = cleanArtist.replace(/"/g, '""')
    const ftsQuery = `title:"${escapedTitle}" artist:"${escapedArtist}"`

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY t.quality DESC
            LIMIT 10
          `,
          args: [ftsQuery],
        })
        return rs.rows
      },
      catch: error =>
        new TursoSearchError({ message: "Turso findByTitleArtist failed", cause: error }),
    })

    if (result.length === 0) return null

    const candidates = result.map(row => ({
      id: row.id as number,
      title: row.title as string,
      artist: row.artist as string,
      album: row.album as string | null,
      durationSec: row.duration_sec as number,
      quality: row.quality as number,
    }))

    if (targetDurationSec === undefined) {
      return candidates[0] ?? null
    }

    const scored = candidates.map(c => {
      const durationDiff = Math.abs(c.durationSec - targetDurationSec)
      let durationScore = 0
      if (durationDiff <= 2) durationScore = 50
      else if (durationDiff <= 5) durationScore = 30
      else if (durationDiff <= 10) durationScore = 10
      return { ...c, score: c.quality + durationScore }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0] ?? null
  })

export const TursoServiceLive = Layer.succeed(TursoService, {
  search,
  getById,
  findByTitleArtist,
})
