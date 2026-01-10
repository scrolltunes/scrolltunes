import { FetchService } from "@/services/fetch"
import { ServerBaseLayer } from "@/services/server-base-layer"
import { ServerConfig } from "@/services/server-config"
import { Context, Data, Effect, Layer } from "effect"

// --- Error Types ---

export class SpotifyAuthError extends Data.TaggedClass("SpotifyAuthError")<{
  readonly cause: unknown
}> {}

export class SpotifyAPIError extends Data.TaggedClass("SpotifyAPIError")<{
  readonly status: number
  readonly message: string
}> {}

export class SpotifyRateLimitError extends Data.TaggedClass("SpotifyRateLimitError")<{
  readonly retryAfter: number
}> {}

export type SpotifyError = SpotifyAuthError | SpotifyAPIError | SpotifyRateLimitError

// --- Spotify Types ---

export interface SpotifyImage {
  readonly url: string
  readonly height: number | null
  readonly width: number | null
}

export interface SpotifyArtist {
  readonly id: string
  readonly name: string
}

export interface SpotifyAlbum {
  readonly id: string
  readonly name: string
  readonly images: readonly SpotifyImage[]
}

export interface SpotifyExternalUrls {
  readonly spotify: string
}

export interface SpotifyTrack {
  readonly id: string
  readonly name: string
  readonly artists: readonly SpotifyArtist[]
  readonly album: SpotifyAlbum
  readonly duration_ms: number
  readonly external_urls: SpotifyExternalUrls
}

export interface SpotifySearchResult {
  readonly tracks: {
    readonly items: readonly SpotifyTrack[]
    readonly total: number
    readonly limit: number
    readonly offset: number
  }
}

export class SpotifyService extends Context.Tag("SpotifyService")<
  SpotifyService,
  {
    readonly searchTracks: (
      query: string,
      limit?: number,
    ) => Effect.Effect<SpotifySearchResult, SpotifyError>
    readonly getTrack: (trackId: string) => Effect.Effect<SpotifyTrack, SpotifyError>
  }
>() {}

// --- Token Cache ---

interface TokenCache {
  accessToken: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

// --- Internal Helpers ---

const getCredentials = () =>
  ServerConfig.pipe(
    Effect.map(config => ({
      clientId: config.spotifyClientId,
      clientSecret: config.spotifyClientSecret,
    })),
  )

const fetchResponse = (url: string, init?: RequestInit, message = "Network error") =>
  FetchService.pipe(
    Effect.flatMap(({ fetch }) =>
      fetch(url, init).pipe(Effect.mapError(() => new SpotifyAPIError({ status: 0, message }))),
    ),
  )

const fetchTokenFromSpotify = (clientId: string, clientSecret: string) =>
  Effect.gen(function* () {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const response = yield* fetchResponse("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials",
    })

    if (!response.ok) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new SpotifyAPIError({ status: response.status, message: "Auth failed" }),
      }).pipe(Effect.orElseSucceed(() => "Unknown error"))
      return yield* Effect.fail(
        new SpotifyAPIError({ status: response.status, message: `Auth failed: ${text}` }),
      )
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ access_token: string; expires_in: number }>,
      catch: () => new SpotifyAPIError({ status: 0, message: "Failed to parse response" }),
    })
  })

const fetchAccessToken = () =>
  Effect.gen(function* () {
    const now = Date.now()
    if (tokenCache && tokenCache.expiresAt > now + 60000) {
      return tokenCache.accessToken
    }

    const { clientId, clientSecret } = yield* getCredentials()
    const data = yield* fetchTokenFromSpotify(clientId, clientSecret)

    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    }

    return data.access_token
  })

const fetchFromSpotifyAPI = <T>(accessToken: string, url: string) =>
  Effect.gen(function* () {
    const response = yield* fetchResponse(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After")
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : 1
      return yield* Effect.fail(new SpotifyRateLimitError({ retryAfter }))
    }

    if (!response.ok) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new SpotifyAPIError({ status: response.status, message: "Unknown error" }),
      }).pipe(Effect.orElseSucceed(() => "Unknown error"))
      return yield* Effect.fail(new SpotifyAPIError({ status: response.status, message: text }))
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => new SpotifyAPIError({ status: 0, message: "Failed to parse response" }),
    })
  })

