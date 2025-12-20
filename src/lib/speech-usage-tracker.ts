/**
 * Google Speech-to-Text API usage tracking
 *
 * Free tier: 60 minutes/month = 3600 seconds
 * Uses Vercel KV (Upstash Redis) to track monthly usage and prevent overages.
 */

import { Redis } from "@upstash/redis"
import { FetchService, type FetchError } from "@/services/fetch"
import { PublicConfig } from "@/services/public-config"
import { ServerConfig } from "@/services/server-config"
import { Context, Effect, Layer } from "effect"

const MONTHLY_SECONDS_CAP = 3600 // 60 minutes
const KV_KEY_PREFIX = "speech:usage:"
const KV_WARNED_PREFIX = "speech:warned:"
const WARNING_THRESHOLDS = [0.75, 0.85, 0.95] as const
const HIDE_THRESHOLD = 0.99 // Hide button at 99%

export interface UsageContext {
  readonly userId: string
  readonly durationSeconds: number
}

type FetchEffect = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Effect.Effect<Response, FetchError>

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

const sendUsageWarning = (
  fetchEffect: FetchEffect,
  accessKey: string,
  current: number,
  threshold: number,
  context: UsageContext,
): Effect.Effect<void, Error> => {
  const percentage = Math.round(threshold * 100)
  const monthKey = getMonthKey()
  const [year, month] = monthKey.split("-")
  const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("en-US", {
    month: "long",
  })

  return fetchEffect("https://api.web3forms.com/submit", {
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
  }).pipe(
    Effect.asVoid,
    Effect.catchAll(() => Effect.void),
  )
}

const checkAndSendWarnings = (
  redis: Redis,
  fetchEffect: FetchEffect,
  accessKey: string,
  current: number,
  context: UsageContext,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    for (const threshold of WARNING_THRESHOLDS) {
      const thresholdSeconds = Math.floor(MONTHLY_SECONDS_CAP * threshold)
      if (current < thresholdSeconds) continue
      const warnedKey = getWarnedKey(threshold)
      const alreadyWarned = yield* Effect.tryPromise({
        try: () => redis.get<boolean>(warnedKey),
        catch: error => new Error(`Failed to read warning flag: ${String(error)}`),
      })
      if (!alreadyWarned) {
        // Expire warning flags after 35 days (covers full month + buffer)
        yield* Effect.tryPromise({
          try: () => redis.set(warnedKey, true, { ex: 35 * 24 * 60 * 60 }),
          catch: error => new Error(`Failed to persist warning flag: ${String(error)}`),
        })
        yield* sendUsageWarning(fetchEffect, accessKey, current, threshold, context)
      }
    }
  })

export class SpeechUsageTracker extends Context.Tag("SpeechUsageTracker")<
  SpeechUsageTracker,
  {
    readonly checkQuotaAvailable: Effect.Effect<boolean, Error>
    readonly incrementUsage: (context: UsageContext) => Effect.Effect<void, Error>
    readonly getUsageStats: Effect.Effect<{ used: number; cap: number; percentUsed: number }, Error>
  }
>() {}

const makeSpeechUsageTracker = Effect.gen(function* () {
  const { kvRestApiUrl, kvRestApiToken } = yield* ServerConfig
  const { web3FormsAccessKey } = yield* PublicConfig
  const { fetch } = yield* FetchService

  const redis = new Redis({ url: kvRestApiUrl, token: kvRestApiToken })

  const checkQuotaAvailable: Effect.Effect<boolean, Error> = Effect.gen(function* () {
    const key = getUsageKey()
    const current = yield* Effect.tryPromise({
      try: () => redis.get<number>(key),
      catch: error => new Error(`Failed to check quota: ${String(error)}`),
    })
    if (current === null) {
      return true
    }
    const hideThresholdSeconds = Math.floor(MONTHLY_SECONDS_CAP * HIDE_THRESHOLD)
    return current < hideThresholdSeconds
  })

  const incrementUsage = (context: UsageContext): Effect.Effect<void, Error> =>
    Effect.gen(function* () {
      const key = getUsageKey()
      const current = yield* Effect.tryPromise({
        try: () => redis.get<number>(key),
        catch: error => new Error(`Failed to increment usage: ${String(error)}`),
      })
      const newCount = yield* Effect.tryPromise({
        try: () => redis.incrby(key, context.durationSeconds),
        catch: error => new Error(`Failed to increment usage: ${String(error)}`),
      })
      if (current === null) {
        // Expire usage key after 35 days (covers full month + buffer)
        yield* Effect.tryPromise({
          try: () => redis.expire(key, 35 * 24 * 60 * 60),
          catch: error => new Error(`Failed to set expiration: ${String(error)}`),
        })
      }
      yield* checkAndSendWarnings(redis, fetch, web3FormsAccessKey, newCount, context)
    })

  const getUsageStats: Effect.Effect<{ used: number; cap: number; percentUsed: number }, Error> =
    Effect.gen(function* () {
      const key = getUsageKey()
      const current = yield* Effect.tryPromise({
        try: () => redis.get<number>(key),
        catch: error => new Error(`Failed to get usage stats: ${String(error)}`),
      })
      const used = current ?? 0
      const percentUsed = Math.round((used / MONTHLY_SECONDS_CAP) * 100)
      return { used, cap: MONTHLY_SECONDS_CAP, percentUsed }
    })

  return {
    checkQuotaAvailable,
    incrementUsage,
    getUsageStats,
  }
})

export const SpeechUsageTrackerLive = Layer.effect(SpeechUsageTracker, makeSpeechUsageTracker)

/**
 * Check if quota allows usage (returns false if >= 99%)
 */
export const checkQuotaAvailable = (): Effect.Effect<boolean, Error, SpeechUsageTracker> =>
  SpeechUsageTracker.pipe(Effect.flatMap(service => service.checkQuotaAvailable))

/**
 * Increment usage after transcription
 */
export const incrementUsage = (
  context: UsageContext,
): Effect.Effect<void, Error, SpeechUsageTracker> =>
  SpeechUsageTracker.pipe(Effect.flatMap(service => service.incrementUsage(context)))

/**
 * Get current usage stats
 */
export const getUsageStats = (): Effect.Effect<
  { used: number; cap: number; percentUsed: number },
  Error,
  SpeechUsageTracker
> => SpeechUsageTracker.pipe(Effect.flatMap(service => service.getUsageStats))
