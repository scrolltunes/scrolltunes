import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongItems } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId: compositeId } = await params
  const colonIndex = compositeId.indexOf(":")

  if (colonIndex === -1) {
    return NextResponse.json({ error: "Invalid songId format" }, { status: 400 })
  }

  const provider = compositeId.slice(0, colonIndex)
  const userId = session.user.id

  await db
    .update(userSongItems)
    .set({
      isFavorite: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userSongItems.userId, userId),
        eq(userSongItems.songProvider, provider),
        eq(userSongItems.songId, compositeId),
      ),
    )

  return new NextResponse(null, { status: 204 })
}
