import { ConfigProvider, Layer } from "effect"

const publicEnvEntries = [
  ["NODE_ENV", process.env.NODE_ENV],
  ["NEXT_PUBLIC_VERCEL_ENV", process.env.NEXT_PUBLIC_VERCEL_ENV],
  ["NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY", process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY],
  ["NEXT_PUBLIC_GIT_SHA", process.env.NEXT_PUBLIC_GIT_SHA],
  ["NEXT_PUBLIC_STT_WS_URL", process.env.NEXT_PUBLIC_STT_WS_URL],
] as const

const publicEnvMap = new Map(
  publicEnvEntries.flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
)

const publicEnvProvider = ConfigProvider.fromMap(publicEnvMap)

export const AppConfigProvider = ConfigProvider.orElse(publicEnvProvider, () =>
  ConfigProvider.fromEnv(),
)

export const AppConfigProviderLive = Layer.setConfigProvider(AppConfigProvider)
