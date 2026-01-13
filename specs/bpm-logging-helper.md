# BPM Logging Helper Spec

## Overview

Create a fire-and-forget logging helper for BPM fetch attempts that does not block the main request path.

## Architectural Requirements

**This module MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

- Fire-and-forget pattern: Use `Effect.runFork` with `Effect.ignore` or `Effect.catchAll`
- Do NOT use `.then().catch()` or `void fetch().catch()` patterns
- Tagged error classes for any errors

## Location

`src/lib/bpm/bpm-log.ts`

## Interface

```typescript
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

export function logBpmAttempt(entry: BpmLogEntry): void
```

## Implementation Requirements

1. **Effect.runFork pattern**: Use `Effect.runFork` with error recovery (NOT `.then().catch()`)
2. **Tagged error class**: Define `BpmLogInsertError` for database failures
3. **Fire-and-forget**: Function returns `void` immediately, no awaiting
4. **Error handling**: Catch and log insert failures to console via `Effect.catchAll`
5. **Truncation**: Limit `errorDetail` to 500 characters
6. **Database**: Use Neon `db` from `@/lib/db`

### Reference Implementation

```typescript
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { Data, Effect } from "effect"

// Tagged error for logging failures
class BpmLogInsertError extends Data.TaggedClass("BpmLogInsertError")<{
  readonly cause: unknown
}> {}

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
```

## Example Usage

```typescript
import { logBpmAttempt } from "@/lib/bpm/bpm-log"

// Success case
logBpmAttempt({
  lrclibId: 78899,
  songId: "song_abc123",
  title: "The Unforgiven",
  artist: "Metallica",
  stage: "turso_embedded",
  provider: "Turso",
  success: true,
  bpm: 139,
  latencyMs: 45,
})

// Failure case
logBpmAttempt({
  lrclibId: 78899,
  title: "The Unforgiven",
  artist: "Metallica",
  stage: "cascade_fallback",
  provider: "GetSongBPM",
  success: false,
  errorReason: "not_found",
  errorDetail: "No matching track found",
  latencyMs: 250,
})
```

## Error Reason Mapping

Create a helper to map errors to standardized reasons:

```typescript
export function mapErrorToReason(error: unknown): BpmErrorReason {
  const message = String(error).toLowerCase()
  if (message.includes("not found") || message.includes("404")) return "not_found"
  if (message.includes("rate limit") || message.includes("429")) return "rate_limit"
  if (message.includes("timeout") || message.includes("timed out")) return "timeout"
  if (message.includes("api") || message.includes("500") || message.includes("503")) return "api_error"
  return "unknown"
}
```

## Acceptance Criteria

- [ ] `logBpmAttempt` function exported from `src/lib/bpm/bpm-log.ts`
- [ ] Uses `Effect.runFork` with `Effect.catchAll` (NOT `.then().catch()`)
- [ ] `BpmLogInsertError` tagged error class defined with `Data.TaggedClass`
- [ ] Function is fire-and-forget (no awaiting)
- [ ] Errors are caught and logged to console via `Effect.sync`
- [ ] `errorDetail` is truncated to 500 chars
- [ ] `mapErrorToReason` helper function exported
- [ ] All types exported: `BpmProvider`, `BpmStage`, `BpmErrorReason`, `BpmLogEntry`
- [ ] `bun run typecheck` passes
