import { Config, Context, Effect, Layer, type Option } from "effect"
import { AppConfigProviderLive } from "./config-provider"

export interface DevConfigValues {
  readonly vadLogFile: Option.Option<string>
}

export class DevConfig extends Context.Tag("DevConfig")<DevConfig, DevConfigValues>() {}

const devConfig = Config.all({
  vadLogFile: Config.string("VAD_LOG_FILE").pipe(Config.option),
})

export const DevConfigLive = Layer.effect(DevConfig, devConfig)

export const loadDevConfig = (): DevConfigValues =>
  Effect.runSync(devConfig.pipe(Effect.provide(AppConfigProviderLive)))
