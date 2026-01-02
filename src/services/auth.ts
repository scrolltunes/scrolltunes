import { auth } from "@/auth"
import { Context, Data, Effect, Layer } from "effect"

export class AuthError extends Data.TaggedClass("AuthError")<{
  readonly cause: unknown
}> {}

export class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")<object> {}

export interface AuthenticatedUser {
  readonly id: string
  readonly email: string | null
  readonly name: string | null
}

export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  {
    /**
     * Get the current user. Returns the user or null if not authenticated.
     * Does not fail on missing auth - use requireAuth for that.
     */
    readonly getUser: () => Effect.Effect<AuthenticatedUser | null, AuthError>

    /**
     * Require authentication. Fails with UnauthorizedError if not authenticated.
     */
    readonly requireAuth: () => Effect.Effect<AuthenticatedUser, AuthError | UnauthorizedError>
  }
>() {}

const getUser = () =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return null
    }

    return {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
    } satisfies AuthenticatedUser
  })

const requireAuth = () =>
  Effect.gen(function* () {
    const user = yield* getUser()
    if (!user) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }
    return user
  })

export const AuthServiceLive = Layer.succeed(AuthService, {
  getUser,
  requireAuth,
})
