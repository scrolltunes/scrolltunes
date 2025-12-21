import { Effect } from "effect"
import { PublicConfig } from "./public-config"
import { ConfigLayer } from "./server-base-layer"
import { ServerConfig } from "./server-config"

const validateEnv = Effect.gen(function* () {
  yield* PublicConfig
  yield* ServerConfig
})

Effect.runSync(validateEnv.pipe(Effect.provide(ConfigLayer)))
