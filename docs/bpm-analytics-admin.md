# BPM Analytics Admin Page

> Track BPM fetch attempts to understand coverage gaps and provider performance.

## Overview

Add `/admin/bpm-stats` page showing BPM fetch analytics: success rates, provider usage, songs missing BPM, and recent activity.

**Why track this?**
- 46% of tracks have embedded BPM from Turso (Spotify enrichment)
- Remaining 54% fall back to provider cascade (GetSongBPM → Deezer)
- Need visibility into: which songs lack BPM, which providers succeed/fail, latency

**Privacy note:** BPM is not PII. Fetched from online providers regardless of tracking.

---

## Database Schema

### New table: `bpm_fetch_log`

```sql
CREATE TABLE bpm_fetch_log (
  id SERIAL PRIMARY KEY,
  lrclib_id INTEGER NOT NULL,          -- Track identifier
  song_id TEXT,                         -- Optional FK to songs.id for disambiguation
  title TEXT NOT NULL,                  -- For display/debugging
  artist TEXT NOT NULL,                 -- For display/debugging
  stage TEXT NOT NULL,                  -- 'turso_embedded', 'cascade_fallback', 'cascade_race', 'last_resort'
  provider TEXT NOT NULL,               -- 'Turso', 'GetSongBPM', 'Deezer', 'ReccoBeats', 'RapidAPISpotify'
  success BOOLEAN NOT NULL,
  bpm INTEGER,                          -- NULL if failed
  error_reason TEXT,                    -- 'not_found', 'rate_limit', 'api_error', 'timeout', 'unknown'
  error_detail TEXT,                    -- Raw/truncated provider error message
  latency_ms INTEGER,                   -- Response time in ms
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bpm_log_lrclib ON bpm_fetch_log(lrclib_id);
CREATE INDEX idx_bpm_log_created_provider ON bpm_fetch_log(created_at, provider);
CREATE INDEX idx_bpm_log_created ON bpm_fetch_log(created_at);
```

### Provider and Stage Types

```typescript
// src/lib/bpm/bpm-log.ts
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
```

### Drizzle schema

```typescript
// src/lib/db/schema.ts
export const bpmFetchLog = pgTable("bpm_fetch_log", {
  id: serial("id").primaryKey(),
  lrclibId: integer("lrclib_id").notNull(),
  songId: text("song_id"),  // Optional FK to songs.id
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
})
```

---

## Logging Flow

```
Request for song (lrclib_id: 78899, "The Unforgiven" by Metallica)
│
├─ 1. Check Neon cache → HIT? Return cached, NO LOG
│                      → MISS? Continue...
│
├─ 2. Check Turso embedded tempo
│      └─ LOG: {provider: "Turso", success: true/false, bpm: 139, latency_ms: 45}
│      → HIT? Cache to Neon, return
│      → MISS? Continue to cascade...
│
└─ 3. Provider cascade (fire-and-forget background)
       ├─ GetSongBPM attempt
       │    └─ LOG: {provider: "GetSongBPM", success: true/false, latency_ms: 250}
       │
       └─ Deezer attempt (if GetSongBPM failed)
            └─ LOG: {provider: "Deezer", success: true/false, latency_ms: 180}
```

**Key points:**
- Neon cache hit = no log (already have BPM)
- Each provider attempt = logged with latency
- Logs are fire-and-forget (non-blocking inserts)

---

## Logging Helper

```typescript
// src/lib/bpm/bpm-log.ts
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"

interface BpmLogEntry {
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

export function logBpmAttempt(entry: BpmLogEntry): void {
  // Fire-and-forget, don't await
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
      errorDetail: entry.errorDetail ?? null,
      latencyMs: entry.latencyMs ?? null,
    })
    .then(() => {})
    .catch(err => console.error("[BPM Log] Insert failed:", err))
}
```

---

## Dashboard Sections

### 1. Summary Cards

