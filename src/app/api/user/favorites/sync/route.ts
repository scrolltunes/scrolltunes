import { auth } from "@/auth"
import { db } from "@/lib/db"
import { normalizeSongInput } from "@/lib/db/normalize"
import { userSongItems } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const serverFavorites = await db
    .select({
      songId: userSongItems.songId,
      songProvider: userSongItems.songProvider,
      title: userSongItems.songTitle,
      artist: userSongItems.songArtist,
      album: userSongItems.songAlbum,
      addedAt: userSongItems.createdAt,
    })
    .from(userSongItems)
    .where(
      and(
        eq(userSongItems.userId, userId),
        eq(userSongItems.isFavorite, true),
        eq(userSongItems.deleted, false),
      ),
    )
    .orderBy(desc(userSongItems.createdAt))

  return NextResponse.json({
    favorites: serverFavorites.map(f => ({
      songId: f.songId,
      songProvider: f.songProvider,
      title: f.title,
      artist: f.artist,
      album: f.album,
      addedAt: f.addedAt?.toISOString() ?? new Date().toISOString(),
    })),
  })
}

interface FavoriteInput {
  songId: string
  songProvider: string
  title: string
  artist: string
  album?: string
}

interface SyncRequest {
  favorites: FavoriteInput[]
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const body = (await request.json()) as SyncRequest
  const { favorites } = body

  for (const fav of favorites) {
    await db
      .insert(userSongItems)
      .values(
        normalizeSongInput({
          userId,
          songId: fav.songId,
          songProvider: fav.songProvider,
          songTitle: fav.title,
          songArtist: fav.artist,
          songAlbum: fav.album,
          isFavorite: true,
        }),
      )
      .onConflictDoUpdate({
        target: [userSongItems.userId, userSongItems.songProvider, userSongItems.songId],
        set: {
          isFavorite: true,
          updatedAt: new Date(),
        },
      })
  }

  const serverFavorites = await db
    .select({
      songId: userSongItems.songId,
      songProvider: userSongItems.songProvider,
      title: userSongItems.songTitle,
      artist: userSongItems.songArtist,
      album: userSongItems.songAlbum,
    })
    .from(userSongItems)
    .where(
      and(
        eq(userSongItems.userId, userId),
        eq(userSongItems.isFavorite, true),
        eq(userSongItems.deleted, false),
      ),
    )

  return NextResponse.json({ favorites: serverFavorites })
}
