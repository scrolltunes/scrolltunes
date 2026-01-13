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
  // Spotify enrichment (all nullable)
  readonly spotifyId: string | null
  readonly popularity: number | null
  readonly tempo: number | null
  readonly musicalKey: number | null
  readonly mode: number | null
  readonly timeSignature: number | null
  readonly isrc: string | null
  readonly albumImageUrl: string | null
}

export class TursoSearchError extends Data.TaggedClass("TursoSearchError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export type TursoFilter = "all" | "missing_spotify" | "has_spotify"
export type TursoSort = "popular" | "alpha"

export interface TursoSearchWithFiltersOptions {
  readonly query?: string | undefined
  readonly filter: TursoFilter
  readonly sort: TursoSort
  readonly offset: number
  readonly limit: number
  readonly lrclibIds?: readonly number[] | undefined
}

export interface TursoSearchWithFiltersResult {
  readonly tracks: readonly TursoSearchResult[]
  readonly total: number
}

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
    readonly searchWithFilters: (
      options: TursoSearchWithFiltersOptions,
    ) => Effect.Effect<TursoSearchWithFiltersResult, TursoSearchError, ServerConfig>
    readonly getByIds: (
      lrclibIds: readonly number[],
    ) => Effect.Effect<readonly TursoSearchResult[], TursoSearchError, ServerConfig>
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

/**
 * Convert user query to FTS5 prefix query.
 * Appends * to the last word for autocomplete behavior.
 * Example: "never too la" -> "never too la*"
 */
function toFtsQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return trimmed
  // If query already ends with *, don't add another
  if (trimmed.endsWith("*")) return trimmed
  // Append * to enable prefix matching on the last word
  return `${trimmed}*`
}

