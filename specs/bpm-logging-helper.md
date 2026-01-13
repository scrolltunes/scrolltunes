# BPM Logging Helper Spec

## Overview

Create a fire-and-forget logging helper for BPM fetch attempts that does not block the main request path.

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

1. **Fire-and-forget pattern**: Do not await the insert, return immediately
2. **Error handling**: Catch and log insert failures to console, never throw
3. **Truncation**: Limit `errorDetail` to 500 characters
4. **Database**: Use Neon `db` from `@/lib/db`

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
- [ ] Function is fire-and-forget (no awaiting)
- [ ] Errors are caught and logged to console
- [ ] `errorDetail` is truncated to 500 chars
- [ ] `mapErrorToReason` helper function exported
- [ ] All types exported: `BpmProvider`, `BpmStage`, `BpmErrorReason`, `BpmLogEntry`
