import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { asc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const setlistRows = await db
    .select({
      id: userSetlists.id,
      name: userSetlists.name,
      description: userSetlists.description,
      color: userSetlists.color,
      icon: userSetlists.icon,
      sortOrder: userSetlists.sortOrder,
    })
    .from(userSetlists)
    .where(eq(userSetlists.userId, session.user.id))
    .orderBy(asc(userSetlists.sortOrder))

  const setlistIds = setlistRows.map(s => s.id)

  const songRows =
    setlistIds.length > 0
      ? await db
          .select({
            setlistId: userSetlistSongs.setlistId,
            songId: userSetlistSongs.songId,
            songProvider: userSetlistSongs.songProvider,
            songTitle: userSetlistSongs.songTitle,
            songArtist: userSetlistSongs.songArtist,
            sortOrder: userSetlistSongs.sortOrder,
          })
          .from(userSetlistSongs)
          .where(inArray(userSetlistSongs.setlistId, setlistIds))
      : []

  const songsBySetlist = new Map<string, typeof songRows>()
  for (const song of songRows) {
    const existing = songsBySetlist.get(song.setlistId) ?? []
    existing.push(song)
    songsBySetlist.set(song.setlistId, existing)
  }

  const setlists = setlistRows.map(setlist => {
    const songs = songsBySetlist.get(setlist.id) ?? []
    return {
      ...setlist,
      songCount: songs.length,
      songs: songs
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(s => ({
          songId: s.songId,
          songProvider: s.songProvider,
          title: s.songTitle,
          artist: s.songArtist,
          sortOrder: s.sortOrder,
        })),
    }
  })

  return NextResponse.json({ setlists })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, color, icon } = body

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const maxSortOrder = await db
    .select({ max: userSetlists.sortOrder })
    .from(userSetlists)
    .where(eq(userSetlists.userId, session.user.id))
    .then(rows => rows[0]?.max ?? -1)

  const [setlist] = await db
    .insert(userSetlists)
    .values({
      userId: session.user.id,
      name,
      description: description ?? null,
      color: color ?? null,
      icon: icon ?? null,
      sortOrder: maxSortOrder + 1,
    })
    .returning()

  return NextResponse.json({ setlist }, { status: 201 })
}
