import { Config, Context, Effect, Layer, type Option } from "effect"
import { AppConfigProviderLive } from "./config-provider"

export interface PublicConfigValues {
  readonly nodeEnv: "development" | "production" | "test"
  readonly vercelEnv: string
  readonly web3FormsAccessKey: string
  readonly gitSha: string
  readonly sttWsUrl: Option.Option<string>
}

export class PublicConfig extends Context.Tag("PublicConfig")<PublicConfig, PublicConfigValues>() {}

const publicConfig = Config.all({
  nodeEnv: Config.literal("development", "production", "test")("NODE_ENV"),
  vercelEnv: Config.string("NEXT_PUBLIC_VERCEL_ENV").pipe(Config.withDefault("development")),
  web3FormsAccessKey: Config.nonEmptyString("NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY"),
  gitSha: Config.string("NEXT_PUBLIC_GIT_SHA").pipe(Config.withDefault("dev")),
  sttWsUrl: Config.option(Config.string("NEXT_PUBLIC_STT_WS_URL")),
})

export const PublicConfigLive = Layer.effect(PublicConfig, publicConfig)

export const loadPublicConfig = (): PublicConfigValues =>
  Effect.runSync(publicConfig.pipe(Effect.provide(AppConfigProviderLive)))
