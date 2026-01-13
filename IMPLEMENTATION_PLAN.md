# BPM Analytics Admin Implementation Plan

## Overview

Implement BPM fetch logging, admin dashboard for analytics, and a comprehensive tracks browser for manual enrichment.

## Architectural Requirements

**All code MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

### Key Requirements

| Requirement | Pattern | Anti-Pattern |
|-------------|---------|--------------|
| Fire-and-forget | `Effect.runFork(effect.pipe(Effect.ignore))` | `.then().catch()`, `void fetch().catch()` |
| API routes | `Effect.runPromiseExit()` + pattern match | `try/catch` with raw `await` |
| Async operations | `Effect.tryPromise()` with tagged errors | Raw `Promise` or `async/await` |
| Error handling | Tagged error classes via `Data.TaggedClass` | Plain `Error` or string throws |
| Dependencies | `Layer` and `Context.Tag` | Direct imports of singletons |

### Fire-and-Forget Pattern (from architecture.md)

```typescript
// ✅ Correct: Effect.runFork with Effect.ignore
Effect.runFork(
  someEffect.pipe(Effect.ignore)
)

// ✅ Correct: Effect.runFork with explicit error recovery
Effect.runFork(
  someEffect.pipe(
    Effect.catchAll(() => Effect.sync(() => {
      console.error("Operation failed")
    }))
  )
)

// ❌ Wrong: Promise .catch(() => {})
fetch(url).catch(() => {})

// ❌ Wrong: void fetch().catch()
void fetch(url).catch(() => {})
```

### API Route Pattern (from architecture.md)

```typescript
export async function GET() {
  const exit = await Effect.runPromiseExit(myEffect.pipe(Effect.provide(DbLayer)))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "UnauthorizedError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      // ... handle other error tags
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }

  return NextResponse.json(exit.value)
}
```

---

## Validation Command

```bash
bun run check
```

This runs: `biome check . && bun run typecheck && bun run test`

---

## Gap Analysis

**Analysis Date**: 2026-01-13 (Verified against source files)

### Phase 1: Schema + Logging

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `bpmFetchLog` table | ✅ Already exists in `schema.ts` lines 421-443 | None - DONE |
| `serial` import | ✅ Already imported (line 11) | None - DONE |
| Type exports | ✅ `BpmFetchLog`, `NewBpmFetchLog` exist (lines 491-492) | None - DONE |
| Migration | ✅ Uses `db:push` workflow (drizzle/ is gitignored) | Run `bun run db:push` - DONE |
| `bpm-log.ts` types | Does not exist | Create new file with types + logging helper |

### Phase 2: Instrumentation

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `fireAndForgetBpmFetch` | Lines 243-300 in `song-loader.ts`, params: `(songId, title, artist, spotifyId)` | Add `lrclibId` param after `songId` |
| Call site | Line 541 in `song-loader.ts` | Update to pass `actualLrclibId` |
| Turso lookup | Lines 514-543, uses `.then().catch()` on line 536-537 | Add timing + logging calls |
| `bpm-providers.ts` | 59 lines, current interface at lines 12-16 has NO `withLogging` | Add `wrapProviderWithLogging` + `withLogging` method |

**Critical Detail**: The current Turso caching on lines 528-537 uses `.then().catch()` which violates Effect.ts patterns - but this is existing code for caching, not logging. The new logging should use `Effect.runFork`.

### Phase 3: Dashboard

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `/admin/bpm-stats` | Does not exist | Create new page |
| BPM stats API | Does not exist | Create `/api/admin/bpm-stats/route.ts` |
| Components | None exist | Create 7 new components in `src/components/admin/` |
| Admin sidebar | Lines 336-354 in `admin/page.tsx`, has "Tools" section | Add "BPM Analytics" link |
| Mobile tabs | Lines 270-306, has hardcoded tabs | Add "BPM Stats" tab |
| Recharts | ✅ Already in project (`package.json`) | No install needed |

**Pattern Reference**: `src/app/api/admin/stats/route.ts` shows exact Effect.ts API pattern with:
- `Effect.gen` for composing queries
- `DbLayer` for database dependency
- `UnauthorizedError`, `ForbiddenError`, `DatabaseError` tagged errors from `@/lib/errors`
- `Effect.runPromiseExit()` with pattern matching

### Phase 4: Cron

| Item | Current State | Required Change |
|------|---------------|-----------------|
| Cleanup endpoint | Does not exist | Create `/api/cron/cleanup-bpm-log/route.ts` |
| `vercel.json` | 1 cron at line 4-7 (`/api/cron/turso-usage` at `0 6 * * *`) | Add second cron entry |

