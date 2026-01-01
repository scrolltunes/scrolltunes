/**
 * Turso Usage Cron Endpoint
 *
 * Called by Vercel cron to check Turso usage and send alerts.
 * Runs hourly to monitor row reads against 500M monthly limit.
 */

import { checkAndSendWarnings } from "@/lib/turso-usage-tracker"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await Effect.runPromiseExit(checkAndSendWarnings.pipe(Effect.provide(ServerLayer)))

  if (result._tag === "Failure") {
    console.error("[TURSO-CRON] Failed:", result.cause)
    return NextResponse.json({ error: "Failed to check usage" }, { status: 500 })
  }

  const usage = result.value

  return NextResponse.json({
    ok: true,
    usage: {
      rowsRead: usage.rowsRead,
      rowsWritten: usage.rowsWritten,
      storageBytes: usage.storageBytes,
      percentage: usage.percentage.toFixed(2),
      limit: usage.limit,
    },
  })
}
