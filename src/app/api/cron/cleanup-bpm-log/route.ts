/**
 * BPM Log Cleanup Cron Endpoint
 *
 * Called by Vercel cron to delete BPM fetch logs older than 90 days.
 * Runs daily at 3:00 AM UTC to manage storage.
 */

import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { DatabaseError } from "@/lib/errors"
import { lt, sql } from "drizzle-orm"
import { Data, Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Tagged error for cron auth failures
class CronAuthError extends Data.TaggedClass("CronAuthError")<object> {}

const cleanupBpmLog = (authHeader: string | null) =>
  Effect.gen(function* () {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return yield* Effect.fail(new CronAuthError({}))
    }

    // Delete old records
    const result = yield* Effect.tryPromise({
      try: () =>
        db.delete(bpmFetchLog).where(lt(bpmFetchLog.createdAt, sql`NOW() - INTERVAL '90 days'`)),
      catch: cause => new DatabaseError({ cause }),
    })

    return { deleted: result.rowCount ?? 0 }
  })

export async function GET(request: NextRequest) {
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
        return NextResponse.json({ success: false, error: "Database error" }, { status: 500 })
      }
    }
    console.error("[BPM Cleanup] Failed:", exit.cause)
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...exit.value })
}
