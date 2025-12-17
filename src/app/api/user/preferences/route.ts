import { auth } from "@/auth"
import { db } from "@/lib/db"
import { appUserProfiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const [profile] = await db
    .select({ preferencesJson: appUserProfiles.preferencesJson })
    .from(appUserProfiles)
    .where(eq(appUserProfiles.userId, userId))

  return NextResponse.json({ preferences: profile?.preferencesJson ?? null })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const body = await request.json().catch(() => ({}))
  const preferences = typeof body.preferences === "object" ? body.preferences : {}

  try {
    const [existing] = await db
      .select({ userId: appUserProfiles.userId })
      .from(appUserProfiles)
      .where(eq(appUserProfiles.userId, userId))

    if (existing) {
      await db
        .update(appUserProfiles)
        .set({
          preferencesJson: preferences,
          updatedAt: new Date(),
        })
        .where(eq(appUserProfiles.userId, userId))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save preferences:", error)
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 })
  }
}
