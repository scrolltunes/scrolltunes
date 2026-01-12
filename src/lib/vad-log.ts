"use client"

import { loadPublicConfig } from "@/services/public-config"
import { Effect } from "effect"

const publicConfig = loadPublicConfig()

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  if (publicConfig.nodeEnv !== "production") return true
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const isNotProduction = publicConfig.vercelEnv !== "production"
  return isDev || isNotProduction
}

type ServerVADLogEntry = {
  readonly category: string
  readonly message: string
  readonly data?: Record<string, unknown>
  readonly isoTime: string
}

let serverLogQueue: ServerVADLogEntry[] = []
let serverLogFlushTimer: number | null = null

function queueServerVADLog(entry: ServerVADLogEntry): void {
  if (typeof window === "undefined") return
  if (!isDevMode()) return

  if (serverLogQueue.length >= 200) {
    serverLogQueue = serverLogQueue.slice(-100)
  }
  serverLogQueue.push(entry)

  if (serverLogFlushTimer !== null) return
  serverLogFlushTimer = window.setTimeout(() => {
    serverLogFlushTimer = null
    flushServerVADLogs()
  }, 250)
}

function flushServerVADLogs(): void {
  if (typeof window === "undefined") return
  if (serverLogQueue.length === 0) return

  const entries = serverLogQueue
  serverLogQueue = []

  const body = JSON.stringify({ entries })

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(
      "/api/dev/vad-log",
      new Blob([body], { type: "application/json" }),
    )
    if (ok) return
  }

  Effect.runFork(
    Effect.tryPromise(() =>
      fetch("/api/dev/vad-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }),
    ).pipe(
      Effect.catchAll(() =>
        Effect.sync(() => {
          serverLogQueue = entries.slice(-100).concat(serverLogQueue).slice(-200)
        }),
      ),
    ),
  )
}

export function vadLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isDevMode()) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[VAD ${timestamp}] [${category}] ${message}${dataStr}`)

  queueServerVADLog({
    category,
    message,
    isoTime: new Date().toISOString(),
    ...(data ? { data } : {}),
  })
}

export function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
