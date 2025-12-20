import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { Context, Data, Effect, Layer } from "effect"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import * as schema from "@/lib/db/schema"
import { ServerConfig } from "@/services/server-config"
import { ConfigLayer } from "@/services/server-base-layer"

type Database = NeonHttpDatabase<typeof schema>

export class DbConfigError extends Data.TaggedClass("DbConfigError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export type DbError = DbConfigError

export class DbService extends Context.Tag("DbService")<
  DbService,
  {
    readonly db: Database
  }
>() {}

const makeDb: Effect.Effect<Database, DbConfigError, ServerConfig> = Effect.gen(function* () {
  const { postgresUrl } = yield* ServerConfig
  const sql = neon(postgresUrl)
  return drizzle(sql, { schema })
}).pipe(
  Effect.mapError(
    cause =>
      new DbConfigError({
        message: "Failed to initialize database connection",
        cause,
      }),
  ),
)

export const DbServiceLive = Layer.effect(
  DbService,
  makeDb.pipe(Effect.map(db => ({ db }))),
)

export const DbLayer = DbServiceLive.pipe(Layer.provide(ConfigLayer))
