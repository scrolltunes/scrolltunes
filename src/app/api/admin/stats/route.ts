import { auth } from "@/auth"
import { db } from "@/lib/db"
import { appUserProfiles, userSongItems, users } from "@/lib/db/schema"
import { count, desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [profile] = await db
    .select({ isAdmin: appUserProfiles.isAdmin })
    .from(appUserProfiles)
    .where(eq(appUserProfiles.userId, session.user.id))

  if (!profile?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Top 5 most favorited songs
  const topFavorites = await db
    .select({
      songId: userSongItems.songId,
      title: userSongItems.songTitle,
      artist: userSongItems.songArtist,
      favoriteCount: count(),
    })
    .from(userSongItems)
    .where(eq(userSongItems.isFavorite, true))
    .groupBy(userSongItems.songId, userSongItems.songTitle, userSongItems.songArtist)
    .orderBy(desc(count()))
    .limit(5)

  // Total users
  const [userCount] = await db.select({ count: count() }).from(users)

  // Last joined user
  const [lastUser] = await db
    .select({
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(1)

  return NextResponse.json({
    topFavorites: topFavorites.map(song => ({
      title: song.title,
      artist: song.artist,
      favoriteCount: song.favoriteCount,
    })),
    totalUsers: userCount?.count ?? 0,
    lastJoinedUser: lastUser
      ? {
          email: lastUser.email,
          joinedAt: lastUser.createdAt.toISOString(),
        }
      : null,
  })
}
