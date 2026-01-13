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

export const TursoServiceLive = Layer.succeed(TursoService, {
  search,
  getById,
  findByTitleArtist,
})
