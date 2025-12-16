import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { asc, count, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const setlistsWithCounts = await db
    .select({
      id: userSetlists.id,
      name: userSetlists.name,
      description: userSetlists.description,
      color: userSetlists.color,
      icon: userSetlists.icon,
      sortOrder: userSetlists.sortOrder,
      songCount: count(userSetlistSongs.id),
    })
    .from(userSetlists)
    .leftJoin(userSetlistSongs, eq(userSetlists.id, userSetlistSongs.setlistId))
    .where(eq(userSetlists.userId, session.user.id))
    .groupBy(userSetlists.id)
    .orderBy(asc(userSetlists.sortOrder))

  return NextResponse.json({ setlists: setlistsWithCounts })
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
