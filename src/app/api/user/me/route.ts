import { auth } from "@/auth"
import { db } from "@/lib/db"
import { appUserProfiles, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [user] = await db.select().from(users).where(eq(users.id, userId))

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const [profile] = await db
    .select()
    .from(appUserProfiles)
    .where(eq(appUserProfiles.userId, userId))

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    profile: profile
      ? {
          consentVersion: profile.consentVersion,
          consentGivenAt: profile.consentGivenAt.toISOString(),
          displayName: profile.displayName,
        }
      : null,
  })
}
