import { db } from "@/lib/db"
import { songLrclibIds, songs } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export const revalidate = 3600

export async function GET() {
  const rows = await db
    .select({
      lrclibId: songLrclibIds.lrclibId,
      titleLower: songs.titleLower,
      artistLower: songs.artistLower,
      albumLower: songs.albumLower,
      durationMs: songs.durationMs,
    })
    .from(songs)
    .innerJoin(songLrclibIds, eq(songLrclibIds.songId, songs.id))
    .where(and(eq(songs.hasSyncedLyrics, true), eq(songLrclibIds.isPrimary, true)))
    .orderBy(desc(songs.totalPlayCount))
    .limit(500)

  const indexSongs = rows.map(row => {
    const song: {
      id: number
      t: string
      a: string
      al?: string
      dur?: number
    } = {
      id: row.lrclibId,
      t: row.titleLower,
      a: row.artistLower,
    }
    if (row.albumLower) {
      song.al = row.albumLower
    }
    if (row.durationMs) {
      song.dur = Math.round(row.durationMs / 1000)
    }
    return song
  })

  const response = NextResponse.json({
    version: 1,
    updatedAt: Date.now(),
    songs: indexSongs,
  })

  response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")

  return response
}
