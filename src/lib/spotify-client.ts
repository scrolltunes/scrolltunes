import { Data, Effect } from "effect"

// --- Error Types ---

export class SpotifyAuthError extends Data.TaggedClass("SpotifyAuthError")<{
  readonly cause: unknown
}> {}

export class SpotifyAPIError extends Data.TaggedClass("SpotifyAPIError")<{
  readonly status: number
  readonly message: string
}> {}

export class SpotifyConfigError extends Data.TaggedClass("SpotifyConfigError")<{
  readonly message: string
}> {}

export type SpotifyError = SpotifyAuthError | SpotifyAPIError | SpotifyConfigError

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

// --- Token Cache ---

interface TokenCache {
  accessToken: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

// --- Internal Helpers ---

const getCredentials = (): Effect.Effect<
  { clientId: string; clientSecret: string },
  SpotifyConfigError
> =>
  Effect.suspend(() => {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return Effect.fail(
        new SpotifyConfigError({
          message: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables",
        })
      )
    }

    return Effect.succeed({ clientId, clientSecret })
  })

async function fetchTokenFromSpotify(
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error")
    throw new SpotifyAPIError({
      status: response.status,
      message: `Auth failed: ${text}`,
    })
  }

  return response.json()
}

const fetchAccessToken = (): Effect.Effect<string, SpotifyError> =>
  Effect.gen(function* (_) {
    const now = Date.now()
    if (tokenCache && tokenCache.expiresAt > now + 60000) {
      return tokenCache.accessToken
    }

    const { clientId, clientSecret } = yield* _(getCredentials())

    const data = yield* _(
      Effect.tryPromise({
        try: () => fetchTokenFromSpotify(clientId, clientSecret),
        catch: e => {
          if (e instanceof SpotifyAPIError) return e
          return new SpotifyAuthError({ cause: e })
        },
      })
    )

    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    }

    return data.access_token
  })

async function fetchFromSpotifyAPI<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error")
    throw new SpotifyAPIError({
      status: response.status,
      message: text,
    })
  }

  return response.json()
}

const spotifyFetch = <T>(
  path: string,
  params?: Record<string, string>
): Effect.Effect<T, SpotifyError> =>
  Effect.gen(function* (_) {
    const accessToken = yield* _(fetchAccessToken())

    const url = new URL(`https://api.spotify.com/v1${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    return yield* _(
      Effect.tryPromise({
        try: () => fetchFromSpotifyAPI<T>(accessToken, url.toString()),
        catch: e => {
          if (e instanceof SpotifyAPIError) return e
          return new SpotifyAPIError({ status: 0, message: String(e) })
        },
      })
    )
  })

// --- Public API (Effect-based) ---

export const searchTracksEffect = (
  query: string,
  limit = 20
): Effect.Effect<SpotifySearchResult, SpotifyError> =>
  spotifyFetch<SpotifySearchResult>("/search", {
    q: query,
    type: "track",
    limit: String(Math.min(50, Math.max(1, limit))),
  })

export const getTrackEffect = (trackId: string): Effect.Effect<SpotifyTrack, SpotifyError> =>
  spotifyFetch<SpotifyTrack>(`/tracks/${encodeURIComponent(trackId)}`)

// --- Public API (Async wrappers) ---

export async function searchTracks(query: string, limit?: number): Promise<SpotifySearchResult> {
  return Effect.runPromise(searchTracksEffect(query, limit))
}

export async function getTrack(trackId: string): Promise<SpotifyTrack> {
  return Effect.runPromise(getTrackEffect(trackId))
}

// --- Utility Functions ---

export function clearTokenCache(): void {
  tokenCache = null
}

export function getAlbumImageUrl(
  album: SpotifyAlbum,
  size: "small" | "medium" | "large" = "medium"
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
