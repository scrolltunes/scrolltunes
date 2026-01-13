# BPM Log Retention Cleanup Spec

## Overview

Create a scheduled cron job to delete BPM fetch logs older than 90 days to manage storage.

## Architectural Requirements

**This module MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

- API routes MUST use `Effect.runPromiseExit()` with pattern matching on exit
- Tagged error classes for all error types (auth, database)
- Do NOT use `try/catch` with raw `await`
- Import shared errors from `@/lib/errors`

## Cron Endpoint

Location: `src/app/api/cron/cleanup-bpm-log/route.ts`

### Implementation

```typescript
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { DatabaseError } from "@/lib/errors"
import { lt, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { NextResponse } from "next/server"

// Tagged error for cron auth failures
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

## Vercel Cron Configuration

Location: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-bpm-log",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Schedule: Daily at 3:00 AM UTC

## Environment Variable

Add `CRON_SECRET` to environment variables for authentication.

## Storage Estimates

- ~100 bytes per log row
- 10,000 attempts/day = ~1MB/day
- 90-day retention = ~90MB max

## Acceptance Criteria

- [ ] Cron endpoint created at `/api/cron/cleanup-bpm-log`
- [ ] Uses `Effect.runPromiseExit()` pattern (NOT try/catch)
- [ ] `CronAuthError` tagged error class defined
- [ ] Uses `DatabaseError` from `@/lib/errors`
- [ ] Endpoint protected with `CRON_SECRET` bearer token
- [ ] Deletes records older than 90 days
- [ ] Returns count of deleted records
- [ ] Pattern matches on `exit._tag` for error handling
- [ ] `vercel.json` updated with cron schedule
- [ ] `bun run typecheck` passes
