import { auth } from "@/auth"
import { appUserProfiles, bpmFetchLog, songs } from "@/lib/db/schema"
import {
  AuthError,
  DatabaseError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors"
import { DbLayer, DbService } from "@/services/db"
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// ============================================================================
// Query Parameter Types
// ============================================================================

type Section =
  | "summary"
  | "providers"
  | "timeseries"
  | "failures"
  | "missing"
  | "errors"
  | "songDetail"
type Period = "24h" | "7d" | "30d"
type MissingType = "never" | "failed" | "problematic"

// ============================================================================
// Response Types
// ============================================================================

interface SummaryData {
  totalAttempts24h: number
  successRate: number
  songsWithoutBpm: number
  avgLatencyMs: number
}

interface ProviderBreakdown {
  provider: string
  attempts: number
  successes: number
  rate: number
  avgLatencyMs: number
}

interface TimeSeriesEntry {
  date: string
  provider: string
  attempts: number
  successes: number
}

interface FailureEntry {
  id: number
  lrclibId: number
  title: string
  artist: string
  provider: string
  errorReason: string | null
  createdAt: string
}

interface MissingSong {
  lrclibId: number | null
  songId: string | null
  title: string
  artist: string
  failedAttempts: number
}

interface ErrorBreakdown {
  provider: string
  errorReason: string
  count: number
}

interface SongDetailAttempt {
  id: number
  stage: string
  provider: string
  success: boolean
  bpm: number | null
  errorReason: string | null
  errorDetail: string | null
  latencyMs: number | null
  createdAt: string
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPeriodInterval(period: Period): string {
  switch (period) {
    case "24h":
      return "24 hours"
    case "7d":
      return "7 days"
    case "30d":
      return "30 days"
  }
}

function parseSection(value: string | null): Section | undefined {
  const valid: Section[] = [
    "summary",
    "providers",
    "timeseries",
    "failures",
    "missing",
    "errors",
    "songDetail",
  ]
  return valid.includes(value as Section) ? (value as Section) : undefined
}

function parsePeriod(value: string | null, defaultPeriod: Period): Period {
  const valid: Period[] = ["24h", "7d", "30d"]
  return valid.includes(value as Period) ? (value as Period) : defaultPeriod
}

function parseMissingType(value: string | null): MissingType {
  const valid: MissingType[] = ["never", "failed", "problematic"]
  return valid.includes(value as MissingType) ? (value as MissingType) : "never"
}

// ============================================================================
// Query Effects
// ============================================================================

const getSummary = (period: Period) =>
  Effect.gen(function* () {
    const { db } = yield* DbService
    const interval = getPeriodInterval(period)

    const [[attemptStats], [songStats]] = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () =>
            db
              .select({
                total: count(),
                successes: sql<number>`SUM(CASE WHEN ${bpmFetchLog.success} THEN 1 ELSE 0 END)::int`,
                avgLatency: sql<number>`ROUND(AVG(${bpmFetchLog.latencyMs}))::int`,
              })
              .from(bpmFetchLog)
              .where(gt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '${sql.raw(interval)}'`)),
          catch: cause => new DatabaseError({ cause }),
        }),
        Effect.tryPromise({
          try: () => db.select({ count: count() }).from(songs).where(isNull(songs.bpm)),
          catch: cause => new DatabaseError({ cause }),
        }),
      ],
      { concurrency: "unbounded" },
    )

    const total = attemptStats?.total ?? 0
    const successes = attemptStats?.successes ?? 0

    return {
      totalAttempts24h: total,
      successRate: total > 0 ? Math.round((successes / total) * 1000) / 10 : 0,
      songsWithoutBpm: songStats?.count ?? 0,
      avgLatencyMs: attemptStats?.avgLatency ?? 0,
    } satisfies SummaryData
  })

const getProviderBreakdown = (period: Period) =>
  Effect.gen(function* () {
    const { db } = yield* DbService
    const interval = getPeriodInterval(period)

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            provider: bpmFetchLog.provider,
            attempts: count(),
            successes: sql<number>`SUM(CASE WHEN ${bpmFetchLog.success} THEN 1 ELSE 0 END)::int`,
            avgLatency: sql<number>`ROUND(AVG(${bpmFetchLog.latencyMs}))::int`,
          })
          .from(bpmFetchLog)
          .where(gt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '${sql.raw(interval)}'`))
          .groupBy(bpmFetchLog.provider)
          .orderBy(desc(count())),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      provider: row.provider,
      attempts: row.attempts,
      successes: row.successes,
      rate: row.attempts > 0 ? Math.round((row.successes / row.attempts) * 1000) / 10 : 0,
      avgLatencyMs: row.avgLatency ?? 0,
    })) satisfies ProviderBreakdown[]
  })

