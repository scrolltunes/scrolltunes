import { auth } from "@/auth"
import { checkQuotaAvailable, getUsageStats } from "@/lib/speech-usage-tracker"
import { Effect } from "effect"
import { NextResponse } from "next/server"

interface QuotaResponse {
  available: boolean
  percentUsed: number
}

interface ErrorResponse {
  error: string
}

export async function GET(): Promise<NextResponse<QuotaResponse | ErrorResponse>> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [availableResult, statsResult] = await Promise.all([
    Effect.runPromiseExit(checkQuotaAvailable()),
    Effect.runPromiseExit(getUsageStats()),
  ])

  if (availableResult._tag === "Failure" || statsResult._tag === "Failure") {
    console.error("Failed to check quota")
    return NextResponse.json({ error: "Failed to check quota" }, { status: 500 })
  }

  return NextResponse.json({
    available: availableResult.value,
    percentUsed: statsResult.value.percentUsed,
  })
}
