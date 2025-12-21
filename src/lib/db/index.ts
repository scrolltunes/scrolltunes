import { loadServerConfig } from "@/services/server-config"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const { postgresUrl } = loadServerConfig()

const sql = neon(postgresUrl)

export const db = drizzle(sql, { schema })
