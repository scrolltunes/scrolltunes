# BPM Analytics Admin Implementation Plan

## Overview

Implement BPM fetch logging, admin dashboard for analytics, and a comprehensive tracks browser for manual enrichment.

## Validation Command

```bash
bun run check
```

This runs: `biome check . && bun run typecheck && bun run test`

---

## Gap Analysis

**Analysis Date**: 2026-01-13

### Phase 1: Schema + Logging

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `bpmFetchLog` table | Does not exist | Add to `schema.ts` after line 414 |
| `serial` import | NOT imported in pg-core imports | Add `serial` to import list on line 2 |
| Migration file | Latest is `0003_add-album-art-cache.sql` | Create `0004_bpm_fetch_log.sql` |
| Journal entry | idx: 3 is latest | Add idx: 4 entry |
| `bpm-log.ts` types | Does not exist | Create new file |

### Phase 2: Instrumentation

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `fireAndForgetBpmFetch` | Lines 243-300, params: `(songId, title, artist, spotifyId)` | Add `lrclibId` param after `songId` |
| Call site | Line 541 | Update to pass `actualLrclibId` |
| Turso logging | Lines 516-538, no logging | Add timing + logging calls |
| `bpm-providers.ts` | 59 lines, no logging | Add `wrapProviderWithLogging` + `withLogging` method |

### Phase 3: Dashboard

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `/admin/bpm-stats` | Does not exist | Create new page |
| BPM stats API | Does not exist | Create `/api/admin/bpm-stats/route.ts` |
| Components | None exist | Create 7 new components in `src/components/admin/` |
| Admin sidebar | No BPM stats link | Add link to dashboard |
| Recharts | Already in project | No install needed |

### Phase 4: Cron

| Item | Current State | Required Change |
|------|---------------|-----------------|
| Cleanup endpoint | Does not exist | Create `/api/cron/cleanup-bpm-log/route.ts` |
| `vercel.json` | 1 cron (`/api/cron/turso-usage`) | Add second cron entry |

### Phase 5: Tracks Browser

| Item | Current State | Required Change |
|------|---------------|-----------------|
| `/admin/songs` page | 972 lines, Neon-only | Replace with Turso-first implementation |
| Filters | `all\|synced\|enhanced\|unenhanced` | Change to `all\|missing_spotify\|has_spotify\|in_catalog\|missing_bpm` |
| Tracks API | Does not exist | Create `/api/admin/tracks/route.ts` |
| Enrichment APIs | Do not exist | Create 4 new API routes |
| Components | Existing `SongCard`/`SongRow` | Create new modular components |

---

## Specs Reference

| Spec | Description | Status |
|------|-------------|--------|
| [bpm-analytics-schema](specs/bpm-analytics-schema.md) | Database schema and types | Pending |
| [bpm-logging-helper](specs/bpm-logging-helper.md) | Fire-and-forget logging function | Pending |
| [bpm-instrumentation](specs/bpm-instrumentation.md) | Instrument Turso and provider cascade | Pending |
| [bpm-admin-dashboard](specs/bpm-admin-dashboard.md) | Admin page with analytics | Pending |
| [bpm-retention-cleanup](specs/bpm-retention-cleanup.md) | 90-day log retention cron | Pending |
| [bpm-admin-tracks-browser](specs/bpm-admin-tracks-browser.md) | Full LRCLIB tracks browser with enrichment | Pending |

---

## Phase 1: Foundation (P0)

### Task 1.1: Add `bpmFetchLog` Table to Schema

**Files**: `src/lib/db/schema.ts`

Add the following after line 414 (after `chordEnhancements` table):

