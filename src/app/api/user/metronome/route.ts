import { auth } from "@/auth"
import { appUserProfiles } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

interface MetronomeSettings {
  mode: "click" | "visual" | "both"
  isMuted: boolean
  volume: number
}

const getMetronome = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new UnauthorizedError({}))
  }

  const { db } = yield* DbService
  const [profile] = yield* Effect.tryPromise({
    try: () =>
      db
        .select({ preferencesJson: appUserProfiles.preferencesJson })
        .from(appUserProfiles)
        .where(eq(appUserProfiles.userId, session.user.id)),
    catch: cause => new DatabaseError({ cause }),
  })

  const preferences = profile?.preferencesJson as Record<string, unknown> | null
  const metronome = preferences?.metronome as MetronomeSettings | undefined

  return { metronome: metronome ?? null }
})

const saveMetronome = (metronome: MetronomeSettings) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService
    const [existing] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ preferencesJson: appUserProfiles.preferencesJson })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, session.user.id)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existing) {
      const currentPrefs = (existing.preferencesJson as Record<string, unknown>) ?? {}
      const updatedPrefs = { ...currentPrefs, metronome }

      yield* Effect.tryPromise({
        try: () =>
          db
            .update(appUserProfiles)
            .set({
              preferencesJson: updatedPrefs,
              updatedAt: new Date(),
            })
            .where(eq(appUserProfiles.userId, session.user.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

export async function GET() {
  const exit = await Effect.runPromiseExit(getMetronome.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to load metronome settings", exit.cause)
    return NextResponse.json({ error: "Failed to load metronome settings" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}))
  const metronome = body.metronome as MetronomeSettings | undefined

  if (!metronome || typeof metronome !== "object") {
    return NextResponse.json({ error: "Invalid metronome settings" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(saveMetronome(metronome).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to save metronome settings", exit.cause)
    return NextResponse.json({ error: "Failed to save metronome settings" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
