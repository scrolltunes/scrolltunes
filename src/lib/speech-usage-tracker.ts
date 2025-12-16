/**
 * Google Speech-to-Text API usage tracking
 *
 * Free tier: 60 minutes/month = 3600 seconds
 * Uses Vercel KV (Upstash Redis) to track monthly usage and prevent overages.
 */

import { Redis } from "@upstash/redis"
import { Effect } from "effect"

const MONTHLY_SECONDS_CAP = 3600 // 60 minutes
const KV_KEY_PREFIX = "speech:usage:"
const KV_WARNED_PREFIX = "speech:warned:"
const WARNING_THRESHOLDS = [0.75, 0.85, 0.95] as const
const HIDE_THRESHOLD = 0.99 // Hide button at 99%

interface UsageContext {
  readonly userId: string
  readonly durationSeconds: number
}

function getRedisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    return null
  }
  return new Redis({ url, token })
}

function getMonthKey(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

function getUsageKey(): string {
  return `${KV_KEY_PREFIX}${getMonthKey()}`
}

function getWarnedKey(threshold: number): string {
  return `${KV_WARNED_PREFIX}${getMonthKey()}:${threshold}`
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

async function sendUsageWarning(
  current: number,
  threshold: number,
  context: UsageContext,
): Promise<void> {
  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY
  if (!accessKey) return

  const percentage = Math.round(threshold * 100)
  const monthKey = getMonthKey()
  const [year, month] = monthKey.split("-")
  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("en-US", {
    month: "long",
  })

  try {
    await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `[ScrollTunes] Speech-to-Text usage at ${percentage}%`,
        from_name: "ScrollTunes Rate Limiter",
        message: `Google Speech-to-Text API usage warning:

Current usage: ${formatDuration(current)} / ${formatDuration(MONTHLY_SECONDS_CAP)} (${percentage}%)
Month: ${monthName} ${year}

Triggered by:
  User ID: ${context.userId}
  Duration: ${formatDuration(context.durationSeconds)}

The free tier allows 60 minutes/month. Exceeding this will incur charges.`,
      }),
    })
  } catch {
    // Silently ignore notification failures
  }
}

async function checkAndSendWarnings(
  redis: Redis,
  current: number,
  context: UsageContext,
): Promise<void> {
  for (const threshold of WARNING_THRESHOLDS) {
    const thresholdSeconds = Math.floor(MONTHLY_SECONDS_CAP * threshold)
    if (current >= thresholdSeconds) {
      const warnedKey = getWarnedKey(threshold)
      const alreadyWarned = await redis.get<boolean>(warnedKey)
      if (!alreadyWarned) {
        // Expire warning flags after 35 days (covers full month + buffer)
        await redis.set(warnedKey, true, { ex: 35 * 24 * 60 * 60 })
        await sendUsageWarning(current, threshold, context)
      }
    }
  }
}

/**
 * Check if quota allows usage (returns false if >= 99%)
 */
export function checkQuotaAvailable(): Effect.Effect<boolean, Error> {
  return Effect.tryPromise({
    try: async () => {
      const redis = getRedisClient()
      if (!redis) {
        return true // Allow if no Redis configured
      }
      const key = getUsageKey()
      const current = await redis.get<number>(key)
      if (current === null) {
        return true
      }
      const hideThresholdSeconds = Math.floor(MONTHLY_SECONDS_CAP * HIDE_THRESHOLD)
      return current < hideThresholdSeconds
    },
    catch: error => new Error(`Failed to check quota: ${String(error)}`),
  })
}

/**
 * Increment usage after transcription
 */
export function incrementUsage(context: UsageContext): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      const redis = getRedisClient()
      if (!redis) {
        return
      }
      const key = getUsageKey()
      const current = await redis.get<number>(key)
      const newCount = await redis.incrby(key, context.durationSeconds)
      if (current === null) {
        // Expire usage key after 35 days (covers full month + buffer)
        await redis.expire(key, 35 * 24 * 60 * 60)
      }
      await checkAndSendWarnings(redis, newCount, context)
    },
    catch: error => new Error(`Failed to increment usage: ${String(error)}`),
  })
}

/**
 * Get current usage stats
 */
export function getUsageStats(): Effect.Effect<
  { used: number; cap: number; percentUsed: number },
  Error
> {
  return Effect.tryPromise({
    try: async () => {
      const redis = getRedisClient()
      if (!redis) {
        return { used: 0, cap: MONTHLY_SECONDS_CAP, percentUsed: 0 }
      }
      const key = getUsageKey()
      const current = await redis.get<number>(key)
      const used = current ?? 0
      const percentUsed = Math.round((used / MONTHLY_SECONDS_CAP) * 100)
      return { used, cap: MONTHLY_SECONDS_CAP, percentUsed }
    },
    catch: error => new Error(`Failed to get usage stats: ${String(error)}`),
  })
}
