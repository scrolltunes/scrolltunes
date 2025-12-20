import { Config, Context, Effect, Layer } from "effect"
import { AppConfigProviderLive } from "./config-provider"

export interface ServerConfigValues {
  readonly postgresUrl: string
  readonly authSecret: string
  readonly googleClientId: string
  readonly googleClientSecret: string
  readonly spotifyClientId: string
  readonly spotifyClientSecret: string
  readonly googleCloudProjectId: string
  readonly googleCloudClientEmail: string
  readonly googleCloudPrivateKey: string
  readonly getSongBpmApiKey: string
  readonly rapidApiKey: string
  readonly kvRestApiUrl: string
  readonly kvRestApiToken: string
  readonly vercelUrl: string
  readonly baseUrl: string
}

export class ServerConfig extends Context.Tag("ServerConfig")<
  ServerConfig,
  ServerConfigValues
>() {}

const serverConfig = Config.all({
  postgresUrl: Config.nonEmptyString("POSTGRES_URL"),
  authSecret: Config.nonEmptyString("AUTH_SECRET"),
  googleClientId: Config.nonEmptyString("GOOGLE_CLIENT_ID"),
  googleClientSecret: Config.nonEmptyString("GOOGLE_CLIENT_SECRET"),
  spotifyClientId: Config.nonEmptyString("SPOTIFY_CLIENT_ID"),
  spotifyClientSecret: Config.nonEmptyString("SPOTIFY_CLIENT_SECRET"),
  googleCloudProjectId: Config.nonEmptyString("GOOGLE_CLOUD_PROJECT_ID"),
  googleCloudClientEmail: Config.nonEmptyString("GOOGLE_CLOUD_CLIENT_EMAIL"),
  googleCloudPrivateKey: Config.nonEmptyString("GOOGLE_CLOUD_PRIVATE_KEY"),
  getSongBpmApiKey: Config.nonEmptyString("GETSONGBPM_API_KEY"),
  rapidApiKey: Config.nonEmptyString("RAPIDAPI_KEY"),
  kvRestApiUrl: Config.nonEmptyString("KV_REST_API_URL"),
  kvRestApiToken: Config.nonEmptyString("KV_REST_API_TOKEN"),
  vercelUrl: Config.string("VERCEL_URL").pipe(Config.withDefault("localhost:3000")),
}).pipe(
  Config.map(values => {
    const baseUrl = values.vercelUrl.startsWith("http")
      ? values.vercelUrl
      : values.vercelUrl === "localhost:3000"
        ? `http://${values.vercelUrl}`
        : `https://${values.vercelUrl}`

    return {
      ...values,
      baseUrl,
    }
  }),
)

export const ServerConfigLive = Layer.effect(ServerConfig, serverConfig)

export const loadServerConfig = (): ServerConfigValues =>
  Effect.runSync(serverConfig.pipe(Effect.provide(AppConfigProviderLive)))
