import { auth } from "@/auth"
import { appUserProfiles, users } from "@/lib/db/schema"
import { AuthError, DatabaseError, NotFoundError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const getMe = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: cause => new AuthError({ cause }),
  })

  if (!session?.user?.id) {
    // Return null user/profile for unauthenticated requests (not an error)
    return { user: null, profile: null }
  }

  const userId = session.user.id
  const { db } = yield* DbService

  // Fetch user and profile in parallel
  const [userResult, profileResult] = yield* Effect.all(
    [
      Effect.tryPromise({
        try: () => db.select().from(users).where(eq(users.id, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
      Effect.tryPromise({
        try: () => db.select().from(appUserProfiles).where(eq(appUserProfiles.userId, userId)),
        catch: cause => new DatabaseError({ cause }),
      }),
    ],
    { concurrency: 2 },
  )

  const user = userResult[0]
  const profile = profileResult[0]

  if (!user) {
    return yield* Effect.fail(new NotFoundError({ resource: "User", id: userId }))
  }

  return {
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
          isAdmin: profile.isAdmin,
        }
      : null,
  }
})

export async function GET() {
  const exit = await Effect.runPromiseExit(getMe.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof NotFoundError) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
    }
    console.error("Failed to get user", exit.cause)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
