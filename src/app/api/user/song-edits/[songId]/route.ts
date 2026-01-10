import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongSettings } from "@/lib/db/schema"
import type { SongEditPayload } from "@/lib/song-edits"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

const SONG_PROVIDER = "lrclib"

interface SettingsJson {
  edits?: SongEditPayload
  [key: string]: unknown
}

/**
 * Validate that a payload looks like a valid SongEditPayload
 */
function isValidEditPayload(payload: unknown): payload is SongEditPayload {
  if (typeof payload !== "object" || payload === null) return false

  const p = payload as Record<string, unknown>

  // Check required fields
  if (p.version !== 1) return false
  if (typeof p.createdAt !== "string") return false
  if (typeof p.updatedAt !== "string") return false
  if (!Array.isArray(p.lineEdits)) return false

  // Validate lineEdits array
  for (const edit of p.lineEdits) {
    if (typeof edit !== "object" || edit === null) return false
    const e = edit as Record<string, unknown>
    if (typeof e.lineId !== "string") return false
    if (!["skip", "modify", "section"].includes(e.action as string)) return false
  }

  return true
}

export async function GET(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId } = await params
  const userId = session.user.id

  const settings = await db
    .select({ settingsJson: userSongSettings.settingsJson })
    .from(userSongSettings)
    .where(
      and(
        eq(userSongSettings.userId, userId),
        eq(userSongSettings.songProvider, SONG_PROVIDER),
        eq(userSongSettings.songId, songId),
      ),
    )
    .limit(1)

  const json = settings[0]?.settingsJson as SettingsJson | null
  const edits = json?.edits ?? null

  return NextResponse.json({ edits })
}

export async function PUT(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId } = await params
  const userId = session.user.id

  const body = await request.json().catch(() => ({}))
  const edits = body.edits

  // Validate edits payload
  if (edits !== null && !isValidEditPayload(edits)) {
    return NextResponse.json({ error: "Invalid edits payload" }, { status: 400 })
  }

  const existing = await db
    .select({ id: userSongSettings.id, settingsJson: userSongSettings.settingsJson })
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
  const currentJson = (existingRecord?.settingsJson as SettingsJson | null) ?? {}

  const updatedSettings: SettingsJson = {
    ...currentJson,
    edits: edits ?? undefined,
  }

  if (existingRecord) {
    await db
      .update(userSongSettings)
      .set({
        settingsJson: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(userSongSettings.id, existingRecord.id))
  } else {
    await db.insert(userSongSettings).values({
      userId,
      songId,
      songProvider: SONG_PROVIDER,
      settingsJson: updatedSettings,
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { songId } = await params
  const userId = session.user.id

  const existing = await db
    .select({ id: userSongSettings.id, settingsJson: userSongSettings.settingsJson })
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
  if (!existingRecord) {
    return NextResponse.json({ success: true })
  }

  const currentJson = (existingRecord.settingsJson as SettingsJson | null) ?? {}

  // Remove edits from settingsJson, keep other settings
  const { edits: _, ...rest } = currentJson
  const updatedSettings = Object.keys(rest).length > 0 ? rest : null

  if (updatedSettings) {
    await db
      .update(userSongSettings)
      .set({
        settingsJson: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(userSongSettings.id, existingRecord.id))
  } else {
    // If no other settings remain, we could delete the row
    // But for simplicity, just clear the settingsJson
    await db
      .update(userSongSettings)
      .set({
        settingsJson: null,
        updatedAt: new Date(),
      })
      .where(eq(userSongSettings.id, existingRecord.id))
  }

  return NextResponse.json({ success: true })
}