const withRetry = <T, R>(makeEffect: () => Effect.Effect<T, SpotifyError, R>, maxRetries = 3) => {
  const loop = (attempt: number): Effect.Effect<T, SpotifyError, R> =>
    Effect.catchTag(makeEffect(), "SpotifyRateLimitError", error => {
      if (attempt >= maxRetries) {
        console.log(`[Spotify] Rate limit: max retries (${maxRetries}) exceeded`)
        return Effect.fail(error)
      }
      const backoffMultiplier = 2 ** attempt
      const delaySeconds = error.retryAfter * backoffMultiplier
      console.log(
        `[Spotify] Rate limit hit, retry ${attempt + 1}/${maxRetries} after ${delaySeconds}s`,
      )
      return Effect.flatMap(Effect.sleep(delaySeconds * 1000), () => loop(attempt + 1))
    })
  return loop(0)
}

const spotifyFetch = <T>(path: string, params?: Record<string, string>) =>
  withRetry(() =>
    Effect.gen(function* () {
      const accessToken = yield* fetchAccessToken()

      const url = new URL(`https://api.spotify.com/v1${path}`)
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          url.searchParams.set(key, value)
        }
      }

      return yield* fetchFromSpotifyAPI<T>(accessToken, url.toString())
    }),
  )

// --- Public API (Effect-based) ---

/**
 * Format query with Spotify field filters for better matching.
 * If query contains no colons (field filters), add track: prefix.
 */
const formatSearchQuery = (query: string): string => {
  if (query.includes(":")) return query
  return `track:${query}`
}

const searchTracksRaw = (query: string, limit = 20) =>
  spotifyFetch<SpotifySearchResult>("/search", {
    q: formatSearchQuery(query),
    type: "track",
    limit: String(Math.min(50, Math.max(1, limit))),
  })

const getTrackRaw = (trackId: string) =>
  spotifyFetch<SpotifyTrack>(`/tracks/${encodeURIComponent(trackId)}`)

const makeSpotifyService = Effect.gen(function* () {
  const serverConfig = yield* ServerConfig
  const fetchService = yield* FetchService

  const provideDeps = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(ServerConfig, serverConfig),
      Effect.provideService(FetchService, fetchService),
    )

  return {
    searchTracks: (query: string, limit?: number) => provideDeps(searchTracksRaw(query, limit)),
    getTrack: (trackId: string) => provideDeps(getTrackRaw(trackId)),
  }
})

export const SpotifyServiceLive = Layer.effect(SpotifyService, makeSpotifyService)

const SpotifyRuntimeLayer = SpotifyServiceLive.pipe(Layer.provide(ServerBaseLayer))

export const searchTracksEffect = (
  query: string,
  limit = 20,
): Effect.Effect<SpotifySearchResult, SpotifyError, SpotifyService> =>
  SpotifyService.pipe(Effect.flatMap(service => service.searchTracks(query, limit)))

export const getTrackEffect = (
  trackId: string,
): Effect.Effect<SpotifyTrack, SpotifyError, SpotifyService> =>
  SpotifyService.pipe(Effect.flatMap(service => service.getTrack(trackId)))

// --- Public API (Async wrappers) ---

export async function searchTracks(query: string, limit?: number): Promise<SpotifySearchResult> {
  return Effect.runPromise(
    searchTracksEffect(query, limit).pipe(Effect.provide(SpotifyRuntimeLayer)),
  )
}

export async function getTrack(trackId: string): Promise<SpotifyTrack> {
  return Effect.runPromise(getTrackEffect(trackId).pipe(Effect.provide(SpotifyRuntimeLayer)))
}

// --- Utility Functions ---

export function clearTokenCache(): void {
  tokenCache = null
}

export function getAlbumImageUrl(
  album: SpotifyAlbum,
  size: "small" | "medium" | "large" = "medium",
): string | null {
  const images = [...album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))

  switch (size) {
    case "large":
      return images[0]?.url ?? null
    case "small":
      return images[images.length - 1]?.url ?? null
    default:
      return images[Math.floor(images.length / 2)]?.url ?? null
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

export function formatArtists(artists: readonly SpotifyArtist[]): string {
  return artists.map(a => a.name).join(", ")
}
