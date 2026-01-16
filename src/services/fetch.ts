import { Context, Data, Effect, Layer } from "effect"

export class FetchError extends Data.TaggedClass("FetchError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class HttpFetchService extends Context.Tag("HttpFetchService")<
  HttpFetchService,
  {
    readonly fetch: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Effect.Effect<Response, FetchError>
  }
>() {}

export const HttpFetchServiceLive = Layer.succeed(HttpFetchService, {
  fetch: (input, init) =>
    Effect.tryPromise({
      try: () => fetch(input, init),
      catch: cause => new FetchError({ message: "Network error", cause }),
    }),
})