```typescript
// ============================================================================
// BPM Fetch Logging
// ============================================================================

export const bpmFetchLog = pgTable(
  "bpm_fetch_log",
  {
    id: serial("id").primaryKey(),
    lrclibId: integer("lrclib_id").notNull(),
    songId: text("song_id"),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    stage: text("stage").notNull(),
    provider: text("provider").notNull(),
    success: boolean("success").notNull(),
    bpm: integer("bpm"),
    errorReason: text("error_reason"),
    errorDetail: text("error_detail"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("idx_bpm_log_lrclib").on(table.lrclibId),
    index("idx_bpm_log_created_provider").on(table.createdAt, table.provider),
    index("idx_bpm_log_created").on(table.createdAt),
  ],
)

export type BpmFetchLog = typeof bpmFetchLog.$inferSelect
export type NewBpmFetchLog = typeof bpmFetchLog.$inferInsert
```

**Pre-requisite**: Add `serial` to imports at the top of the file (line 2-15):

```typescript
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,  // ADD THIS
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
```

**Acceptance Criteria**:
- [x] `serial` added to imports from `drizzle-orm/pg-core`
- [x] `bpmFetchLog` table added to schema with all columns
- [x] Three indexes defined: lrclib_id, created_at+provider, created_at
- [x] Type exports added: `BpmFetchLog`, `NewBpmFetchLog`
- [x] `bun run typecheck` passes

---

### Task 1.2: Create Database Migration

**Files**: `drizzle/0004_bpm_fetch_log.sql`

```sql
-- Add BPM fetch logging table for analytics
CREATE TABLE bpm_fetch_log (
  id SERIAL PRIMARY KEY,
  lrclib_id INTEGER NOT NULL,
  song_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  bpm INTEGER,
  error_reason TEXT,
  error_detail TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bpm_log_lrclib ON bpm_fetch_log(lrclib_id);
CREATE INDEX idx_bpm_log_created_provider ON bpm_fetch_log(created_at, provider);
CREATE INDEX idx_bpm_log_created ON bpm_fetch_log(created_at);
```

**Post-task**: Update `drizzle/meta/_journal.json` with new entry:
```json
{
  "idx": 4,
  "version": "7",
  "when": <timestamp>,
  "tag": "0004_bpm_fetch_log",
  "breakpoints": true
}
```

Run `bun run db:push` to apply migration.

**Acceptance Criteria**:
- [ ] Migration file created
- [ ] Journal updated
- [ ] Migration applies successfully

---

### Task 1.3: Create Logging Types and Helper

**Files**: `src/lib/bpm/bpm-log.ts` (new file)

```typescript
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"

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
 * Does not block the caller; errors are logged to console.
 */
export function logBpmAttempt(entry: BpmLogEntry): void {
  db.insert(bpmFetchLog)
    .values({
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
    })
    .then(() => {})
    .catch(err => console.error("[BPM Log] Insert failed:", err))
}
```

**Acceptance Criteria**:
- [ ] File created at `src/lib/bpm/bpm-log.ts`
- [ ] All types exported: `BpmProvider`, `BpmStage`, `BpmErrorReason`, `BpmLogEntry`
- [ ] `logBpmAttempt` function exported and fire-and-forget
- [ ] `mapErrorToReason` helper function exported
- [ ] `errorDetail` truncated to 500 chars
- [ ] `bun run typecheck` passes

---

## Phase 2: Instrumentation (P1)

**Dependencies**: Phase 1 must be complete.

### Task 2.1: Update `fireAndForgetBpmFetch` Signature

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
- [ ] Function signature updated with `lrclibId: number` parameter
- [ ] Call site updated to pass `actualLrclibId`
- [ ] `bun run typecheck` passes

---

### Task 2.2: Instrument Turso Embedded Tempo Lookup

**Files**: `src/services/song-loader.ts`

Add import at top:
```typescript
import { logBpmAttempt } from "@/lib/bpm/bpm-log"
```

Modify the Turso tempo check section (around lines 514-543) to add logging:

