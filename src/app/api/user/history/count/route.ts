import { auth } from "@/auth"
import { db } from "@/lib/db"
import { userSongItems } from "@/lib/db/schema"
import { and, count, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 })
  }

  const result = await db
    .select({ count: count() })
    .from(userSongItems)
    .where(
      and(
        eq(userSongItems.userId, session.user.id),
        eq(userSongItems.inHistory, true),
        eq(userSongItems.deleted, false),
      ),
    )

  return NextResponse.json({ count: result[0]?.count ?? 0 })
}