const search = (query: string, limit = 10) =>
  Effect.gen(function* () {
    const ftsQuery = toFtsQuery(query)
    console.log(`[TURSO] Searching for: "${query}" -> FTS: "${ftsQuery}" (limit: ${limit})`)
    const client = yield* getClient

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                   t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
                   t.time_signature, t.isrc, t.album_image_url
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY
              (t.popularity IS NOT NULL) DESC,
              t.popularity DESC,
              t.quality DESC,
              -bm25(tracks_fts) ASC
            LIMIT ?
          `,
          args: [ftsQuery, limit],
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
      spotifyId: row.spotify_id as string | null,
      popularity: row.popularity as number | null,
      tempo: row.tempo as number | null,
      musicalKey: row.musical_key as number | null,
      mode: row.mode as number | null,
      timeSignature: row.time_signature as number | null,
      isrc: row.isrc as string | null,
      albumImageUrl: row.album_image_url as string | null,
    }))
  })

const getById = (lrclibId: number) =>
  Effect.gen(function* () {
    const client = yield* getClient

    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT id, title, artist, album, duration_sec, quality,
                   spotify_id, popularity, tempo, musical_key, mode,
                   time_signature, isrc, album_image_url
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
      spotifyId: result.spotify_id as string | null,
      popularity: result.popularity as number | null,
      tempo: result.tempo as number | null,
      musicalKey: result.musical_key as number | null,
      mode: result.mode as number | null,
      timeSignature: result.time_signature as number | null,
      isrc: result.isrc as string | null,
      albumImageUrl: result.album_image_url as string | null,
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
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                   t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
                   t.time_signature, t.isrc, t.album_image_url
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
      spotifyId: row.spotify_id as string | null,
      popularity: row.popularity as number | null,
      tempo: row.tempo as number | null,
      musicalKey: row.musical_key as number | null,
      mode: row.mode as number | null,
      timeSignature: row.time_signature as number | null,
      isrc: row.isrc as string | null,
      albumImageUrl: row.album_image_url as string | null,
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

const searchWithFilters = (options: TursoSearchWithFiltersOptions) =>
  Effect.gen(function* () {
    const client = yield* getClient

    // Build WHERE clauses
    const whereClauses: string[] = []
    const args: (string | number)[] = []

    // FTS search if query provided
    if (options.query?.trim()) {
      const ftsQuery = toFtsQuery(options.query)
      whereClauses.push("tracks_fts MATCH ?")
      args.push(ftsQuery)
    }

    // Spotify filter
    if (options.filter === "missing_spotify") {
      whereClauses.push("t.spotify_id IS NULL")
    } else if (options.filter === "has_spotify") {
      whereClauses.push("t.spotify_id IS NOT NULL")
    }

    // Filter by specific lrclib IDs if provided
    if (options.lrclibIds && options.lrclibIds.length > 0) {
      const placeholders = options.lrclibIds.map(() => "?").join(", ")
      whereClauses.push(`t.id IN (${placeholders})`)
      args.push(...options.lrclibIds)
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""

    // Build ORDER BY
    let orderBy: string
    if (options.sort === "alpha") {
      orderBy = "t.artist, t.title"
    } else {
      // popular (default)
      orderBy = "(t.popularity IS NOT NULL) DESC, t.popularity DESC, t.quality DESC"
    }

    // Build the main query
    // Use FTS table only if search query is provided
    const fromClause = options.query?.trim()
      ? "FROM tracks_fts fts JOIN tracks t ON fts.rowid = t.id"
      : "FROM tracks t"

    const [countResult, tracksResult] = yield* Effect.tryPromise({
      try: async () => {
        // Get count
        const countSql = `SELECT COUNT(*) as total ${fromClause} ${whereClause}`
        const countRs = await client.execute({ sql: countSql, args })

        // Get tracks with pagination
        const tracksSql = `
          SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                 t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
                 t.time_signature, t.isrc, t.album_image_url
          ${fromClause}
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `
        const tracksRs = await client.execute({
          sql: tracksSql,
          args: [...args, options.limit, options.offset],
        })

        return [countRs.rows[0], tracksRs.rows] as const
      },
      catch: error => {
        console.error("[TURSO] searchWithFilters error:", error)
        return new TursoSearchError({ message: "Turso searchWithFilters failed", cause: error })
      },
    })

    const total = (countResult?.total as number) ?? 0
    const tracks = tracksResult.map(row => ({
      id: row.id as number,
      title: row.title as string,
      artist: row.artist as string,
      album: row.album as string | null,
      durationSec: row.duration_sec as number,
      quality: row.quality as number,
      spotifyId: row.spotify_id as string | null,
      popularity: row.popularity as number | null,
      tempo: row.tempo as number | null,
      musicalKey: row.musical_key as number | null,
      mode: row.mode as number | null,
      timeSignature: row.time_signature as number | null,
      isrc: row.isrc as string | null,
      albumImageUrl: row.album_image_url as string | null,
    }))

    return { tracks, total }
  })

const getByIds = (lrclibIds: readonly number[]) =>
  Effect.gen(function* () {
    if (lrclibIds.length === 0) return []

    const client = yield* getClient

    const placeholders = lrclibIds.map(() => "?").join(", ")
    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT id, title, artist, album, duration_sec, quality,
                   spotify_id, popularity, tempo, musical_key, mode,
                   time_signature, isrc, album_image_url
            FROM tracks
            WHERE id IN (${placeholders})
          `,
          args: [...lrclibIds],
        })
        return rs.rows
      },
      catch: error => new TursoSearchError({ message: "Turso getByIds failed", cause: error }),
    })

    return result.map(row => ({
      id: row.id as number,
      title: row.title as string,
      artist: row.artist as string,
      album: row.album as string | null,
      durationSec: row.duration_sec as number,
      quality: row.quality as number,
      spotifyId: row.spotify_id as string | null,
      popularity: row.popularity as number | null,
      tempo: row.tempo as number | null,
      musicalKey: row.musical_key as number | null,
      mode: row.mode as number | null,
      timeSignature: row.time_signature as number | null,
      isrc: row.isrc as string | null,
      albumImageUrl: row.album_image_url as string | null,
    }))
  })

export const TursoServiceLive = Layer.succeed(TursoService, {
  search,
  getById,
  findByTitleArtist,
  searchWithFilters,
  getByIds,
})