```typescript
// BPM handling: use cached, embedded tempo, or defer fetching
let bpm: number | null = null
let key: string | null = null
let timeSignature: number | null = null
let bpmSource: AttributionSource | null = null

if (hasCachedBpm && cachedSong && cachedSong.bpmSource) {
  // Priority 1: Use cached BPM from Neon catalog (no logging - already have BPM)
  bpm = cachedSong.bpm
  key = cachedSong.musicalKey
  bpmSource = getBpmAttribution(cachedSong.bpmSource, cachedSong.bpmSourceUrl)
} else {
  // Priority 2: Try embedded tempo from Turso (Spotify enrichment)
  const tursoStart = Date.now()
  const tursoTrack = await Effect.runPromise(
    getEmbeddedTempoFromTurso(actualLrclibId).pipe(Effect.provide(ServerLayer)),
  )

  if (tursoTrack?.tempo !== null && tursoTrack?.tempo !== undefined) {
    bpm = Math.round(tursoTrack.tempo)
    key = formatMusicalKey(tursoTrack.musicalKey, tursoTrack.mode)
    timeSignature = tursoTrack.timeSignature
    bpmSource = getBpmAttribution("Spotify")

    // Log successful Turso lookup
    logBpmAttempt({
      lrclibId: actualLrclibId,
      songId: cachedSong?.songId,
      title: lyrics.title,
      artist: lyrics.artist,
      stage: "turso_embedded",
      provider: "Turso",
      success: true,
      bpm,
      latencyMs: Date.now() - tursoStart,
    })

    // Cache the embedded BPM in Neon for future requests
    if (cachedSong) {
      db.update(songs)
        .set({
          bpm,
          musicalKey: key,
          bpmSource: "Spotify",
          updatedAt: new Date(),
        })
        .where(eq(songs.id, cachedSong.songId))
        .then(() => {})
        .catch(err => console.error("[BPM] Failed to cache embedded tempo:", err))
    }
  } else {
    // Log failed Turso lookup
    logBpmAttempt({
      lrclibId: actualLrclibId,
      songId: cachedSong?.songId,
      title: lyrics.title,
      artist: lyrics.artist,
      stage: "turso_embedded",
      provider: "Turso",
      success: false,
      errorReason: "not_found",
      latencyMs: Date.now() - tursoStart,
    })

    // Priority 3: Defer BPM fetching to background provider cascade
    if (cachedSong) {
      fireAndForgetBpmFetch(cachedSong.songId, actualLrclibId, lyrics.title, lyrics.artist, resolvedSpotifyId)
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Import added for `logBpmAttempt`
- [ ] Timing captured for Turso lookup
- [ ] Success case logs with BPM value
- [ ] Failure case logs with "not_found" reason
- [ ] Logging is non-blocking
- [ ] `bun run typecheck` passes

---

### Task 2.3: Instrument Provider Cascade

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
- [ ] `LoggingContext` interface added
- [ ] `wrapProviderWithLogging` function created
- [ ] `withLogging` method added to `BpmProvidersService`
- [ ] `song-loader.ts` uses `withLogging` for cascade
- [ ] Each provider attempt is logged with correct stage
- [ ] Errors are captured with reason and truncated detail
- [ ] `bun run typecheck` passes

---

## Phase 3: BPM Analytics Dashboard (P2)

**Dependencies**: Phase 2 must be complete (needs data to display).
**Can run in parallel with**: Phase 5 (Tracks Browser).

### Task 3.1: BPM Stats API Endpoint

**Files**: `src/app/api/admin/bpm-stats/route.ts` (new file)

Create API endpoint following the pattern from `src/app/api/admin/stats/route.ts`:
- Use Effect.ts for async operations
- Auth check via `auth()` and `isAdmin` from profile
- Support query params: `section`, `period`, `offset`, `limit`, `missingType`

See `specs/bpm-admin-dashboard.md` for full query details.

**Acceptance Criteria**:
- [ ] Route created with admin auth check
- [ ] Summary query returns: total attempts, success rate, songs without BPM, avg latency
- [ ] Provider breakdown query works
- [ ] Time-series query returns 30 days of data
- [ ] Failures query with pagination
- [ ] Missing songs queries for all three types
- [ ] Error breakdown query works

---

### Task 3.2: Summary Cards Component

**Files**: `src/components/admin/BpmStatsCards.tsx` (new file)

Display 4 stat cards:
- Total attempts (24h)
- Success rate (%)
- Songs without BPM
- Avg latency (ms)

Follow styling from `src/app/admin/page.tsx` `StatCard` component.

**Acceptance Criteria**:
- [ ] 4 stat cards render
- [ ] Loading skeleton state
- [ ] Uses CSS variables for styling

---

### Task 3.3: Provider Table Component

**Files**: `src/components/admin/BpmProviderTable.tsx` (new file)

Table with columns: Provider, Attempts, Successes, Rate (%), Avg Latency.

**Acceptance Criteria**:
- [ ] Table renders provider breakdown
- [ ] Sorted by attempts descending
- [ ] Success rate calculated correctly

---

### Task 3.4: Time-Series Chart Component

**Files**: `src/components/admin/BpmTimeSeriesChart.tsx` (new file)

Use `recharts` (already in project) for stacked bar chart.

**Acceptance Criteria**:
- [ ] Chart renders 30 days of data
- [ ] Stacked by provider
- [ ] Responsive width

---

### Task 3.5: Failures List Component

**Files**: `src/components/admin/BpmFailuresList.tsx` (new file)

Paginated list of recent failures.

**Acceptance Criteria**:
- [ ] List renders recent failures
- [ ] Shows title, artist, provider, error reason, timestamp
- [ ] Pagination controls work
- [ ] Empty state when no failures

---

### Task 3.6: Missing Songs Component

**Files**: `src/components/admin/BpmMissingSongs.tsx` (new file)

Three tabs:
1. Never had BPM
2. All attempts failed
3. Most problematic (highest fail count)

**Acceptance Criteria**:
- [ ] Tab switching works
- [ ] Each tab shows paginated list
- [ ] Click song triggers drill-down

---

### Task 3.7: Error Breakdown Component

**Files**: `src/components/admin/BpmErrorBreakdown.tsx` (new file)

Pivot table grouped by provider and error reason.

**Acceptance Criteria**:
- [ ] Table renders error counts
- [ ] Grouped by provider
- [ ] Shows all error reasons

---

### Task 3.8: Song Detail Drill-Down

**Files**: `src/components/admin/BpmSongDetail.tsx` (new file)

Modal showing all BPM fetch attempts for a single song.

**Acceptance Criteria**:
- [ ] Modal opens on song click
- [ ] Shows all attempts chronologically
- [ ] Close button works

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
import { lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await db
      .delete(bpmFetchLog)
      .where(lt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '90 days'`))

    return NextResponse.json({
      success: true,
      deleted: result.rowCount ?? 0,
    })
  } catch (error) {
    console.error("[BPM Cleanup] Failed:", error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    )
  }
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
- [ ] Protected with `CRON_SECRET` bearer token
- [ ] Deletes records older than 90 days
- [ ] Returns count of deleted records
- [ ] `vercel.json` updated with cron schedule
- [ ] Error handling with console logging

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

| File | Phase | Changes |
|------|-------|---------|
| `src/lib/db/schema.ts` | 1.1 | Add `bpmFetchLog` table + types |
| `drizzle/meta/_journal.json` | 1.2 | Add migration entry |
| `src/services/song-loader.ts` | 2.1, 2.2 | Update signature, add Turso logging |
| `src/services/bpm-providers.ts` | 2.3 | Add logging wrapper and `withLogging` method |
| `vercel.json` | 4.1 | Add cleanup cron |
| `src/app/admin/songs/page.tsx` | 5.11 | Replace with tracks browser |
| `src/app/admin/page.tsx` | 3.9 | Add link to BPM stats page |

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
