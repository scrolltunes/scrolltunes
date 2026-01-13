import { withInMemoryCache } from "@/lib/bpm/bpm-cache"
import {
  type BpmProvider as BpmProviderType,
  type BpmStage,
  logBpmAttempt,
  mapErrorToReason,
} from "@/lib/bpm/bpm-log"
import type { BPMProvider } from "@/lib/bpm/bpm-provider"
import type { BPMTrackQuery } from "@/lib/bpm/bpm-types"
import { deezerBpmProvider } from "@/lib/bpm/deezer-client"
import { getSongBpmProvider } from "@/lib/bpm/getsongbpm-client"
import { rapidApiSpotifyProvider } from "@/lib/bpm/rapidapi-client"
import { reccoBeatsProvider } from "@/lib/bpm/reccobeats-client"
import { Context, Effect, Layer } from "effect"
import { PublicConfig } from "./public-config"
import { ServerConfig } from "./server-config"

// ============================================================================
// Logging Context Interface
// ============================================================================

export interface LoggingContext {
  lrclibId: number
  songId: string | undefined
  title: string
  artist: string
}

// ============================================================================
// Provider Wrapper with Logging
// ============================================================================

function wrapProviderWithLogging(
  provider: BPMProvider,
  stage: BpmStage,
  context: LoggingContext,
): BPMProvider {
  return {
    name: provider.name,
    getBpm: (query: BPMTrackQuery) => {
      const start = Date.now()
      return provider.getBpm(query).pipe(
        Effect.tap(result => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: true,
            bpm: result.bpm,
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
        Effect.tapError(error => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: false,
            errorReason: mapErrorToReason(error),
            errorDetail: String(error).slice(0, 500),
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
      )
    },
  }
}

// ============================================================================
// Service Interface
// ============================================================================

export interface BpmProvidersService {
  readonly fallbackProviders: readonly BPMProvider[]
  readonly raceProviders: readonly BPMProvider[]
  readonly lastResortProvider: BPMProvider
  /** Wrap providers with logging for a specific request context */
  readonly withLogging: (context: LoggingContext) => {
    fallbackProviders: readonly BPMProvider[]
    raceProviders: readonly BPMProvider[]
    lastResortProvider: BPMProvider
  }
}

export class BpmProviders extends Context.Tag("BpmProviders")<
  BpmProviders,
  BpmProvidersService
>() {}

const makeBpmProviders = Effect.gen(function* () {
  const publicConfig = yield* PublicConfig
  const serverConfig = yield* ServerConfig

  const withConfig = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(PublicConfig, publicConfig),
      Effect.provideService(ServerConfig, serverConfig),
    )

  const wrapProvider = <R>(provider: BPMProvider<R>) => ({
    name: provider.name,
    getBpm: (query: BPMTrackQuery) => withConfig(provider.getBpm(query)),
  })

  const fallbackProviders = [
    withInMemoryCache(wrapProvider(getSongBpmProvider)),
    withInMemoryCache(wrapProvider(deezerBpmProvider)),
  ]

  const raceProviders = [
    withInMemoryCache(wrapProvider(reccoBeatsProvider)),
    withInMemoryCache(wrapProvider(getSongBpmProvider)),
    withInMemoryCache(wrapProvider(deezerBpmProvider)),
  ]

  const lastResortProvider = withInMemoryCache(wrapProvider(rapidApiSpotifyProvider))

  const withLogging = (context: LoggingContext) => ({
    fallbackProviders: fallbackProviders.map(p =>
      wrapProviderWithLogging(p, "cascade_fallback", context),
    ),
    raceProviders: raceProviders.map(p => wrapProviderWithLogging(p, "cascade_race", context)),
    lastResortProvider: wrapProviderWithLogging(lastResortProvider, "last_resort", context),
  })

  return {
    fallbackProviders,
    raceProviders,
    lastResortProvider,
    withLogging,
  }
})

export const BpmProvidersLive = Layer.effect(BpmProviders, makeBpmProviders)
