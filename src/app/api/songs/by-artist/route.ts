import { db } from "@/lib/db"
import { songLrclibIds, songs } from "@/lib/db/schema"
import { normalizeArtist } from "@/lib/song-catalog"
import { and, desc, eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")
  const limitParam = request.nextUrl.searchParams.get("limit")

  if (!artist) {
    return NextResponse.json({ error: "Missing required parameter: artist" }, { status: 400 })
  }

  const limit = limitParam ? Math.min(Math.max(1, Number.parseInt(limitParam, 10)), 50) : 20

  if (Number.isNaN(limit)) {
    return NextResponse.json({ error: "Invalid limit parameter" }, { status: 400 })
  }

  const artistLower = normalizeArtist(artist)

  const rows = await db
    .select({
      lrclibId: songLrclibIds.lrclibId,
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      titleLower: songs.titleLower,
      artistLower: songs.artistLower,
      albumLower: songs.albumLower,
      durationMs: songs.durationMs,
    })
    .from(songs)
    .innerJoin(songLrclibIds, eq(songLrclibIds.songId, songs.id))
    .where(and(eq(songs.artistLower, artistLower), eq(songLrclibIds.isPrimary, true)))
    .orderBy(desc(songs.totalPlayCount))
    .limit(limit)

  const indexSongs = rows.map(row => {
    const song: {
      id: number
      t: string
      a: string
      title: string
      artist: string
      al?: string
      album?: string
      dur?: number
    } = {
      id: row.lrclibId,
      t: row.titleLower,
      a: row.artistLower,
      title: row.title,
      artist: row.artist,
    }
    if (row.albumLower) {
      song.al = row.albumLower
    }
    if (row.album) {
      song.album = row.album
    }
    if (row.durationMs) {
      song.dur = Math.round(row.durationMs / 1000)
    }
    return song
  })

  return NextResponse.json(
    { songs: indexSongs },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  )
}
