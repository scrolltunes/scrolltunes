import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()

  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Invalid confirmation. Must send { confirm: "DELETE" }' },
      { status: 400 },
    )
  }

  const userId = session.user.id

  await db.delete(users).where(eq(users.id, userId))

  return new NextResponse(null, { status: 204 })
}
