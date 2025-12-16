import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongItems } from "@/lib/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

interface SyncSongInput {
  songId: string
  songProvider: string
  title: string
  artist: string
  album?: string
  durationMs?: number
  lastPlayedAt: string
  playCount?: number
}

interface SyncRequestBody {
  songs: SyncSongInput[]
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const body = (await request.json()) as SyncRequestBody

  if (!Array.isArray(body.songs)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const now = new Date()

  for (const song of body.songs) {
    const lastPlayedAt = new Date(song.lastPlayedAt)
    const playCount = song.playCount ?? 1

    await db
      .insert(userSongItems)
      .values({
        userId,
        songId: song.songId,
        songProvider: song.songProvider,
        songTitle: song.title,
        songArtist: song.artist,
        songAlbum: song.album,
        songDurationMs: song.durationMs,
        inHistory: true,
        firstPlayedAt: lastPlayedAt,
        lastPlayedAt,
        playCount,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userSongItems.userId, userSongItems.songProvider, userSongItems.songId],
        set: {
          inHistory: true,
          lastPlayedAt: sql`GREATEST(${userSongItems.lastPlayedAt}, ${lastPlayedAt})`,
          playCount: sql`${userSongItems.playCount} + ${playCount}`,
          updatedAt: now,
        },
      })
  }

  const history = await db
    .select({
      songId: userSongItems.songId,
      songProvider: userSongItems.songProvider,
      title: userSongItems.songTitle,
      artist: userSongItems.songArtist,
      lastPlayedAt: userSongItems.lastPlayedAt,
      playCount: userSongItems.playCount,
    })
    .from(userSongItems)
    .where(
      and(
        eq(userSongItems.userId, userId),
        eq(userSongItems.inHistory, true),
        eq(userSongItems.deleted, false),
      ),
    )
    .orderBy(desc(userSongItems.lastPlayedAt))

  return NextResponse.json({
    history: history.map(item => ({
      songId: item.songId,
      songProvider: item.songProvider,
      title: item.title,
      artist: item.artist,
      lastPlayedAt: item.lastPlayedAt?.toISOString() ?? null,
      playCount: item.playCount,
    })),
  })
}
