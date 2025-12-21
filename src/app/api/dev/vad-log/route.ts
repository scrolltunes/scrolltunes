import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { loadPublicConfig } from "@/services/public-config"
import { type NextRequest, NextResponse } from "next/server"

type LogEntry = {
  readonly category: string
  readonly message: string
  readonly data?: Record<string, unknown>
  readonly isoTime?: string
}

type Payload = {
  readonly entries: readonly LogEntry[]
}

const VAD_LOG_FILE = process.env.VAD_LOG_FILE ?? "./vad-debug.log"

function ensureLogDir(): void {
  const dir = dirname(VAD_LOG_FILE)
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export async function POST(req: NextRequest) {
  if (loadPublicConfig().nodeEnv === "production") {
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

  ensureLogDir()

  const lines: string[] = []
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== "object") continue
    if (typeof entry.category !== "string" || typeof entry.message !== "string") continue
    const isoTime = entry.isoTime ?? new Date().toISOString()
    const timestamp = isoTime.substring(11, 23)
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : ""
    lines.push(`[VAD ${timestamp}] [${entry.category}] ${entry.message}${dataStr}`)
  }

  if (lines.length > 0) {
    appendFileSync(VAD_LOG_FILE, `${lines.join("\n")}\n`)
  }

  return NextResponse.json({ ok: true })
}
