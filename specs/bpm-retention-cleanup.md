# BPM Log Retention Cleanup Spec

## Overview

Create a scheduled cron job to delete BPM fetch logs older than 90 days to manage storage.

## Cron Endpoint

Location: `src/app/api/cron/cleanup-bpm-log/route.ts`

### Implementation

```typescript
import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { lt, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Verify cron secret for security
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
      deleted: result.rowCount
    })
  } catch (error) {
    console.error("[BPM Cleanup] Failed:", error)
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
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
- [ ] Endpoint protected with `CRON_SECRET` bearer token
- [ ] Deletes records older than 90 days
- [ ] Returns count of deleted records
- [ ] `vercel.json` updated with cron schedule
- [ ] Error handling with console logging
