import { Effect } from "effect"
import { ConfigLayer } from "./server-base-layer"
import { PublicConfig } from "./public-config"
import { ServerConfig } from "./server-config"

const validateEnv = Effect.gen(function* () {
  yield* PublicConfig
  yield* ServerConfig
})

Effect.runSync(
  validateEnv.pipe(Effect.provide(ConfigLayer)),
)
