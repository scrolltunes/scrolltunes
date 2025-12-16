import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongItems } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  await db
    .update(userSongItems)
    .set({ inHistory: false })
    .where(and(eq(userSongItems.userId, userId), eq(userSongItems.inHistory, true)))

  return NextResponse.json({ success: true })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

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
