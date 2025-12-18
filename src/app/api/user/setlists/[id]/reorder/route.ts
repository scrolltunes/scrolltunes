import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    if (songIds.length === 0) {
      return NextResponse.json({ success: true })
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
      console.error("[reorder] Invalid song IDs:", invalidIds, "setlistId:", id)
      return NextResponse.json(
        { error: `Invalid song IDs: ${invalidIds.join(", ")}` },
        { status: 400 },
      )
    }

    // Batch update sortOrder for all songs in a single request
    const updates = songIds.map((songId, i) =>
      db
        .update(userSetlistSongs)
        .set({ sortOrder: i })
        .where(eq(userSetlistSongs.id, songId as string)),
    )
    const first = updates[0]
    if (first) {
      await db.batch([first, ...updates.slice(1)])
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[reorder] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
