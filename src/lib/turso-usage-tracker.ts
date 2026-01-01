/**
 * Turso Usage Tracker
 *
 * Monitors Turso LRCLIB database usage via Platform API.
 * Free tier: 500M row reads/month, 10M row writes/month, 5GB storage.
 *
 * Fetches usage from Turso Platform API and sends email alerts
 * when approaching limits (80%, 90%, 95%).
 */

import { PublicConfig } from "@/services/public-config"
import { ServerConfig } from "@/services/server-config"
import { Redis } from "@upstash/redis"
import { Effect } from "effect"

const TURSO_ORG_SLUG = "hmemcpy"
const TURSO_DB_NAME = "scrolltunes-lrclib"

const MONTHLY_ROW_READ_LIMIT = 500_000_000
const WARNING_THRESHOLDS = [0.8, 0.9, 0.95] as const

const USAGE_CACHE_KEY = "turso:usage:rows_read"
const WARNED_KEY_PREFIX = "turso:warned"

interface TursoUsageResponse {
  readonly total: {
    readonly rows_read: number
    readonly rows_written: number
    readonly storage_bytes: number
  }
}

const getRedisClient: Effect.Effect<Redis, never, ServerConfig> = Effect.gen(function* () {
  const { kvRestApiUrl, kvRestApiToken } = yield* ServerConfig
  return new Redis({ url: kvRestApiUrl, token: kvRestApiToken })
})

function getMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function getNow(): string {
  return new Date().toISOString()
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  return n.toString()
}

function getSecondsUntilMonthEnd(): number {
  const now = new Date()
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return Math.floor((nextMonth.getTime() - now.getTime()) / 1000)
}

export const fetchTursoUsage = Effect.gen(function* () {
  const { tursoPlatformToken } = yield* ServerConfig

  if (!tursoPlatformToken) {
    console.log("[TURSO-USAGE] Platform token not configured")
    return yield* Effect.fail(new Error("Turso platform token not configured"))
  }

  const from = getMonthStart()
  const to = getNow()
  const url = `https://api.turso.tech/v1/organizations/${TURSO_ORG_SLUG}/databases/${TURSO_DB_NAME}/usage?from=${from}&to=${to}`

  console.log(`[TURSO-USAGE] Fetching usage from ${from} to ${to}`)

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(url, {
        headers: { Authorization: `Bearer ${tursoPlatformToken}` },
      }),
    catch: error => new Error(`Turso API request failed: ${error}`),
  })

  if (!response.ok) {
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => "Unknown error",
    })
    return yield* Effect.fail(new Error(`Turso API error ${response.status}: ${text}`))
  }

  const data = yield* Effect.tryPromise({
    try: () => response.json() as Promise<TursoUsageResponse>,
    catch: () => new Error("Failed to parse Turso API response"),
  })

  return data.total
})

const sendUsageWarning = (
  rowsRead: number,
  percentage: number,
): Effect.Effect<void, never, PublicConfig> =>
  Effect.gen(function* () {
    const { web3FormsAccessKey } = yield* PublicConfig

    yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key: web3FormsAccessKey,
            subject: `[ScrollTunes] Turso: ${percentage.toFixed(0)}% row reads used`,
            from_name: "ScrollTunes Turso Monitor",
            message: `Turso LRCLIB database usage warning:

Used: ${formatNumber(rowsRead)} / ${formatNumber(MONTHLY_ROW_READ_LIMIT)} row reads
Percentage: ${percentage.toFixed(1)}%
Remaining: ${formatNumber(MONTHLY_ROW_READ_LIMIT - rowsRead)}

Database: ${TURSO_DB_NAME}
Organization: ${TURSO_ORG_SLUG}

The free tier allows 500M row reads/month. Monitor usage at:
https://turso.tech/app`,
          }),
        }),
      catch: () => null,
    }).pipe(Effect.asVoid)
  }).pipe(Effect.catchAll(() => Effect.void))

export const checkAndCacheUsage = Effect.gen(function* () {
  const usage = yield* fetchTursoUsage
  const redis = yield* getRedisClient
  const ttl = getSecondsUntilMonthEnd()

  // Cache the current usage
  yield* Effect.tryPromise({
    try: () => redis.set(USAGE_CACHE_KEY, usage.rows_read, { ex: ttl }),
    catch: () => null,
  })

  const percentage = (usage.rows_read / MONTHLY_ROW_READ_LIMIT) * 100

  console.log(
    `[TURSO-USAGE] Current: ${formatNumber(usage.rows_read)} rows read (${percentage.toFixed(1)}%)`,
  )

  return {
    rowsRead: usage.rows_read,
    rowsWritten: usage.rows_written,
    storageBytes: usage.storage_bytes,
    percentage,
    limit: MONTHLY_ROW_READ_LIMIT,
  }
})

export const checkAndSendWarnings = Effect.gen(function* () {
  const usage = yield* checkAndCacheUsage
  const redis = yield* getRedisClient
  const ttl = getSecondsUntilMonthEnd()

  for (const threshold of WARNING_THRESHOLDS) {
    const thresholdPercent = threshold * 100
    if (usage.percentage < thresholdPercent) continue

    const warnedKey = `${WARNED_KEY_PREFIX}:${thresholdPercent}`

    const alreadyWarned = yield* Effect.tryPromise({
      try: () => redis.get<boolean>(warnedKey),
      catch: () => false,
    })

    if (!alreadyWarned) {
      console.log(`[TURSO-USAGE] Sending warning for ${thresholdPercent}% threshold`)

      yield* Effect.tryPromise({
        try: () => redis.set(warnedKey, true, { ex: ttl }),
        catch: () => null,
      })

      yield* sendUsageWarning(usage.rowsRead, usage.percentage)
    }
    break
  }

  return usage
})

export const getCachedUsage = Effect.gen(function* () {
  const redis = yield* getRedisClient

  const cached = yield* Effect.tryPromise({
    try: () => redis.get<number>(USAGE_CACHE_KEY),
    catch: () => null,
  })

  if (cached === null) {
    return null
  }

  return {
    rowsRead: cached,
    percentage: (cached / MONTHLY_ROW_READ_LIMIT) * 100,
    limit: MONTHLY_ROW_READ_LIMIT,
  }
})
