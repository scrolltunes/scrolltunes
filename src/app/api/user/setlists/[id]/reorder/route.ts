import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { songIds } = body

  if (!Array.isArray(songIds)) {
    return NextResponse.json({ error: "songIds must be an array" }, { status: 400 })
  }

  const setlist = await db
    .select({ id: userSetlists.id })
    .from(userSetlists)
    .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
    .then(rows => rows[0])

  if (!setlist) {
    return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
  }

  const existingSongs = await db
    .select({ id: userSetlistSongs.id })
    .from(userSetlistSongs)
    .where(
      and(eq(userSetlistSongs.setlistId, id), inArray(userSetlistSongs.id, songIds as string[])),
    )

  const existingIds = new Set(existingSongs.map(s => s.id))
  const invalidIds = (songIds as string[]).filter(sid => !existingIds.has(sid))

  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Invalid song IDs: ${invalidIds.join(", ")}` },
      { status: 400 },
    )
  }

  await db.transaction(async tx => {
    for (let i = 0; i < songIds.length; i++) {
      await tx
        .update(userSetlistSongs)
        .set({ sortOrder: i })
        .where(eq(userSetlistSongs.id, songIds[i] as string))
    }
  })

  return NextResponse.json({ success: true })
}
