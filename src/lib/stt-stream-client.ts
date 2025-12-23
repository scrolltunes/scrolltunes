"use client"

import { loadPublicConfig } from "@/services/public-config"
import { Context, Data, Effect, Layer, Option } from "effect"

/**
 * STT Stream Client
 *
 * WebSocket client for streaming audio to Google STT via the bridge service.
 * Falls back to REST-based STT if NEXT_PUBLIC_STT_WS_URL is not configured.
 *
 * Protocol:
 * - Client sends config JSON: { languageCode, sampleRateHertz }
 * - Client sends binary PCM16 audio frames
 * - Client sends { type: "end" } or { type: "cancel" } to finalize
 * - Server sends { type: "hello", userId }
 * - Server sends { type: "ready" }
 * - Server sends { type: "transcript", isFinal, text }
 * - Server sends { type: "ended" } or { type: "canceled" }
 * - Server sends { type: "error", message }
 */

// --- Configuration ---

const publicConfig = loadPublicConfig()

function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const isNotProduction = publicConfig.vercelEnv !== "production"
  return isDev || isNotProduction
}

function sttLog(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isDevMode()) return
  const timestamp = new Date().toISOString().substring(11, 23)
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[STT-STREAM ${timestamp}] [${category}] ${message}${dataStr}`)
}

// --- Error Types ---

export class SttStreamError extends Data.TaggedClass("SttStreamError")<{
  readonly code: string
  readonly message: string
}> {}

// --- Types ---

export type SttStreamStatus =
  | "idle"
  | "fetching_token"
  | "connecting"
  | "ready"
  | "streaming"
  | "finalizing"
  | "ended"
  | "error"

export interface SttStreamState {
  readonly status: SttStreamStatus
  readonly partialText: string
  readonly finalText: string | null
  readonly detectedLanguageCode: string | null
  readonly lastTranscriptChangeAt: number | null
  readonly error: string | null
}

export interface SttStreamConfig {
  readonly languageCode?: string
  readonly sampleRateHertz?: number
  readonly alternativeLanguageCodes?: readonly string[]
}

interface ServerMessage {
  type: "hello" | "ready" | "transcript" | "ended" | "canceled" | "error"
  userId?: string
  isFinal?: boolean
  text?: string
  message?: string
  languageCode?: string | null
}

// --- SttStreamClient Class ---

export class SttStreamClient {
  private listeners = new Set<() => void>()
  private ws: WebSocket | null = null
  private token: string | null = null
  private tokenExpiresAt: number | null = null
  private isPrewarming = false

  private state: SttStreamState = {
    status: "idle",
    partialText: "",
    finalText: null,
    detectedLanguageCode: null,
    lastTranscriptChangeAt: null,
    error: null,
  }

  // --- Observable Pattern ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SttStreamState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<SttStreamState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  // --- Public API ---

  get isStreamingAvailable(): boolean {
    return Option.isSome(publicConfig.sttWsUrl)
  }

  /**
   * Pre-warm the STT client by fetching a session token.
   * This reduces latency when actually starting voice search.
   */
  readonly prewarm = (): Effect.Effect<void, never> =>
    Effect.gen(this, function* () {
      if (!this.isStreamingAvailable) return
      if (this.isPrewarming) return
      if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 60000) {
        sttLog("PREWARM", "Token still valid, skipping prewarm")
        return
      }

      this.isPrewarming = true
      sttLog("PREWARM", "Pre-fetching session token")

      const result = yield* Effect.either(this.fetchTokenEffect)
      this.isPrewarming = false

      if (result._tag === "Right") {
        this.token = result.right.token
        this.tokenExpiresAt = result.right.expiresAt
        sttLog("PREWARM", "Token pre-fetched successfully")
      } else {
        sttLog("PREWARM", "Failed to pre-fetch token", { error: result.left.message })
      }
    })

  async prewarmAsync(): Promise<void> {
    return Effect.runPromise(this.prewarm())
  }

  private hasValidToken(): boolean {
    return !!(this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 10000)
  }

  readonly connect = (config: SttStreamConfig = {}): Effect.Effect<void, SttStreamError> =>
    Effect.gen(this, function* () {
      if (Option.isNone(publicConfig.sttWsUrl)) {
        return yield* Effect.fail(
          new SttStreamError({ code: "NO_WS_URL", message: "Streaming STT not configured" }),
        )
      }

      if (this.ws) {
        sttLog("CONNECT", "Already connected, closing existing connection")
        this.close()
      }

      this.setState({ status: "fetching_token", error: null, partialText: "", finalText: null })

      // Use cached token if valid, otherwise fetch new one
      if (!this.hasValidToken()) {
        const tokenResult = yield* this.fetchTokenEffect
        this.token = tokenResult.token
        this.tokenExpiresAt = tokenResult.expiresAt
      } else {
        sttLog("TOKEN", "Using pre-warmed token")
      }

      this.setState({ status: "connecting" })

      // Connect WebSocket
      yield* this.connectWebSocketEffect(config)
    })

  sendAudioFrame(pcmData: ArrayBuffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      sttLog("SEND", "Cannot send audio: WebSocket not open")
      return
    }

    // Only send audio when we're in ready or streaming state
    if (this.state.status !== "ready" && this.state.status !== "streaming") {
      sttLog("SEND", "Cannot send audio: not ready", { status: this.state.status })
      return
    }

    if (this.state.status === "ready") {
      this.setState({ status: "streaming" })
    }

    this.ws.send(pcmData)
  }

  endUtterance(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      sttLog("END", "Cannot end: WebSocket not open")
      return
    }

    sttLog("END", "Sending end command")
    this.setState({ status: "finalizing" })
    this.ws.send(JSON.stringify({ type: "end" }))
  }

  cancel(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      sttLog("CANCEL", "Cannot cancel: WebSocket not open")
      this.close()
      return
    }

    sttLog("CANCEL", "Sending cancel command")
    this.ws.send(JSON.stringify({ type: "cancel" }))
    this.close()
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close(1000, "Client closed")
      } catch {}
      this.ws = null
    }
    this.token = null
    this.setState({ status: "idle" })
  }

  reset(): void {
    this.close()
    this.setState({
      status: "idle",
      partialText: "",
      finalText: null,
      detectedLanguageCode: null,
      lastTranscriptChangeAt: null,
      error: null,
    })
  }

  // --- Private Effects ---

  private readonly fetchTokenEffect: Effect.Effect<
    { token: string; expiresAt: number },
    SttStreamError
  > = Effect.gen(this, function* () {
    sttLog("TOKEN", "Fetching session token")

    const response = yield* Effect.tryPromise({
      try: () => fetch("/api/stt-token"),
      catch: e =>
        new SttStreamError({
          code: "TOKEN_FETCH_ERROR",
          message: `Failed to fetch token: ${String(e)}`,
        }),
    })

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => "Unknown error",
      }).pipe(Effect.orElseSucceed(() => "Unknown error"))

      return yield* Effect.fail(
        new SttStreamError({
          code: response.status === 401 ? "UNAUTHORIZED" : "TOKEN_ERROR",
          message: errorText,
        }),
      )
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ token: string; expiresAt: number }>,
      catch: e =>
        new SttStreamError({
          code: "TOKEN_PARSE_ERROR",
          message: `Failed to parse token response: ${String(e)}`,
        }),
    })

    sttLog("TOKEN", "Token fetched", { expiresAt: data.expiresAt })
    return data
  })

  private connectWebSocketEffect(config: SttStreamConfig): Effect.Effect<void, SttStreamError> {
    return Effect.async<void, SttStreamError>(resume => {
      const baseUrl = Option.getOrThrow(publicConfig.sttWsUrl)
      const wsUrl = `${baseUrl}?session=${encodeURIComponent(this.token ?? "")}`
      sttLog("WS", "Connecting", { url: baseUrl })

      const ws = new WebSocket(wsUrl)
      ws.binaryType = "arraybuffer"
      this.ws = ws

      let hasResumed = false

      ws.onopen = () => {
        sttLog("WS", "Connected, sending config")
        ws.send(
          JSON.stringify({
            languageCode: config.languageCode ?? "en-US",
            sampleRateHertz: config.sampleRateHertz ?? 16000,
            alternativeLanguageCodes: config.alternativeLanguageCodes,
          }),
        )
      }

      ws.onmessage = ev => {
        if (typeof ev.data !== "string") return

        try {
          const msg = JSON.parse(ev.data) as ServerMessage

          switch (msg.type) {
            case "hello":
              sttLog("WS", "Received hello", { userId: msg.userId })
              break

            case "ready":
              sttLog("WS", "Server ready")
              this.setState({ status: "ready" })
              if (!hasResumed) {
                hasResumed = true
                resume(Effect.succeed(undefined))
              }
              break

            case "transcript":
              sttLog("TRANSCRIPT", msg.isFinal ? "Final" : "Partial", {
                text: msg.text,
                languageCode: msg.languageCode,
              })
              if (msg.isFinal) {
                this.setState({
                  finalText: msg.text ?? "",
                  partialText: "",
                  detectedLanguageCode: msg.languageCode ?? null,
                  lastTranscriptChangeAt: Date.now(),
                })
              } else {
                this.setState({
                  partialText: msg.text ?? "",
                  detectedLanguageCode: msg.languageCode ?? this.state.detectedLanguageCode,
                  lastTranscriptChangeAt: Date.now(),
                })
              }
              break

            case "ended":
              sttLog("WS", "Session ended")
              this.setState({ status: "ended" })
              break

            case "canceled":
              sttLog("WS", "Session canceled")
              this.setState({ status: "ended" })
              break

            case "error":
              sttLog("ERROR", "Server error", { message: msg.message })
              this.setState({ status: "error", error: msg.message ?? "Unknown error" })
              break
          }
        } catch (e) {
          sttLog("WS", "Failed to parse message", { error: String(e) })
        }
      }

      ws.onerror = () => {
        sttLog("WS", "WebSocket error")
        if (!hasResumed) {
          hasResumed = true
          resume(Effect.fail(new SttStreamError({ code: "WS_ERROR", message: "WebSocket error" })))
        }
        this.setState({ status: "error", error: "Connection error" })
      }

      ws.onclose = ev => {
        sttLog("WS", "WebSocket closed", { code: ev.code, reason: ev.reason })
        this.ws = null

        // If we were streaming or finalizing, mark as ended so subscribers know to stop
        if (
          this.state.status === "streaming" ||
          this.state.status === "finalizing" ||
          this.state.status === "ready"
        ) {
          this.setState({ status: "ended" })
        }

        if (!hasResumed) {
          hasResumed = true
          if (ev.code === 1000) {
            // Code 1000 before ready means unexpected early close
            resume(
              Effect.fail(
                new SttStreamError({
                  code: "WS_EARLY_CLOSE",
                  message: "Connection closed before ready",
                }),
              ),
            )
          } else {
            resume(
              Effect.fail(
                new SttStreamError({
                  code: "WS_CLOSED",
                  message: ev.reason || "Connection closed unexpectedly",
                }),
              ),
            )
          }
        }
      }

      return Effect.sync(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      })
    })
  }
}

// --- Singleton Instance ---

export const sttStreamClient = new SttStreamClient()

// --- Effect Service ---

/**
 * SttStreamService - Effect service wrapper for STT streaming client
 *
 * Provides dependency injection for the STT streaming client following Effect.ts patterns.
 * Domain logic should depend on this service tag instead of importing the singleton directly.
 */
export class SttStreamService extends Context.Tag("SttStreamService")<
  SttStreamService,
  {
    readonly connect: (config?: SttStreamConfig) => Effect.Effect<void, SttStreamError>
    readonly sendAudioFrame: (data: ArrayBuffer | Uint8Array) => Effect.Effect<void, never>
    readonly endUtterance: Effect.Effect<void, never>
    readonly cancel: Effect.Effect<void, never>
    readonly close: Effect.Effect<void, never>
    readonly reset: Effect.Effect<void, never>
    readonly getState: Effect.Effect<SttStreamState, never>
    readonly subscribe: (listener: () => void) => Effect.Effect<() => void, never>
    readonly isStreamingAvailable: Effect.Effect<boolean, never>
    readonly prewarm: Effect.Effect<void, never>
  }
>() {}

/**
 * Live layer that adapts the singleton SttStreamClient to the SttStreamService interface
 */
export const SttStreamLive = Layer.succeed(SttStreamService, {
  connect: (config?: SttStreamConfig) => sttStreamClient.connect(config),
  sendAudioFrame: (data: ArrayBuffer | Uint8Array) =>
    Effect.sync(() => sttStreamClient.sendAudioFrame(data)),
  endUtterance: Effect.sync(() => sttStreamClient.endUtterance()),
  cancel: Effect.sync(() => sttStreamClient.cancel()),
  close: Effect.sync(() => sttStreamClient.close()),
  reset: Effect.sync(() => sttStreamClient.reset()),
  getState: Effect.sync(() => sttStreamClient.getSnapshot()),
  subscribe: (listener: () => void) => Effect.sync(() => sttStreamClient.subscribe(listener)),
  isStreamingAvailable: Effect.sync(() => sttStreamClient.isStreamingAvailable),
  prewarm: sttStreamClient.prewarm(),
})

// --- React Hooks ---

import { useSyncExternalStore } from "react"

const DEFAULT_STATE: SttStreamState = {
  status: "idle",
  partialText: "",
  finalText: null,
  detectedLanguageCode: null,
  lastTranscriptChangeAt: null,
  error: null,
}

export function useSttStreamState(): SttStreamState {
  return useSyncExternalStore(
    sttStreamClient.subscribe,
    sttStreamClient.getSnapshot,
    () => DEFAULT_STATE,
  )
}

export function useSttStreamControls() {
  return {
    connect: (config?: SttStreamConfig) => sttStreamClient.connect(config),
    sendAudioFrame: (data: ArrayBuffer | Uint8Array) => sttStreamClient.sendAudioFrame(data),
    endUtterance: () => sttStreamClient.endUtterance(),
    cancel: () => sttStreamClient.cancel(),
    close: () => sttStreamClient.close(),
    reset: () => sttStreamClient.reset(),
    isStreamingAvailable: sttStreamClient.isStreamingAvailable,
  }
}

export function useIsStreamingAvailable(): boolean {
  return sttStreamClient.isStreamingAvailable
}
