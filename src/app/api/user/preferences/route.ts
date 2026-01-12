import { auth } from "@/auth"
import { appUserProfiles } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getPreferences = Effect.gen(function* () {
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

  return { preferences: profile?.preferencesJson ?? null }
})

const savePreferences = (preferences: Record<string, unknown>) =>
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
          .select({ userId: appUserProfiles.userId })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, session.user.id)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (existing) {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(appUserProfiles)
            .set({
              preferencesJson: preferences,
              updatedAt: new Date(),
            })
            .where(eq(appUserProfiles.userId, session.user.id)),
        catch: cause => new DatabaseError({ cause }),
      })
    }

    return { success: true }
  })

export async function GET() {
  const exit = await Effect.runPromiseExit(getPreferences.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to load preferences", exit.cause)
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}))
  const preferences = typeof body.preferences === "object" ? body.preferences : {}

  const exit = await Effect.runPromiseExit(
    savePreferences(preferences).pipe(Effect.provide(DbLayer)),
  )

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }
    console.error("Failed to save preferences", exit.cause)
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