### Phase 5: Tracks Browser

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `/admin/songs` page | 972 lines, Neon-only via `/api/admin/songs` | Replace with Turso-first implementation |
| Current filters | Lines 54, 795-807: `all\|synced\|enhanced\|unenhanced` | Change to `all\|missing_spotify\|has_spotify\|in_catalog\|missing_bpm` |
| Current components | `SongCard` (239-461), `SongRow` (463-653) - both load album art via `/api/lyrics/` | Reuse pattern, add expansion |
| Tracks API | Does not exist | Create `/api/admin/tracks/route.ts` |
| Enrichment APIs | Do not exist | Create 4 new API routes |
| TursoService | ✅ Exists at `src/services/turso.ts` with `search`, `getById`, `findByTitleArtist` | Need paginated search with filter support |

**TursoService Details** (verified in `src/services/turso.ts`):
- Line 78-127: `search(query, limit)` - FTS5 search with popularity ordering
- Line 129-169: `getById(lrclibId)` - Get single track by ID
- Line 171-240: `findByTitleArtist(title, artist, targetDurationSec?)` - Best match search
- Need to add: `searchWithFilters(query, filter, sort, offset, limit)` for admin tracks browser

---

## Specs Reference

| Spec | Description | Status |
|------|-------------|--------|
| [bpm-analytics-schema](specs/bpm-analytics-schema.md) | Database schema and types | ✅ Done |
| [bpm-logging-helper](specs/bpm-logging-helper.md) | Fire-and-forget logging function | ✅ Done |
| [bpm-instrumentation](specs/bpm-instrumentation.md) | Instrument Turso and provider cascade | ✅ Done |
| [bpm-admin-dashboard](specs/bpm-admin-dashboard.md) | Admin page with analytics | Pending |
| [bpm-retention-cleanup](specs/bpm-retention-cleanup.md) | 90-day log retention cron | Pending |
| [bpm-admin-tracks-browser](specs/bpm-admin-tracks-browser.md) | Full LRCLIB tracks browser with enrichment | Pending |

---

## Phase 1: Foundation (P0)

### Task 1.1: Add `bpmFetchLog` Table to Schema

**Status**: ✅ COMPLETE

The schema has already been added to `src/lib/db/schema.ts`:
- `bpmFetchLog` table defined at lines 421-443
- `serial` import already present at line 11
- Type exports `BpmFetchLog` and `NewBpmFetchLog` at lines 491-492

**Acceptance Criteria**:
- [x] `serial` added to imports from `drizzle-orm/pg-core`
- [x] `bpmFetchLog` table added to schema with all columns
- [x] Three indexes defined: lrclib_id, created_at+provider, created_at
- [x] Type exports added: `BpmFetchLog`, `NewBpmFetchLog`
- [x] `bun run typecheck` passes

---

### Task 1.2: Apply Database Migration

**Status**: ✅ COMPLETE

**Note**: This project uses Drizzle's push workflow (`bun run db:push`) instead of migration files. The `drizzle/` directory is gitignored. Since Task 1.1 added the schema to `src/lib/db/schema.ts`, running `bun run db:push` will create the table.

Run `bun run db:push` to apply the schema to the database.

**Acceptance Criteria**:
- [x] Schema defined in `src/lib/db/schema.ts` (Task 1.1)
- [x] Run `bun run db:push` to apply to database

---

### Task 1.3: Create Logging Types and Helper

**Status**: ✅ COMPLETE

**Files**: `src/lib/bpm/bpm-log.ts` (new file)

```typescript
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { Data, Effect } from "effect"

// ============================================================================
// Types
// ============================================================================

export type BpmProvider =
  | "Turso"
  | "GetSongBPM"
  | "Deezer"
  | "ReccoBeats"
  | "RapidAPISpotify"

export type BpmStage =
  | "turso_embedded"
  | "cascade_fallback"
  | "cascade_race"
  | "last_resort"

export type BpmErrorReason =
  | "not_found"
  | "rate_limit"
  | "api_error"
  | "timeout"
  | "unknown"

export interface BpmLogEntry {
  lrclibId: number
  songId?: string
  title: string
  artist: string
  stage: BpmStage
  provider: BpmProvider
  success: boolean
  bpm?: number
  errorReason?: BpmErrorReason
  errorDetail?: string
  latencyMs?: number
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map error to standardized reason code.
 */
export function mapErrorToReason(error: unknown): BpmErrorReason {
  const message = String(error).toLowerCase()
  if (message.includes("not found") || message.includes("404")) return "not_found"
  if (message.includes("rate limit") || message.includes("429")) return "rate_limit"
  if (message.includes("timeout") || message.includes("timed out")) return "timeout"
  if (message.includes("api") || message.includes("500") || message.includes("503")) return "api_error"
  return "unknown"
}

/**
 * Fire-and-forget BPM attempt logging.
 * Uses Effect.runFork per architecture.md requirements.
 */
export function logBpmAttempt(entry: BpmLogEntry): void {
  const insertEffect = Effect.tryPromise({
    try: () =>
      db.insert(bpmFetchLog).values({
        lrclibId: entry.lrclibId,
        songId: entry.songId ?? null,
        title: entry.title,
        artist: entry.artist,
        stage: entry.stage,
        provider: entry.provider,
        success: entry.success,
        bpm: entry.bpm ?? null,
        errorReason: entry.errorReason ?? null,
        errorDetail: entry.errorDetail?.slice(0, 500) ?? null,
        latencyMs: entry.latencyMs ?? null,
      }),
    catch: error => new BpmLogInsertError({ cause: error }),
  })

  Effect.runFork(
    insertEffect.pipe(
      Effect.catchAll(err =>
        Effect.sync(() => console.error("[BPM Log] Insert failed:", err.cause)),
      ),
    ),
  )
}

// Tagged error for logging failures
class BpmLogInsertError extends Data.TaggedClass("BpmLogInsertError")<{
  readonly cause: unknown
}> {}
```