const getTimeSeries = () =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            date: sql<string>`DATE(${bpmFetchLog.createdAt})::text`,
            provider: bpmFetchLog.provider,
            attempts: count(),
            successes: sql<number>`SUM(CASE WHEN ${bpmFetchLog.success} THEN 1 ELSE 0 END)::int`,
          })
          .from(bpmFetchLog)
          .where(gt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '30 days'`))
          .groupBy(sql`DATE(${bpmFetchLog.createdAt})`, bpmFetchLog.provider)
          .orderBy(sql`DATE(${bpmFetchLog.createdAt})`),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      date: row.date,
      provider: row.provider,
      attempts: row.attempts,
      successes: row.successes,
    })) satisfies TimeSeriesEntry[]
  })

const getFailures = (offset: number, limit: number) =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: bpmFetchLog.id,
            lrclibId: bpmFetchLog.lrclibId,
            title: bpmFetchLog.title,
            artist: bpmFetchLog.artist,
            provider: bpmFetchLog.provider,
            errorReason: bpmFetchLog.errorReason,
            createdAt: bpmFetchLog.createdAt,
          })
          .from(bpmFetchLog)
          .where(eq(bpmFetchLog.success, false))
          .orderBy(desc(bpmFetchLog.createdAt))
          .offset(offset)
          .limit(limit),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      id: row.id,
      lrclibId: row.lrclibId,
      title: row.title,
      artist: row.artist,
      provider: row.provider,
      errorReason: row.errorReason,
      createdAt: row.createdAt.toISOString(),
    })) satisfies FailureEntry[]
  })

const getMissingSongs = (missingType: MissingType, offset: number, limit: number) =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    if (missingType === "never") {
      // Songs in catalog with null BPM
      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select({
              songId: songs.id,
              title: songs.title,
              artist: songs.artist,
            })
            .from(songs)
            .where(isNull(songs.bpm))
            .orderBy(desc(songs.createdAt))
            .offset(offset)
            .limit(limit),
        catch: cause => new DatabaseError({ cause }),
      })

      return results.map(row => ({
        lrclibId: null,
        songId: row.songId,
        title: row.title,
        artist: row.artist,
        failedAttempts: 0,
      })) satisfies MissingSong[]
    }

    if (missingType === "failed") {
      // Songs where all provider attempts failed (no success)
      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .select({
              lrclibId: bpmFetchLog.lrclibId,
              songId: bpmFetchLog.songId,
              title: bpmFetchLog.title,
              artist: bpmFetchLog.artist,
              failedAttempts: count(),
            })
            .from(bpmFetchLog)
            .where(
              and(
                eq(bpmFetchLog.success, false),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${bpmFetchLog} AS b2
                  WHERE b2.lrclib_id = ${bpmFetchLog.lrclibId}
                  AND b2.success = true
                )`,
              ),
            )
            .groupBy(
              bpmFetchLog.lrclibId,
              bpmFetchLog.songId,
              bpmFetchLog.title,
              bpmFetchLog.artist,
            )
            .orderBy(desc(count()))
            .offset(offset)
            .limit(limit),
        catch: cause => new DatabaseError({ cause }),
      })

      return results.map(row => ({
        lrclibId: row.lrclibId,
        songId: row.songId,
        title: row.title,
        artist: row.artist,
        failedAttempts: row.failedAttempts,
      })) satisfies MissingSong[]
    }

    // missingType === "problematic" - Most failed attempts overall
    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            lrclibId: bpmFetchLog.lrclibId,
            songId: bpmFetchLog.songId,
            title: bpmFetchLog.title,
            artist: bpmFetchLog.artist,
            failedAttempts: count(),
          })
          .from(bpmFetchLog)
          .where(eq(bpmFetchLog.success, false))
          .groupBy(bpmFetchLog.lrclibId, bpmFetchLog.songId, bpmFetchLog.title, bpmFetchLog.artist)
          .orderBy(desc(count()))
          .offset(offset)
          .limit(limit),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      lrclibId: row.lrclibId,
      songId: row.songId,
      title: row.title,
      artist: row.artist,
      failedAttempts: row.failedAttempts,
    })) satisfies MissingSong[]
  })

