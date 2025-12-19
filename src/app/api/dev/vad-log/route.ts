import { NextResponse, type NextRequest } from "next/server"

type LogEntry = {
  readonly category: string
  readonly message: string
  readonly data?: Record<string, unknown>
  readonly isoTime?: string
}

type Payload = {
  readonly entries: readonly LogEntry[]
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let payload: Payload | null = null

  try {
    const text = await req.text()
    payload = JSON.parse(text) as Payload
  } catch {
    payload = null
  }

  if (!payload || !Array.isArray(payload.entries)) {
    return NextResponse.json({ ok: true })
  }

  for (const entry of payload.entries) {
    if (!entry || typeof entry !== "object") continue
    if (typeof entry.category !== "string" || typeof entry.message !== "string") continue
    const isoTime = entry.isoTime ?? new Date().toISOString()
    const timestamp = isoTime.substring(11, 23)
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : ""
    console.log(`[VAD ${timestamp}] [${entry.category}] ${entry.message}${dataStr}`)
  }

  return NextResponse.json({ ok: true })
}

