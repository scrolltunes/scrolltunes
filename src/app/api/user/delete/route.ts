import { auth } from "@/auth"
import { users } from "@/lib/db/schema"
import { AuthError, DatabaseError, UnauthorizedError, ValidationError } from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { NextResponse } from "next/server"

const deleteUser = (body: unknown) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("confirm" in body) ||
      body.confirm !== "DELETE"
    ) {
      return yield* Effect.fail(
        new ValidationError({ message: 'Invalid confirmation. Must send { confirm: "DELETE" }' }),
      )
    }

    const { db } = yield* DbService
    yield* Effect.tryPromise({
      try: () => db.delete(users).where(eq(users.id, session.user.id)),
      catch: cause => new DatabaseError({ cause }),
    })

    return null
  })

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  const exit = await Effect.runPromiseExit(deleteUser(body).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      if (cause.error instanceof UnauthorizedError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (cause.error instanceof ValidationError) {
        return NextResponse.json({ error: cause.error.message }, { status: 400 })
      }
    }
    console.error("Failed to delete user", exit.cause)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
