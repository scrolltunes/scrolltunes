#!/usr/bin/env bun
/**
 * Search the original LRCLIB dump (not our extracted index)
 * Usage: bun scripts/search-original.ts "query"
 */

import { Database } from "bun:sqlite"

const ORIGINAL_DB_PATH = "/Users/hmemcpy/git/music/lrclib-db-dump-20251209T092057Z.sqlite3"

interface TrackRow {
  id: number
  name: string
  artist_name: string
  album_name: string | null
  duration: number
}

const query = process.argv[2]
const limit = Number(process.argv[3] ?? 10)

if (!query) {
  console.error("Usage: bun scripts/search-original.ts <query> [limit]")
  process.exit(1)
}

const db = new Database(ORIGINAL_DB_PATH, { readonly: true })

// Original FTS has: name_lower, album_name_lower, artist_name_lower
const rows = db
  .query<TrackRow, [string, number]>(`
    SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
    FROM tracks_fts fts
    JOIN tracks t ON fts.rowid = t.id
    WHERE tracks_fts MATCH ?1
    ORDER BY bm25(tracks_fts)
    LIMIT ?2
  `)
  .all(query, limit)

db.close()

console.log(`\nSearch (ORIGINAL): "${query}" (${rows.length} results)\n`)
console.log("ID\t\tArtist\t\t\t\tTitle\t\t\t\tAlbum")
console.log("-".repeat(120))

for (const row of rows) {
  const artist = row.artist_name.slice(0, 24).padEnd(24)
  const title = row.name.slice(0, 28).padEnd(28)
  const album = (row.album_name ?? "").slice(0, 30)
  console.log(`${row.id}\t${artist}\t${title}\t${album}`)
}
