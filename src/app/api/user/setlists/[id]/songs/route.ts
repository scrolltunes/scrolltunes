import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { and, asc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const setlist = await db
    .select({ id: userSetlists.id })
    .from(userSetlists)
    .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
    .then(rows => rows[0])

  if (!setlist) {
    return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
  }

  const songs = await db
    .select()
    .from(userSetlistSongs)
    .where(eq(userSetlistSongs.setlistId, id))
    .orderBy(asc(userSetlistSongs.sortOrder))

  return NextResponse.json({ songs })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { songId, songProvider, title, artist } = body

  if (!songId || !songProvider || !title || !artist) {
    return NextResponse.json(
      { error: "Missing required fields: songId, songProvider, title, artist" },
      { status: 400 },
    )
  }

  const setlist = await db
    .select({ id: userSetlists.id })
    .from(userSetlists)
    .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
    .then(rows => rows[0])

  if (!setlist) {
    return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
  }

  const maxSortOrder = await db
    .select({ max: sql<number>`COALESCE(MAX(${userSetlistSongs.sortOrder}), -1)` })
    .from(userSetlistSongs)
    .where(eq(userSetlistSongs.setlistId, id))
    .then(rows => rows[0]?.max ?? -1)

  const [song] = await db
    .insert(userSetlistSongs)
    .values({
      setlistId: id,
      songId,
      songProvider,
      songTitle: title,
      songArtist: artist,
      sortOrder: maxSortOrder + 1,
    })
    .returning()

  return NextResponse.json({ song }, { status: 201 })
}