const getErrorBreakdown = () =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            provider: bpmFetchLog.provider,
            errorReason: bpmFetchLog.errorReason,
            count: count(),
          })
          .from(bpmFetchLog)
          .where(eq(bpmFetchLog.success, false))
          .groupBy(bpmFetchLog.provider, bpmFetchLog.errorReason)
          .orderBy(bpmFetchLog.provider, desc(count())),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      provider: row.provider,
      errorReason: row.errorReason ?? "unknown",
      count: row.count,
    })) satisfies ErrorBreakdown[]
  })

const getSongDetail = (lrclibId: number) =>
  Effect.gen(function* () {
    const { db } = yield* DbService

    const results = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            id: bpmFetchLog.id,
            stage: bpmFetchLog.stage,
            provider: bpmFetchLog.provider,
            success: bpmFetchLog.success,
            bpm: bpmFetchLog.bpm,
            errorReason: bpmFetchLog.errorReason,
            errorDetail: bpmFetchLog.errorDetail,
            latencyMs: bpmFetchLog.latencyMs,
            createdAt: bpmFetchLog.createdAt,
          })
          .from(bpmFetchLog)
          .where(eq(bpmFetchLog.lrclibId, lrclibId))
          .orderBy(desc(bpmFetchLog.createdAt)),
      catch: cause => new DatabaseError({ cause }),
    })

    return results.map(row => ({
      id: row.id,
      stage: row.stage,
      provider: row.provider,
      success: row.success,
      bpm: row.bpm,
      errorReason: row.errorReason,
      errorDetail: row.errorDetail,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt.toISOString(),
    })) satisfies SongDetailAttempt[]
  })

// ============================================================================
// Main Effect
// ============================================================================

const getBpmStats = (searchParams: URLSearchParams) =>
  Effect.gen(function* () {
    // Auth check
    const session = yield* Effect.tryPromise({
      try: () => auth(),
      catch: cause => new AuthError({ cause }),
    })

    if (!session?.user?.id) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    const { db } = yield* DbService

    const [profile] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ isAdmin: appUserProfiles.isAdmin })
          .from(appUserProfiles)
          .where(eq(appUserProfiles.userId, session.user.id)),
      catch: cause => new DatabaseError({ cause }),
    })

    if (!profile?.isAdmin) {
      return yield* Effect.fail(new ForbiddenError({}))
    }

    // Parse query params
    const section = parseSection(searchParams.get("section"))
    const period = parsePeriod(searchParams.get("period"), "24h")
    const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10)
    const limit = Math.min(Number.parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const missingType = parseMissingType(searchParams.get("missingType"))
    const lrclibIdParam = searchParams.get("lrclibId")
    const lrclibId = lrclibIdParam ? Number.parseInt(lrclibIdParam, 10) : undefined

    if (!section) {
      return yield* Effect.fail(
        new ValidationError({ message: "Missing required 'section' parameter" }),
      )
    }

    // Execute appropriate query based on section
    switch (section) {
      case "summary":
        return yield* getSummary(period)
      case "providers":
        return yield* getProviderBreakdown(period)
      case "timeseries":
        return yield* getTimeSeries()
      case "failures":
        return yield* getFailures(offset, limit)
      case "missing":
        return yield* getMissingSongs(missingType, offset, limit)
      case "errors":
        return yield* getErrorBreakdown()
      case "songDetail": {
        if (lrclibId === undefined || Number.isNaN(lrclibId)) {
          return yield* Effect.fail(
            new ValidationError({
              message: "Missing required 'lrclibId' parameter for songDetail",
            }),
          )
        }
        return yield* getSongDetail(lrclibId)
      }
    }
  })

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const exit = await Effect.runPromiseExit(getBpmStats(searchParams).pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "ForbiddenError") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (error._tag === "ValidationError") {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    console.error("[BPM Stats] Failed to fetch stats", exit.cause)
    return NextResponse.json({ error: "Failed to fetch BPM stats" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
