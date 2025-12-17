import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongSettings } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

const SONG_PROVIDER = "lrclib"

export async function GET(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId } = await params
  const userId = session.user.id

  const settings = await db
    .select({ transposeSemitones: userSongSettings.transposeSemitones })
    .from(userSongSettings)
    .where(
      and(
        eq(userSongSettings.userId, userId),
        eq(userSongSettings.songProvider, SONG_PROVIDER),
        eq(userSongSettings.songId, songId),
      ),
    )
    .limit(1)

  const transpose = settings[0]?.transposeSemitones ?? 0

  return NextResponse.json({ transpose })
}

export async function PUT(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId } = await params
  const userId = session.user.id

  const body = await request.json().catch(() => ({}))
  const transpose = typeof body.transpose === "number" ? body.transpose : 0
  const clamped = Math.max(-12, Math.min(12, transpose))

  const existing = await db
    .select({ id: userSongSettings.id })
    .from(userSongSettings)
    .where(
      and(
        eq(userSongSettings.userId, userId),
        eq(userSongSettings.songProvider, SONG_PROVIDER),
        eq(userSongSettings.songId, songId),
      ),
    )
    .limit(1)

  const existingRecord = existing[0]
  if (existingRecord) {
    await db
      .update(userSongSettings)
      .set({
        transposeSemitones: clamped,
        updatedAt: new Date(),
      })
      .where(eq(userSongSettings.id, existingRecord.id))
  } else {
    await db.insert(userSongSettings).values({
      userId,
      songId,
      songProvider: SONG_PROVIDER,
      transposeSemitones: clamped,
    })
  }

  return NextResponse.json({ success: true, transpose: clamped })
}
