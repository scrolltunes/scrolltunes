import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { loadDevConfig } from "@/services/dev-config"
import { loadPublicConfig } from "@/services/public-config"
import { Option } from "effect"
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

function isDevMode(): boolean {
  return loadPublicConfig().nodeEnv !== "production"
}

function getLogFile(): string | null {
  if (!isDevMode()) return null
  const devConfig = loadDevConfig()
  return Option.getOrNull(devConfig.vadLogFile)
}

function ensureLogDir(logFile: string): void {
  const dir = dirname(logFile)
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export async function POST(req: NextRequest) {
  const logFile = getLogFile()

  // No file configured or not in dev mode - silently accept
  if (!logFile) {
    return NextResponse.json({ ok: true })
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

  ensureLogDir(logFile)

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
    appendFileSync(logFile, `${lines.join("\n")}\n`)
  }

  return NextResponse.json({ ok: true })
}
