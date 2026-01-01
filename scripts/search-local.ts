#!/usr/bin/env bun
/**
 * Local SQLite search script for testing
 * Usage: bun scripts/search-local.ts "query"
 */

import { Database } from "bun:sqlite"

const LOCAL_DB_PATH = "/Users/hmemcpy/git/music/lrclib-db-dump-20251209T092057Z-index.sqlite3"

interface TrackRow {
  id: number
  title: string
  artist: string
  album: string | null
  duration_sec: number
  quality: number
}

const query = process.argv[2]
const limit = Number(process.argv[3] ?? 10)

if (!query) {
  console.error("Usage: bun scripts/search-local.ts <query> [limit]")
  process.exit(1)
}

const db = new Database(LOCAL_DB_PATH, { readonly: true })

const rows = db
  .query<TrackRow, [string, number]>(`
    SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality
    FROM tracks_fts fts
    JOIN tracks t ON fts.rowid = t.id
    WHERE tracks_fts MATCH ?1
    ORDER BY -bm25(tracks_fts, 10.0, 1.0) + t.quality DESC, t.id ASC
    LIMIT ?2
  `)
  .all(query, limit)

db.close()

console.log(`\nSearch: "${query}" (${rows.length} results)\n`)
console.log("ID\t\tQuality\tArtist\t\t\t\tTitle\t\t\t\tAlbum")
console.log("-".repeat(120))

for (const row of rows) {
  const artist = row.artist.slice(0, 24).padEnd(24)
  const title = row.title.slice(0, 28).padEnd(28)
  const album = (row.album ?? "").slice(0, 30)
  console.log(`${row.id}\t${row.quality}\t${artist}\t${title}\t${album}`)
}