| Metric | Query |
|--------|-------|
| Total attempts (24h) | `COUNT(*) WHERE created_at > NOW() - INTERVAL '24 hours'` |
| Overall success rate | `100.0 * SUM(success::int) / COUNT(*)` |
| Songs without BPM | `COUNT(*) FROM songs WHERE bpm IS NULL` |

### 2. Provider Breakdown Table

| Provider | Attempts | Successes | Rate | Avg Latency |
|----------|----------|-----------|------|-------------|
| Turso | 5,000 | 2,300 | 46% | 45ms |
| GetSongBPM | 2,700 | 2,100 | 78% | 250ms |
| Deezer | 600 | 400 | 67% | 180ms |

```sql
SELECT 
  provider,
  COUNT(*) as attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 1) as rate,
  ROUND(AVG(latency_ms)) as avg_latency_ms
FROM bpm_fetch_log
GROUP BY provider
ORDER BY attempts DESC;
```

### 3. Time-Series Chart

- X-axis: Date (last 30 days)
- Y-axis: Attempt count
- Stacked by provider
- Optional: overlay success rate line

```sql
SELECT 
  DATE(created_at) as date,
  provider,
  COUNT(*) as attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes
FROM bpm_fetch_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), provider
ORDER BY date;
```

### 4. Recent Failures List

Last 50 failed attempts for debugging:

```sql
SELECT lrclib_id, title, artist, provider, error_reason, created_at
FROM bpm_fetch_log
WHERE success = false
ORDER BY created_at DESC
LIMIT 50;
```

### 5. Songs Missing BPM

Paginated list from `songs` table:

```sql
-- Never had BPM in catalog
SELECT id, title, artist 
FROM songs 
WHERE bpm IS NULL
ORDER BY created_at DESC
LIMIT 50 OFFSET ?;

-- Attempted but all providers failed (most recent attempt per song)
SELECT DISTINCT ON (l.lrclib_id)
  l.lrclib_id,
  l.title,
  l.artist,
  l.provider,
  l.error_reason,
  l.created_at
FROM bpm_fetch_log l
WHERE NOT EXISTS (
  SELECT 1 
  FROM bpm_fetch_log 
  WHERE lrclib_id = l.lrclib_id AND success = true
)
ORDER BY l.lrclib_id, l.created_at DESC
LIMIT 50;

-- Top failed songs by attempt count (most problematic)
SELECT 
  lrclib_id,
  title,
  artist,
  COUNT(*) AS failed_attempts
FROM bpm_fetch_log
WHERE success = false
GROUP BY lrclib_id, title, artist
ORDER BY failed_attempts DESC
LIMIT 50;
```

### 6. Error Reason Breakdown

```sql
SELECT 
  provider,
  error_reason,
  COUNT(*) as count
FROM bpm_fetch_log
WHERE success = false
GROUP BY provider, error_reason
ORDER BY provider, count DESC;
```

### 7. Song Detail Drill-Down

Click a song to see all its BPM fetch attempts:

```sql
SELECT *
FROM bpm_fetch_log
WHERE lrclib_id = $1
ORDER BY created_at DESC;
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/db/schema.ts` | Add `bpmFetchLog` table |
| `drizzle/migrations/XXXX_bpm_fetch_log.sql` | Migration |
| `src/lib/bpm/bpm-log.ts` | Logging helper + types (fire-and-forget) |
| `src/services/song-loader.ts` | Log Turso attempts, pass `lrclibId` to cascade |
| `src/services/bpm-providers.ts` | Wrap providers with logging |
| `src/app/admin/bpm-stats/page.tsx` | Dashboard server component |
| `src/components/admin/BpmStatsCards.tsx` | Summary cards |
| `src/components/admin/BpmProviderTable.tsx` | Provider breakdown |
| `src/components/admin/BpmTimeSeriesChart.tsx` | Chart (recharts) |
| `src/components/admin/BpmFailuresList.tsx` | Recent failures |
| `src/components/admin/BpmMissingSongs.tsx` | Songs without BPM |
| `src/components/admin/BpmSongDetail.tsx` | Per-song drill-down |

