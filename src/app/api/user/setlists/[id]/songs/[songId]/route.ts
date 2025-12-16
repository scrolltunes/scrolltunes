import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; songId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, songId: compositeId } = await params

  const [provider, ...idParts] = compositeId.split(":")
  const songId = idParts.join(":")

  if (!provider || !songId) {
    return NextResponse.json(
      { error: "Invalid songId format. Expected: {provider}:{id}" },
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

  const result = await db
    .delete(userSetlistSongs)
    .where(
      and(
        eq(userSetlistSongs.setlistId, id),
        eq(userSetlistSongs.songProvider, provider),
        eq(userSetlistSongs.songId, songId),
      ),
    )
    .returning({ id: userSetlistSongs.id })

  if (result.length === 0) {
    return NextResponse.json({ error: "Song not found in setlist" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
