import { Context, Effect, Layer } from "effect"
import type { BPMProvider } from "@/lib/bpm/bpm-provider"
import type { BPMTrackQuery } from "@/lib/bpm/bpm-types"
import { withInMemoryCache } from "@/lib/bpm/bpm-cache"
import { deezerBpmProvider } from "@/lib/bpm/deezer-client"
import { getSongBpmProvider } from "@/lib/bpm/getsongbpm-client"
import { rapidApiSpotifyProvider } from "@/lib/bpm/rapidapi-client"
import { reccoBeatsProvider } from "@/lib/bpm/reccobeats-client"
import { PublicConfig } from "./public-config"
import { ServerConfig } from "./server-config"

export interface BpmProvidersService {
  readonly fallbackProviders: readonly BPMProvider[]
  readonly raceProviders: readonly BPMProvider[]
  readonly lastResortProvider: BPMProvider
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

  return {
    fallbackProviders,
    raceProviders,
    lastResortProvider,
  }
})

export const BpmProvidersLive = Layer.effect(BpmProviders, makeBpmProviders)
