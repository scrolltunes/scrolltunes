import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"
import { loadServerConfig } from "@/services/server-config"

const { postgresUrl } = loadServerConfig()

const sql = neon(postgresUrl)

export const db = drizzle(sql, { schema })
