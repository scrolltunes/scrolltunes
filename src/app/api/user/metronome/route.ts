import { auth } from "@/auth"
import { db } from "@/lib/db"
import { appUserProfiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

interface MetronomeSettings {
  mode: "click" | "visual" | "both"
  isMuted: boolean
  volume: number
}

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

  const preferences = profile?.preferencesJson as Record<string, unknown> | null
  const metronome = preferences?.metronome as MetronomeSettings | undefined

  return NextResponse.json({ metronome: metronome ?? null })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const body = await request.json().catch(() => ({}))
  const metronome = body.metronome as MetronomeSettings | undefined

  if (!metronome || typeof metronome !== "object") {
    return NextResponse.json({ error: "Invalid metronome settings" }, { status: 400 })
  }

  try {
    const [existing] = await db
      .select({ preferencesJson: appUserProfiles.preferencesJson })
      .from(appUserProfiles)
      .where(eq(appUserProfiles.userId, userId))

    if (existing) {
      const currentPrefs = (existing.preferencesJson as Record<string, unknown>) ?? {}
      const updatedPrefs = { ...currentPrefs, metronome }

      await db
        .update(appUserProfiles)
        .set({
          preferencesJson: updatedPrefs,
          updatedAt: new Date(),
        })
        .where(eq(appUserProfiles.userId, userId))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save metronome settings:", error)
    return NextResponse.json({ error: "Failed to save metronome settings" }, { status: 500 })
  }
}
