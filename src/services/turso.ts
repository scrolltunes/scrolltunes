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
    ) => Effect.Effect<TursoSearchResult | null, TursoSearchError, ServerConfig>
  }
>() {}

let clientInstance: Client | null = null

const getClient = Effect.gen(function* () {
  if (clientInstance) return clientInstance

  const config = yield* ServerConfig

  if (!config.tursoUrl || !config.tursoAuthToken) {
    console.log("[TURSO] Credentials not configured, tursoUrl:", config.tursoUrl)
    return yield* Effect.fail(
      new TursoSearchError({ message: "Turso LRCLIB credentials not configured" }),
    )
  }
  console.log("[TURSO] Connecting to:", config.tursoUrl)

  clientInstance = createClient({
    url: config.tursoUrl,
    authToken: config.tursoAuthToken,
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

const findByTitleArtist = (title: string, artist: string) =>
  Effect.gen(function* () {
    const client = yield* getClient

    const ftsQuery = `"${title.replace(/"/g, '""')}" "${artist.replace(/"/g, '""')}"`

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY t.quality DESC
            LIMIT 1
          `,
          args: [ftsQuery],
        })
        return rs.rows[0] ?? null
      },
      catch: error =>
        new TursoSearchError({ message: "Turso findByTitleArtist failed", cause: error }),
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

export const TursoServiceLive = Layer.succeed(TursoService, {
  search,
  getById,
  findByTitleArtist,
})
