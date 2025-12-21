import { auth } from "@/auth"
import { checkQuotaAvailable, getUsageStats } from "@/lib/speech-usage-tracker"
import { ServerLayer } from "@/services/server-layer"
import { Effect } from "effect"
import { NextResponse } from "next/server"

interface QuotaResponse {
  available: boolean
  webSpeechAvailable: boolean
  stats?: { used: number; cap: number; percentUsed: number }
}

interface ErrorResponse {
  error: string
}

export async function GET(request: Request): Promise<NextResponse<QuotaResponse | ErrorResponse>> {
  // Log user agent for testing mobile detection
  const userAgent = request.headers.get("user-agent")
  console.log("[QUOTA] User-Agent:", userAgent)

  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [availableResult, statsResult] = await Promise.all([
    Effect.runPromiseExit(checkQuotaAvailable().pipe(Effect.provide(ServerLayer))),
    Effect.runPromiseExit(getUsageStats().pipe(Effect.provide(ServerLayer))),
  ])

  if (availableResult._tag === "Failure" || statsResult._tag === "Failure") {
    console.error("Failed to check quota")
    return NextResponse.json({ error: "Failed to check quota" }, { status: 500 })
  }

  const stats = statsResult.value

  return NextResponse.json({
    available: availableResult.value,
    webSpeechAvailable: true,
    stats: { used: stats.used, cap: stats.cap, percentUsed: stats.percentUsed },
  })
}
