import { auth } from "@/auth"
import { INPUT_LIMITS } from "@/constants/limits"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const setlist = await db
    .select()
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

  return NextResponse.json({ setlist: { ...setlist, songs } })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, description, color, icon, sortOrder } = body

  const existing = await db
    .select({ id: userSetlists.id })
    .from(userSetlists)
    .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
    .then(rows => rows[0])

  if (!existing) {
    return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
  }

  if (name !== undefined && typeof name === "string" && name.length > INPUT_LIMITS.SETLIST_NAME) {
    return NextResponse.json(
      { error: `Name must be ${INPUT_LIMITS.SETLIST_NAME} characters or less` },
      { status: 400 },
    )
  }

  if (
    description !== undefined &&
    typeof description === "string" &&
    description.length > INPUT_LIMITS.SETLIST_DESCRIPTION
  ) {
    return NextResponse.json(
      { error: `Description must be ${INPUT_LIMITS.SETLIST_DESCRIPTION} characters or less` },
      { status: 400 },
    )
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (color !== undefined) updates.color = color
  if (icon !== undefined) updates.icon = icon
  if (sortOrder !== undefined) updates.sortOrder = sortOrder

  const [setlist] = await db
    .update(userSetlists)
    .set(updates)
    .where(eq(userSetlists.id, id))
    .returning()

  return NextResponse.json({ setlist })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const existing = await db
    .select({ id: userSetlists.id })
    .from(userSetlists)
    .where(and(eq(userSetlists.id, id), eq(userSetlists.userId, session.user.id)))
    .then(rows => rows[0])

  if (!existing) {
    return NextResponse.json({ error: "Setlist not found" }, { status: 404 })
  }

  await db.delete(userSetlists).where(eq(userSetlists.id, id))

  return NextResponse.json({ success: true })
}