---

## Integration Notes

### Pass `lrclibId` to cascade

Current `fireAndForgetBpmFetch` signature:
```typescript
function fireAndForgetBpmFetch(
  songId: string,
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

Updated signature to support logging:
```typescript
function fireAndForgetBpmFetch(
  songId: string,
  lrclibId: number,  // Added
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

Call site update in `loadSongData`:
```typescript
fireAndForgetBpmFetch(
  cachedSong.songId, 
  actualLrclibId,  // Pass lrclibId
  lyrics.title, 
  lyrics.artist, 
  resolvedSpotifyId
)
```

### Wrapping providers with logging

In `bpm-providers.ts`, wrap each provider to capture timing and log results:

```typescript
const wrapProviderWithLogging = (
  provider: BPMProvider,
  stage: BpmStage,
  lrclibId: number,
  songId: string | undefined,
  title: string,
  artist: string,
) => ({
  name: provider.name,
  getBpm: async (query: BPMTrackQuery) => {
    const start = Date.now()
    try {
      const result = await provider.getBpm(query)
      logBpmAttempt({
        lrclibId,
        songId,
        title,
        artist,
        stage,
        provider: provider.name as BpmProvider,
        success: true,
        bpm: result.bpm,
        latencyMs: Date.now() - start,
      })
      return result
    } catch (error) {
      logBpmAttempt({
        lrclibId,
        songId,
        title,
        artist,
        stage,
        provider: provider.name as BpmProvider,
        success: false,
        errorReason: mapErrorToReason(error),
        errorDetail: String(error).slice(0, 500),
        latencyMs: Date.now() - start,
      })
      throw error
    }
  },
})
```

### Serverless considerations

Fire-and-forget DB inserts can be dropped if the process freezes immediately after response.

Mitigation:
- For Turso attempts (in request path): fire-and-forget is acceptable
- For cascade attempts (background): consider awaiting the log insert since latency is less sensitive

---

## Implementation Order

1. **Schema + migration** — Add table to Drizzle, run migration
2. **Logging helper** — Create `bpm-log.ts` with fire-and-forget insert
3. **Instrument Turso lookup** — Log in `song-loader.ts`
4. **Instrument provider cascade** — Wrap providers in `bpm-providers.ts`
5. **Admin page shell** — Create `/admin/bpm-stats` with summary cards
6. **Provider table** — Add breakdown table
7. **Time-series chart** — Add recharts visualization
8. **Failures + missing lists** — Add paginated lists

---

## Storage Estimates

- ~100 bytes per log row
- 10,000 attempts/day = ~1MB/day = ~30MB/month
- Retention: Prune logs older than 90 days

### Retention Job

Run daily via cron or Vercel cron:

```sql
DELETE FROM bpm_fetch_log
WHERE created_at < NOW() - INTERVAL '90 days';
```

```typescript
// src/app/api/cron/cleanup-bpm-log/route.ts
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { lt, sql } from "drizzle-orm"

export async function GET() {
  const result = await db
    .delete(bpmFetchLog)
    .where(lt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '90 days'`))
  
  return Response.json({ deleted: result.rowCount })
}
```

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/cleanup-bpm-log", "schedule": "0 3 * * *" }
  ]
}
```

---

## Future Enhancements

- [ ] Export to CSV
- [ ] Alerts for sudden success rate drops
- [ ] Auto-retry queue for songs that failed all providers
- [ ] Link to manually set BPM for failed songs
- [ ] Provider latency percentiles (p50, p95, p99)
- [ ] Time-range filters on all dashboard sections (24h / 7d / 30d / all time)

---

## Risks and Guardrails

- **Dropped logs in serverless**: Accept some loss; if major inconsistencies appear, revisit and await logs in background tasks
- **Provider naming drift**: Use TypeScript union types to prevent typos
- **Future provider additions**: Update dashboard filters and `BpmProvider` type when adding providers
- **Query correctness**: Add integration tests for key queries (failed songs, provider breakdown)
