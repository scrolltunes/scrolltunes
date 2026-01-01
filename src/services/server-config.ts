import { Config, Context, Effect, Layer, Option } from "effect"
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
  readonly tursoUrl: string | undefined
  readonly tursoAuthToken: string | undefined
  readonly tursoLrclibUrl: string | undefined
  readonly tursoLrclibAuthToken: string | undefined
  readonly tursoPlatformToken: string | undefined
  readonly tursoOrgSlug: string | undefined
  readonly tursoDbName: string | undefined
  readonly vercelUrl: string
  readonly baseUrl: string
}

export class ServerConfig extends Context.Tag("ServerConfig")<ServerConfig, ServerConfigValues>() {}

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
  tursoUrl: Config.string("TURSO_DATABASE_URL").pipe(Config.option),
  tursoAuthToken: Config.string("TURSO_AUTH_TOKEN").pipe(Config.option),
  tursoLrclibUrl: Config.string("TURSO_LRCLIB_URL").pipe(Config.option),
  tursoLrclibAuthToken: Config.string("TURSO_LRCLIB_AUTH_TOKEN").pipe(Config.option),
  tursoPlatformToken: Config.string("TURSO_PLATFORM_TOKEN").pipe(Config.option),
  tursoOrgSlug: Config.string("TURSO_ORG_SLUG").pipe(Config.option),
  tursoDbName: Config.string("TURSO_DB_NAME").pipe(Config.option),
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
      tursoUrl: Option.getOrUndefined(values.tursoUrl),
      tursoAuthToken: Option.getOrUndefined(values.tursoAuthToken),
      tursoLrclibUrl: Option.getOrUndefined(values.tursoLrclibUrl),
      tursoLrclibAuthToken: Option.getOrUndefined(values.tursoLrclibAuthToken),
      tursoPlatformToken: Option.getOrUndefined(values.tursoPlatformToken),
      tursoOrgSlug: Option.getOrUndefined(values.tursoOrgSlug),
      tursoDbName: Option.getOrUndefined(values.tursoDbName),
      baseUrl,
    }
  }),
)

export const ServerConfigLive = Layer.effect(ServerConfig, serverConfig)

export const loadServerConfig = (): ServerConfigValues =>
  Effect.runSync(serverConfig.pipe(Effect.provide(AppConfigProviderLive)))
