# BPM Analytics Schema Spec

## Overview

Add database schema and types for logging BPM fetch attempts across all providers.

## Database Table: `bpm_fetch_log`

### Drizzle Schema

Location: `src/lib/db/schema.ts`

```typescript
export const bpmFetchLog = pgTable("bpm_fetch_log", {
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
})

// Indexes
export const bpmFetchLogLrclibIdx = index("idx_bpm_log_lrclib").on(bpmFetchLog.lrclibId)
export const bpmFetchLogCreatedProviderIdx = index("idx_bpm_log_created_provider").on(bpmFetchLog.createdAt, bpmFetchLog.provider)
export const bpmFetchLogCreatedIdx = index("idx_bpm_log_created").on(bpmFetchLog.createdAt)

export type BpmFetchLog = typeof bpmFetchLog.$inferSelect
export type NewBpmFetchLog = typeof bpmFetchLog.$inferInsert
```

### SQL Migration

Location: `drizzle/migrations/NNNN_bpm_fetch_log.sql`

```sql
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

## Type Definitions

Location: `src/lib/bpm/bpm-log.ts`

```typescript
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

## Acceptance Criteria

- [ ] `bpmFetchLog` table added to `src/lib/db/schema.ts`
- [ ] Migration file created in `drizzle/migrations/`
- [ ] Type exports for `BpmFetchLog` and `NewBpmFetchLog`
- [ ] Types file created at `src/lib/bpm/bpm-log.ts`
- [ ] Migration runs successfully with `bun run db:push` or `bun run db:migrate`
