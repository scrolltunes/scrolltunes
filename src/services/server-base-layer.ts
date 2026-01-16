import { Layer } from "effect"
import { AppConfigProviderLive } from "./config-provider"
import { HttpFetchServiceLive } from "./fetch"
import { PublicConfigLive } from "./public-config"
import { ServerConfigLive } from "./server-config"

export const ConfigLayer = Layer.mergeAll(PublicConfigLive, ServerConfigLive).pipe(
  Layer.provide(AppConfigProviderLive),
)

export const ServerBaseLayer = Layer.mergeAll(ConfigLayer, HttpFetchServiceLive)