**Acceptance Criteria**:
- [x] File created at `src/lib/bpm/bpm-log.ts`
- [x] All types exported: `BpmProvider`, `BpmStage`, `BpmErrorReason`, `BpmLogEntry`
- [x] `logBpmAttempt` uses `Effect.runFork` (NOT `.then().catch()`)
- [x] `BpmLogInsertError` tagged error class defined
- [x] `mapErrorToReason` helper function exported
- [x] `errorDetail` truncated to 500 chars
- [x] `bun run typecheck` passes

---

## Phase 2: Instrumentation (P1)

**Dependencies**: Phase 1 must be complete.

### Task 2.1: Update `fireAndForgetBpmFetch` Signature

**Status**: ✅ COMPLETE

**Files**: `src/services/song-loader.ts`

**Current signature** (line 243-248):
```typescript
function fireAndForgetBpmFetch(
  songId: string,
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

**Updated signature**:
```typescript
function fireAndForgetBpmFetch(
  songId: string,
  lrclibId: number,
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

**Call site update** (line 541):
```typescript
// Before:
fireAndForgetBpmFetch(cachedSong.songId, lyrics.title, lyrics.artist, resolvedSpotifyId)

// After:
fireAndForgetBpmFetch(cachedSong.songId, actualLrclibId, lyrics.title, lyrics.artist, resolvedSpotifyId)
```

**Acceptance Criteria**:
- [x] Function signature updated with `lrclibId: number` parameter
- [x] Call site updated to pass `actualLrclibId`
- [x] `bun run typecheck` passes

---

### Task 2.2: Instrument Turso Embedded Tempo Lookup

**Status**: ✅ COMPLETE

**Files**: `src/services/song-loader.ts`

Added import for `logBpmAttempt` and timing/logging calls around the Turso embedded tempo lookup.

**Note**: Also updated `src/lib/bpm/bpm-log.ts` to fix `BpmLogEntry` interface for `exactOptionalPropertyTypes` compatibility by adding `| undefined` to optional properties.

**Acceptance Criteria**:
- [x] Import added for `logBpmAttempt`
- [x] Timing captured for Turso lookup
- [x] Success case logs with BPM value
- [x] Failure case logs with "not_found" reason
- [x] Logging is non-blocking
- [x] `bun run typecheck` passes

---

### Task 2.3: Instrument Provider Cascade

**Status**: ✅ COMPLETE

**Files**: `src/services/bpm-providers.ts`

Add imports and modify the provider creation to wrap with logging:

```typescript
import { withInMemoryCache } from "@/lib/bpm/bpm-cache"
import type { BPMProvider } from "@/lib/bpm/bpm-provider"
import type { BPMTrackQuery } from "@/lib/bpm/bpm-types"
import { deezerBpmProvider } from "@/lib/bpm/deezer-client"
import { getSongBpmProvider } from "@/lib/bpm/getsongbpm-client"
import { rapidApiSpotifyProvider } from "@/lib/bpm/rapidapi-client"
import { reccoBeatsProvider } from "@/lib/bpm/reccobeats-client"
import {
  logBpmAttempt,
  mapErrorToReason,
  type BpmProvider as BpmProviderType,
  type BpmStage,
} from "@/lib/bpm/bpm-log"
import { Context, Effect, Layer } from "effect"
import { PublicConfig } from "./public-config"
import { ServerConfig } from "./server-config"

// ============================================================================
// Logging Context Interface
// ============================================================================

export interface LoggingContext {
  lrclibId: number
  songId: string | undefined
  title: string
  artist: string
}

// ============================================================================
// Provider Wrapper with Logging
// ============================================================================

function wrapProviderWithLogging(
  provider: BPMProvider,
  stage: BpmStage,
  context: LoggingContext,
): BPMProvider {
  return {
    name: provider.name,
    getBpm: (query: BPMTrackQuery) => {
      const start = Date.now()
      return provider.getBpm(query).pipe(
        Effect.tap(result => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: true,
            bpm: result.bpm,
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
        Effect.tapError(error => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: false,
            errorReason: mapErrorToReason(error),
            errorDetail: String(error).slice(0, 500),
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
      )
    },
  }
}

// ============================================================================
// Service Interface (updated)
// ============================================================================

export interface BpmProvidersService {
  readonly fallbackProviders: readonly BPMProvider[]
  readonly raceProviders: readonly BPMProvider[]
  readonly lastResortProvider: BPMProvider
  /** Wrap providers with logging for a specific request context */
  readonly withLogging: (context: LoggingContext) => {
    fallbackProviders: readonly BPMProvider[]
    raceProviders: readonly BPMProvider[]
    lastResortProvider: BPMProvider
  }
}

export class BpmProviders extends Context.Tag("BpmProviders")<
  BpmProviders,
  BpmProvidersService
>() {}

const makeBpmProviders = Effect.gen(function* () {
  const publicConfig = yield* PublicConfig
  const serverConfig = yield* ServerConfig

  const withConfig = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(PublicConfig, publicConfig),
      Effect.provideService(ServerConfig, serverConfig),
    )

  const wrapProvider = <R>(provider: BPMProvider<R>) => ({
    name: provider.name,
    getBpm: (query: BPMTrackQuery) => withConfig(provider.getBpm(query)),
  })

  const fallbackProviders = [
    withInMemoryCache(wrapProvider(getSongBpmProvider)),
    withInMemoryCache(wrapProvider(deezerBpmProvider)),
  ]

  const raceProviders = [
    withInMemoryCache(wrapProvider(reccoBeatsProvider)),
    withInMemoryCache(wrapProvider(getSongBpmProvider)),
    withInMemoryCache(wrapProvider(deezerBpmProvider)),
  ]

  const lastResortProvider = withInMemoryCache(wrapProvider(rapidApiSpotifyProvider))

  const withLogging = (context: LoggingContext) => ({
    fallbackProviders: fallbackProviders.map(p =>
      wrapProviderWithLogging(p, "cascade_fallback", context),
    ),
    raceProviders: raceProviders.map(p =>
      wrapProviderWithLogging(p, "cascade_race", context),
    ),
    lastResortProvider: wrapProviderWithLogging(lastResortProvider, "last_resort", context),
  })

  return {
    fallbackProviders,
    raceProviders,
    lastResortProvider,
    withLogging,
  }
})

export const BpmProvidersLive = Layer.effect(BpmProviders, makeBpmProviders)
```

**Then update** `src/services/song-loader.ts` `fireAndForgetBpmFetch` function (lines 243-300) to use logging:

```typescript
function fireAndForgetBpmFetch(
  songId: string,
  lrclibId: number,
  title: string,
  artist: string,
  spotifyId: string | undefined,
) {
  const loggingContext = { lrclibId, songId, title, artist }

  const bpmEffect = BpmProviders.pipe(
    Effect.flatMap(service => {
      const { fallbackProviders, raceProviders, lastResortProvider } = service.withLogging(loggingContext)
      const bpmQuery = { title, artist, spotifyId }

      const primaryBpmEffect = spotifyId
        ? getBpmRace(raceProviders, bpmQuery)
        : getBpmWithFallback(fallbackProviders, bpmQuery)

      const bpmWithLastResort = spotifyId
        ? primaryBpmEffect.pipe(
            Effect.catchAll(error =>
              error._tag === "BPMNotFoundError"
                ? lastResortProvider.getBpm(bpmQuery)
                : Effect.fail(error),
            ),
          )
        : primaryBpmEffect

      return bpmWithLastResort.pipe(
        Effect.catchAll(error => {
          if (error._tag === "BPMAPIError") {
            console.error("BPM API error:", error.status, error.message)
          }
          return Effect.succeed(null)
        }),
        Effect.catchAllDefect(defect => {
          console.error("BPM defect:", defect)
          return Effect.succeed(null)
        }),
      )
    }),
    Effect.flatMap(bpmResult => {
      if (!bpmResult) return Effect.succeed(null)
      return Effect.promise(async () => {
        await db
          .update(songs)
          .set({
            bpm: bpmResult.bpm,
            musicalKey: bpmResult.key ?? null,
            bpmSource: bpmResult.source,
            updatedAt: new Date(),
          })
          .where(eq(songs.id, songId))
        return bpmResult
      })
    }),
  )

  Effect.runPromise(bpmEffect.pipe(Effect.provide(ServerLayer))).catch(err =>
    console.error("[BPM] Background fetch failed:", err),
  )
}
```

**Acceptance Criteria**:
- [x] `LoggingContext` interface added
- [x] `wrapProviderWithLogging` function created
- [x] `withLogging` method added to `BpmProvidersService`
- [x] `song-loader.ts` uses `withLogging` for cascade
- [x] Each provider attempt is logged with correct stage
- [x] Errors are captured with reason and truncated detail
- [x] `bun run typecheck` passes

---

## Phase 3: BPM Analytics Dashboard (P2)

**Dependencies**: Phase 2 must be complete (needs data to display).
**Can run in parallel with**: Phase 5 (Tracks Browser).

### Task 3.1: BPM Stats API Endpoint

**Status**: ✅ COMPLETE

**Files**: `src/app/api/admin/bpm-stats/route.ts` (new file)

Create API endpoint following the pattern from `src/app/api/admin/stats/route.ts`:
- Use Effect.ts for async operations
- Auth check via `auth()` and `isAdmin` from profile
- Support query params: `section`, `period`, `offset`, `limit`, `missingType`

See `specs/bpm-admin-dashboard.md` for full query details.

**Acceptance Criteria**:
- [x] Route created with admin auth check
- [x] Summary query returns: total attempts, success rate, songs without BPM, avg latency
- [x] Provider breakdown query works
- [x] Time-series query returns 30 days of data
- [x] Failures query with pagination
- [x] Missing songs queries for all three types
- [x] Error breakdown query works

---

### Task 3.2: Summary Cards Component

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmStatsCards.tsx` (new file)

Display 4 stat cards:
- Total attempts (24h)
- Success rate (%)
- Songs without BPM
- Avg latency (ms)

Follow styling from `src/app/admin/page.tsx` `StatCard` component.

**Acceptance Criteria**:
- [x] 4 stat cards render
- [x] Loading skeleton state
- [x] Uses CSS variables for styling

---

### Task 3.3: Provider Table Component

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmProviderTable.tsx` (new file)

Table with columns: Provider, Attempts, Successes, Rate (%), Avg Latency.

**Acceptance Criteria**:
- [x] Table renders provider breakdown
- [x] Sorted by attempts descending
- [x] Success rate calculated correctly

---

### Task 3.4: Time-Series Chart Component

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmTimeSeriesChart.tsx` (new file)

Use `recharts` for stacked bar chart. Note: recharts was installed as it was not already in the project.

**Acceptance Criteria**:
- [x] Chart renders 30 days of data
- [x] Stacked by provider
- [x] Responsive width

---

### Task 3.5: Failures List Component

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmFailuresList.tsx` (new file)

Paginated list of recent failures with click-to-drill-down support.

**Acceptance Criteria**:
- [x] List renders recent failures
- [x] Shows title, artist, provider, error reason, timestamp
- [x] Pagination controls work
- [x] Empty state when no failures

---

### Task 3.6: Missing Songs Component

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmMissingSongs.tsx` (new file)

Three tabs:
1. Never had BPM
2. All attempts failed
3. Most problematic (highest fail count)

**Acceptance Criteria**:
- [x] Tab switching works
- [x] Each tab shows paginated list
- [x] Click song triggers drill-down

---

### Task 3.7: Error Breakdown Component

**Files**: `src/components/admin/BpmErrorBreakdown.tsx` (new file)

Pivot table grouped by provider and error reason.

**Acceptance Criteria**:
- [x] Table renders error counts
- [x] Grouped by provider
- [x] Shows all error reasons

---

### Task 3.8: Song Detail Drill-Down

**Status**: ✅ COMPLETE

**Files**: `src/components/admin/BpmSongDetail.tsx` (new file)

Modal showing all BPM fetch attempts for a single song. Also added `songDetail` section to the BPM stats API (`/api/admin/bpm-stats?section=songDetail&lrclibId=X`).

**Acceptance Criteria**:
- [x] Modal opens on song click
- [x] Shows all attempts chronologically
- [x] Close button works

---

### Task 3.9: Dashboard Page

**Files**: `src/app/admin/bpm-stats/page.tsx` (new file)

Compose all components into dashboard page.

**Acceptance Criteria**:
- [ ] Page renders at `/admin/bpm-stats`
- [ ] Admin auth check
- [ ] All sections visible
- [ ] Mobile responsive
- [ ] Add link from main admin page sidebar

---

## Phase 4: Maintenance (P3)

**Dependencies**: Phase 1 must be complete.

### Task 4.1: Retention Cleanup Cron

**Files**:
- `src/app/api/cron/cleanup-bpm-log/route.ts` (new file)
- `vercel.json` (modify)

```typescript
// src/app/api/cron/cleanup-bpm-log/route.ts
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { DatabaseError, UnauthorizedError } from "@/lib/errors"
import { lt, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

// Tagged error for auth failures specific to cron
class CronAuthError extends Data.TaggedClass("CronAuthError")<object> {}

const cleanupBpmLog = (authHeader: string | null) =>
  Effect.gen(function* () {
    // Verify cron secret
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return yield* Effect.fail(new CronAuthError({}))
    }

    // Delete old records
    const result = yield* Effect.tryPromise({
      try: () =>
        db
          .delete(bpmFetchLog)
          .where(lt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '90 days'`)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { deleted: result.rowCount ?? 0 }
  })

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const exit = await Effect.runPromiseExit(cleanupBpmLog(authHeader))

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (cause._tag === "Fail") {
      const error = cause.error
      if (error._tag === "CronAuthError") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (error._tag === "DatabaseError") {
        console.error("[BPM Cleanup] Database error:", error.cause)
        return NextResponse.json(
          { success: false, error: "Database error" },
          { status: 500 },
        )
      }
    }
    console.error("[BPM Cleanup] Failed:", exit.cause)
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, ...exit.value })
}
```

Update `vercel.json`:
```json
{
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/turso-usage",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/cleanup-bpm-log",
      "schedule": "0 3 * * *"
    }
  ]
}
```

**Acceptance Criteria**:
- [ ] Endpoint created at `/api/cron/cleanup-bpm-log`
- [ ] Uses `Effect.runPromiseExit()` pattern (NOT try/catch)
- [ ] Tagged error classes for auth and database errors
- [ ] Protected with `CRON_SECRET` bearer token
- [ ] Deletes records older than 90 days
- [ ] Returns count of deleted records
- [ ] `vercel.json` updated with cron schedule
- [ ] `bun run typecheck` passes

---

## Phase 5: Admin Tracks Browser (P2)

**Dependencies**: Phase 1 for schema (if using bpmFetchLog).
**Can run in parallel with**: Phase 3 (Dashboard).

### Task 5.1: Tracks List API Endpoint

**Files**: `src/app/api/admin/tracks/route.ts` (new file)

Query Turso tracks with optional Neon join for catalog status.

**Query params**:
- `q` - FTS5 search query
- `filter` - `all` | `missing_spotify` | `has_spotify` | `in_catalog` | `missing_bpm`
- `sort` - `popular` | `recent` | `alpha`
- `offset`, `limit`

**Response**: `TrackWithEnrichment[]` as defined in spec.

**Acceptance Criteria**:
- [ ] Returns paginated Turso tracks
- [ ] FTS5 search with MATCH syntax
- [ ] All filters work correctly
- [ ] Includes Neon enrichment status via join

---

### Task 5.2: Copy Enrichment API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts` (new file)

Copy Turso enrichment (spotifyId, tempo, key, albumArt) to Neon.

**Acceptance Criteria**:
- [ ] Creates Neon song entry if needed
- [ ] Creates `songLrclibIds` mapping
- [ ] Copies all enrichment fields
- [ ] Sets `bpmSource = "Turso"`

---

### Task 5.3: Spotify Search API Endpoint

**Files**: `src/app/api/admin/spotify/search/route.ts` (new file)

Search Spotify API for matching tracks.

**Acceptance Criteria**:
- [ ] Accepts `q` query param
- [ ] Returns top 5 results
- [ ] Handles rate limits gracefully

---

### Task 5.4: Link Spotify API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/link-spotify/route.ts` (new file)

Link a Spotify track and fetch audio features.

**Acceptance Criteria**:
- [ ] Fetches Spotify audio features
- [ ] Creates Neon entry if needed
- [ ] Saves enrichment data
- [ ] Sets `bpmSource = "Spotify"`

---

### Task 5.5: Fetch BPM API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/fetch-bpm/route.ts` (new file)

Trigger BPM provider cascade synchronously.

**Acceptance Criteria**:
- [ ] Triggers provider cascade
- [ ] Returns all attempts with success/failure
- [ ] Saves successful result to Neon

---

### Task 5.6: TracksFilterBar Component

**Files**: `src/components/admin/TracksFilterBar.tsx` (new file)

Filter chips: All, Missing Spotify, Has Spotify, In Catalog, Missing BPM.

**Acceptance Criteria**:
- [ ] Chips render and are clickable
- [ ] Active state styling
- [ ] Filter change callback works

---

### Task 5.7: TracksList Component

**Files**: `src/components/admin/TracksList.tsx` (new file)

Paginated table with expansion for detail panel.

**Acceptance Criteria**:
- [ ] List renders with pagination
- [ ] Columns: Art, Title/Artist, Duration, BPM, Popularity, Status, Actions
- [ ] Row expansion toggles work

---

### Task 5.8: TrackDetail Component

**Files**: `src/components/admin/TrackDetail.tsx` (new file)

Inline expansion panel showing enrichment status.

**Acceptance Criteria**:
- [ ] Shows Turso enrichment fields
- [ ] Shows Neon enrichment status
- [ ] Status indicators (checkmarks/crosses)
- [ ] Action buttons visible

---

### Task 5.9: SpotifySearchModal Component

**Files**: `src/components/admin/SpotifySearchModal.tsx` (new file)

Modal for searching and linking Spotify tracks.

**Acceptance Criteria**:
- [ ] Modal opens/closes
- [ ] Pre-fills search with track title + artist
- [ ] Search calls API
- [ ] Results selectable
- [ ] Selection triggers link action

---

### Task 5.10: EnrichmentActions Component

**Files**: `src/components/admin/EnrichmentActions.tsx` (new file)

Action buttons: Copy from Turso, Find Spotify ID, Fetch BPM, Manual BPM.

**Acceptance Criteria**:
- [ ] Buttons conditionally enabled based on state
- [ ] Loading states during API calls
- [ ] Success/error feedback (toast or inline)

---

### Task 5.11: Replace Admin Songs Page

**Files**: `src/app/admin/songs/page.tsx` (replace existing 972-line file)

Compose all new components into the tracks browser.

**Key changes from existing page**:
- Data source: Turso tracks (not just Neon catalog)
- New filters: Missing Spotify, Has Spotify, In Catalog, Missing BPM
- New actions: Copy from Turso, Find Spotify, Fetch BPM
- Row expansion with enrichment status

**Acceptance Criteria**:
- [ ] Page loads at `/admin/songs`
- [ ] Tracks load from Turso with pagination
- [ ] Search performs FTS5 queries
- [ ] All filters work
- [ ] Sort options work
- [ ] Row expansion shows track details
- [ ] All enrichment actions work
- [ ] Mobile responsive

---

## Verification Checklist

After all phases complete:

- [ ] `bun run typecheck` - No type errors
- [ ] `bun run lint` - No lint errors
- [ ] `bun run test` - All tests pass
- [ ] `bun run build` - Production build succeeds
- [ ] Load a song without BPM - Logs appear in `bpm_fetch_log` table
- [ ] Visit `/admin/bpm-stats` - Dashboard loads with data
- [ ] Visit `/admin/songs` - Tracks browser loads from Turso
- [ ] Test enrichment actions: Copy, Find Spotify, Fetch BPM, Manual
- [ ] Mobile responsive on all new pages

---

## File Reference

### Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/bpm/bpm-log.ts` | 1.3 | Logging types and helper |
| `drizzle/0004_bpm_fetch_log.sql` | 1.2 | Database migration |
| `src/app/api/admin/bpm-stats/route.ts` | 3.1 | BPM stats API |
| `src/components/admin/BpmStatsCards.tsx` | 3.2 | Summary cards |
| `src/components/admin/BpmProviderTable.tsx` | 3.3 | Provider breakdown |
| `src/components/admin/BpmTimeSeriesChart.tsx` | 3.4 | Time-series chart |
| `src/components/admin/BpmFailuresList.tsx` | 3.5 | Failures list |
| `src/components/admin/BpmMissingSongs.tsx` | 3.6 | Missing songs tabs |
| `src/components/admin/BpmErrorBreakdown.tsx` | 3.7 | Error breakdown |
| `src/components/admin/BpmSongDetail.tsx` | 3.8 | Song detail modal |
| `src/app/admin/bpm-stats/page.tsx` | 3.9 | Dashboard page |
| `src/app/api/cron/cleanup-bpm-log/route.ts` | 4.1 | Retention cron |
| `src/app/api/admin/tracks/route.ts` | 5.1 | Tracks list API |
| `src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts` | 5.2 | Copy enrichment API |
| `src/app/api/admin/spotify/search/route.ts` | 5.3 | Spotify search API |
| `src/app/api/admin/tracks/[lrclibId]/link-spotify/route.ts` | 5.4 | Link Spotify API |
| `src/app/api/admin/tracks/[lrclibId]/fetch-bpm/route.ts` | 5.5 | Fetch BPM API |
| `src/components/admin/TracksFilterBar.tsx` | 5.6 | Filter chips |
| `src/components/admin/TracksList.tsx` | 5.7 | Paginated tracks list |
| `src/components/admin/TrackDetail.tsx` | 5.8 | Inline detail panel |
| `src/components/admin/SpotifySearchModal.tsx` | 5.9 | Spotify search modal |
| `src/components/admin/EnrichmentActions.tsx` | 5.10 | Action buttons |

### Files to Modify

| File | Phase | Changes | Status |
|------|-------|---------|--------|
| `src/lib/db/schema.ts` | 1.1 | Add `bpmFetchLog` table + types | ✅ Done |
| Database migration | 1.2 | Run `bun run db:push` | ✅ Done (uses push workflow) |
| `src/services/song-loader.ts` | 2.1, 2.2 | Update signature, add Turso logging | ✅ Done |
| `src/services/bpm-providers.ts` | 2.3 | Add logging wrapper and `withLogging` method | ✅ Done |
| `vercel.json` | 4.1 | Add cleanup cron | Pending |
| `src/app/admin/songs/page.tsx` | 5.11 | Replace with tracks browser | Pending |
| `src/app/admin/page.tsx` | 3.9 | Add link to BPM stats page | Pending |

---

## Critical Path

```
Phase 1 (Schema + Logging Types)
        │
        ▼
Phase 2 (Instrumentation)
        │
        ├─────────────────────────────┐
        ▼                             ▼
Phase 3 (BPM Dashboard)      Phase 5 (Tracks Browser)
        │                             │
        ▼                             │
Phase 4 (Cron)                        │
        │                             │
        └─────────────────────────────┘
                    │
                    ▼
               Complete
```

**Parallelization Notes**:
- Phase 3 and Phase 5 can run in parallel after Phase 2
- Within Phase 3, tasks 3.2-3.8 (components) can run in parallel
- Within Phase 5, tasks 5.6-5.10 (components) can run in parallel
- Phase 4 only depends on Phase 1 (can start early)

---

## Implementation Summary

### Task Complexity Breakdown

| Phase | Task | Complexity | Est. Lines | Notes |
|-------|------|------------|------------|-------|
| 1.2 | Migration file | Simple | 20 | SQL only |
| 1.3 | bpm-log.ts | Medium | 80 | New file with types + Effect pattern |
| 2.1 | Update signature | Simple | 5 | Add parameter, update call site |
| 2.2 | Turso logging | Medium | 30 | Add timing + 2 logging calls |
| 2.3 | Provider logging | Complex | 150 | New interface, wrapper function, modify service |
| 3.1 | BPM stats API | Complex | 200 | Multiple queries, Effect.gen pattern |
| 3.2-3.8 | Dashboard components | Medium each | ~100 each | Can parallelize |
| 3.9 | Dashboard page | Medium | 150 | Compose components |
| 4.1 | Cleanup cron | Simple | 60 | Copy pattern from spec |
| 5.1 | Tracks API | Complex | 250 | Turso + Neon join, filters |
| 5.2-5.5 | Enrichment APIs | Medium each | ~80 each | Can parallelize |
| 5.6-5.10 | Tracks components | Medium each | ~100 each | Can parallelize |
| 5.11 | Replace songs page | Complex | 400 | Orchestrate new components |

### Key Implementation Details

**Phase 1 Critical Files**:
- `src/lib/db/schema.ts` - ✅ Schema already defined (Task 1.1 complete)
- Database migration - ✅ Uses `db:push` workflow (Task 1.2 complete)
- `src/lib/bpm/bpm-log.ts` - MUST use `Effect.runFork`, NOT `.then().catch()`

**Phase 2 Critical Files**:
- `src/services/song-loader.ts` lines 243-300 and 514-543 - Add logging
- `src/services/bpm-providers.ts` - Completely rewrite with `withLogging` method

**Phase 3 Critical Files**:
- Follow `src/app/api/admin/stats/route.ts` pattern exactly
- Use `DbLayer` from `@/services/db`
- Import errors from `@/lib/errors`

**Phase 5 Critical Files**:
- TursoService needs new method for admin search with filters
- Cross-reference with `songLrclibIds` table for "in catalog" filter
- Existing `SongCard`/`SongRow` patterns from `admin/songs/page.tsx` can be adapted

### Recommended Execution Order

1. **Phase 1.2** - Create migration (prerequisite for everything)
2. **Phase 1.3** - Create bpm-log.ts (prerequisite for Phase 2)
3. **Phase 2.1** - Update signature (quick win, enables 2.2-2.3)
4. **Phase 2.2** - Add Turso logging (enables data collection)
5. **Phase 2.3** - Add provider logging (completes instrumentation)
6. **Phase 4.1** - Create cron (independent, can run early after Phase 1)
7. **Phase 3.1** - Create BPM stats API (enables dashboard)
8. **Phase 3.2-3.9** - Dashboard components and page (parallel)
9. **Phase 5.1** - Tracks API (enables tracks browser)
10. **Phase 5.2-5.5** - Enrichment APIs (parallel)
11. **Phase 5.6-5.11** - Tracks browser components and page (parallel)
