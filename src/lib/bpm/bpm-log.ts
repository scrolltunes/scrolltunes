import { db } from "@/lib/db"
import { bpmFetchLog } from "@/lib/db/schema"
import { Data, Effect } from "effect"

// ============================================================================
// Types
// ============================================================================

export type BpmProvider = "Turso" | "GetSongBPM" | "Deezer" | "ReccoBeats" | "RapidAPISpotify"

export type BpmStage = "turso_embedded" | "cascade_fallback" | "cascade_race" | "last_resort"

export type BpmErrorReason = "not_found" | "rate_limit" | "api_error" | "timeout" | "unknown"

export interface BpmLogEntry {
  lrclibId: number
  songId?: string | undefined
  title: string
  artist: string
  stage: BpmStage
  provider: BpmProvider
  success: boolean
  bpm?: number | undefined
  errorReason?: BpmErrorReason | undefined
  errorDetail?: string | undefined
  latencyMs?: number | undefined
}

// ============================================================================
// Tagged Error
// ============================================================================

class BpmLogInsertError extends Data.TaggedClass("BpmLogInsertError")<{
  readonly cause: unknown
}> {}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map error to standardized reason code
 */
export function mapErrorToReason(error: unknown): BpmErrorReason {
  const message = String(error).toLowerCase()
  if (message.includes("not found") || message.includes("404")) return "not_found"
  if (message.includes("rate limit") || message.includes("429")) return "rate_limit"
  if (message.includes("timeout") || message.includes("timed out")) return "timeout"
  if (message.includes("api") || message.includes("500") || message.includes("503"))
    return "api_error"
  return "unknown"
}

/**
 * Fire-and-forget BPM attempt logging
 * Uses Effect.runFork per architecture.md requirements
 */
export function logBpmAttempt(entry: BpmLogEntry): void {
  const insertEffect = Effect.tryPromise({
    try: () =>
      db.insert(bpmFetchLog).values({
        lrclibId: entry.lrclibId,
        songId: entry.songId ?? null,
        title: entry.title,
        artist: entry.artist,
        stage: entry.stage,
        provider: entry.provider,
        success: entry.success,
        bpm: entry.bpm ?? null,
        errorReason: entry.errorReason ?? null,
        errorDetail: entry.errorDetail?.slice(0, 500) ?? null,
        latencyMs: entry.latencyMs ?? null,
      }),
    catch: error => new BpmLogInsertError({ cause: error }),
  })

  Effect.runFork(
    insertEffect.pipe(
      Effect.catchAll(err =>
        Effect.sync(() => console.error("[BPM Log] Insert failed:", err.cause)),
      ),
    ),
  )
}
