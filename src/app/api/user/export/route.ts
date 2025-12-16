import { auth } from "@/auth"
import { db } from "@/lib/db"
import {
  accounts,
  appUserProfiles,
  userSetlistSongs,
  userSetlists,
  userSongItems,
  userSongSettings,
  userSpotifyTokens,
  users,
} from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [user] = await db.select().from(users).where(eq(users.id, userId))

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const [profile] = await db
    .select()
    .from(appUserProfiles)
    .where(eq(appUserProfiles.userId, userId))

  const songItems = await db.select().from(userSongItems).where(eq(userSongItems.userId, userId))

  const settings = await db
    .select()
    .from(userSongSettings)
    .where(eq(userSongSettings.userId, userId))

  const setlists = await db.select().from(userSetlists).where(eq(userSetlists.userId, userId))

  const setlistSongsMap = new Map<
    string,
    Array<{
      songId: string
      songProvider: string
      title: string
      artist: string
      sortOrder: number
    }>
  >()

  for (const setlist of setlists) {
    const songs = await db
      .select()
      .from(userSetlistSongs)
      .where(eq(userSetlistSongs.setlistId, setlist.id))

    setlistSongsMap.set(
      setlist.id,
      songs.map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
        sortOrder: s.sortOrder,
      })),
    )
  }

  const [spotifyTokens] = await db
    .select()
    .from(userSpotifyTokens)
    .where(eq(userSpotifyTokens.userId, userId))

  const [spotifyAccount] = await db.select().from(accounts).where(eq(accounts.userId, userId))

  const exportData = {
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      createdAt: user.emailVerified?.toISOString() ?? null,
    },
    profile: profile
      ? {
          consentVersion: profile.consentVersion,
          consentGivenAt: profile.consentGivenAt.toISOString(),
        }
      : null,
    songHistory: songItems
      .filter(s => s.inHistory)
      .map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
        album: s.songAlbum,
        firstPlayedAt: s.firstPlayedAt?.toISOString() ?? null,
        lastPlayedAt: s.lastPlayedAt?.toISOString() ?? null,
        playCount: s.playCount,
      })),
    favorites: songItems
      .filter(s => s.isFavorite)
      .map(s => ({
        songId: s.songId,
        songProvider: s.songProvider,
        title: s.songTitle,
        artist: s.songArtist,
      })),
    songSettings: settings.map(s => ({
      songId: s.songId,
      songProvider: s.songProvider,
      transposeSemitones: s.transposeSemitones,
      capoFret: s.capoFret,
      notes: s.notes,
      tempoMultiplier: s.tempoMultiplier,
    })),
    setlists: setlists.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      color: s.color,
      songs: setlistSongsMap.get(s.id) ?? [],
    })),
    integrations: {
      spotify: spotifyTokens
        ? {
            connected: true,
            scope: spotifyAccount?.scope ?? null,
            lastUpdatedAt: spotifyTokens.updatedAt?.toISOString() ?? null,
          }
        : null,
    },
  }

  const dateStr = new Date().toISOString().split("T")[0]

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="scrolltunes-data-${dateStr}.json"`,
    },
  })
}
