import { Context, Data, Effect, Layer } from "effect"

export class FetchError extends Data.TaggedClass("FetchError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class FetchService extends Context.Tag("FetchService")<
  FetchService,
  {
    readonly fetch: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Effect.Effect<Response, FetchError>
  }
>() {}

export const FetchServiceLive = Layer.succeed(FetchService, {
  fetch: (input, init) =>
    Effect.tryPromise({
      try: () => fetch(input, init),
      catch: cause => new FetchError({ message: "Network error", cause }),
    }),
})
