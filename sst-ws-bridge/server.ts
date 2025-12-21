import crypto from "node:crypto"
import { v2 } from "@google-cloud/speech"
import type { ServerWebSocket } from "bun"

const { SpeechClient } = v2
const speechClient = new SpeechClient()
const PORT = Number(process.env.PORT) || 8080

// Validate required env vars at startup
const WS_SESSION_SECRET = process.env.WS_SESSION_SECRET
if (!WS_SESSION_SECRET) {
  throw new Error("Missing WS_SESSION_SECRET env var")
}

const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID
if (!GOOGLE_CLOUD_PROJECT_ID) {
  throw new Error("Missing GOOGLE_CLOUD_PROJECT_ID env var")
}

// V2 API uses a recognizer resource path
const RECOGNIZER_PATH = `projects/${GOOGLE_CLOUD_PROJECT_ID}/locations/global/recognizers/_`

// --- Configuration ---
const MAX_SESSION_DURATION_MS = 30_000
const MAX_BYTES_PER_SESSION = 5 * 1024 * 1024 // 5MB max audio per session
const IDLE_TIMEOUT_MS = 10_000 // Close if no audio for 10s after stream starts
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_CONNECTIONS = 10
const ALLOWED_ORIGINS = new Set([
  "https://scrolltunes.com",
  "https://www.scrolltunes.com",
  "http://localhost:3000",
  "https://localhost:3000",
])

// --- Token verification ---
interface TokenPayload {
  exp: number
  userId: string
  nonce: string
}

function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null

  const [payloadB64, sigB64] = parts
  if (!payloadB64 || !sigB64) return null

  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url")

  // Timing-safe comparison
  const sigBuffer = Buffer.from(sigB64, "utf8")
  const expectedBuffer = Buffer.from(expectedSig, "utf8")

  if (sigBuffer.length !== expectedBuffer.length) return null
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null

  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8")
    const payload = JSON.parse(payloadJson) as Partial<TokenPayload>

    if (!payload.exp || typeof payload.exp !== "number") return null
    if (Date.now() > payload.exp) return null
    if (!payload.userId || typeof payload.userId !== "string") return null

    return payload as TokenPayload
  } catch {
    return null
  }
}

// --- Rate limiting per IP ---
const ipConnectionCounts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipConnectionCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    ipConnectionCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > RATE_LIMIT_MAX_CONNECTIONS
}

function log(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString()
  const dataStr = data ? ` ${JSON.stringify(data)}` : ""
  console.log(`[${timestamp}] [${level}] ${message}${dataStr}`)
}

// Safe send that checks WebSocket readyState
function safeSend(ws: ServerWebSocket<ConnectionState>, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

// V2 streaming uses a different stream type
type RecognizeStream = ReturnType<typeof speechClient._streamingRecognize>

// --- Per-connection state ---
interface ConnectionState {
  ip: string
  claims: TokenPayload
  sessionStart: number
  recognizeStream: RecognizeStream | null
  started: boolean
  configSent: boolean
  sessionTimeoutId: ReturnType<typeof setTimeout> | null
  idleTimeoutId: ReturnType<typeof setTimeout> | null
  totalBytesReceived: number
  disconnectReason: string
}

// --- Bun server ---
const server = Bun.serve<ConnectionState>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url)

    // Health check endpoint
    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 })
    }

    // WebSocket upgrade for /ws path
    if (url.pathname === "/ws") {
      const ip = server.requestIP(req)?.address ?? "unknown"
      const origin = req.headers.get("origin")

      // Validate origin
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        log("WARN", "Connection rejected: invalid origin", { origin, ip })
        return new Response("Forbidden", { status: 403 })
      }

      // Rate limit check
      if (isRateLimited(ip)) {
        log("WARN", "Connection rejected: rate limited", { ip })
        return new Response("Too Many Requests", { status: 429 })
      }

      // Token validation
      const token = url.searchParams.get("session")
      if (!token) {
        log("WARN", "Connection rejected: no session token", { ip })
        return new Response("Unauthorized", { status: 401 })
      }

      const claims = verifyToken(token, WS_SESSION_SECRET)
      if (!claims) {
        log("WARN", "Connection rejected: invalid/expired token", { ip })
        return new Response("Unauthorized", { status: 401 })
      }

      // Upgrade to WebSocket with connection state
      const upgraded = server.upgrade(req, {
        data: {
          ip,
          claims,
          sessionStart: Date.now(),
          recognizeStream: null,
          started: false,
          configSent: false,
          sessionTimeoutId: null,
          idleTimeoutId: null,
          totalBytesReceived: 0,
          disconnectReason: "unknown",
        } satisfies ConnectionState,
      })

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 })
      }

      return undefined
    }

    return new Response("Not Found", { status: 404 })
  },

  websocket: {
    open(ws) {
      const state = ws.data
      log("INFO", "Connection opened", { ip: state.ip, userId: state.claims.userId })

      // Enforce max session duration
      state.sessionTimeoutId = setTimeout(() => {
        state.disconnectReason = "max_duration_exceeded"
        log("INFO", "Session timeout, closing", {
          ip: state.ip,
          userId: state.claims.userId,
          durationMs: MAX_SESSION_DURATION_MS,
        })
        ws.close(1000, "Session timeout")
      }, MAX_SESSION_DURATION_MS)

      safeSend(ws, { type: "hello", userId: state.claims.userId })
    },

    message(ws, message) {
      const state = ws.data
      const isBinary = message instanceof ArrayBuffer || message instanceof Uint8Array

      const resetIdleTimeout = () => {
        if (state.idleTimeoutId) {
          clearTimeout(state.idleTimeoutId)
        }
        state.idleTimeoutId = setTimeout(() => {
          state.disconnectReason = "idle_timeout"
          log("INFO", "Idle timeout, closing", { ip: state.ip, userId: state.claims.userId })
          ws.close(1000, "Idle timeout")
        }, IDLE_TIMEOUT_MS)
      }

      const startStream = (cfg: {
        sampleRateHertz?: number
        languageCode?: string
        alternativeLanguageCodes?: string[]
      } = {}) => {
        // Build V2 recognition config
        // Use explicit encoding for PCM16 audio from browser
        const explicitDecodingConfig = {
          encoding: "LINEAR16" as const,
          sampleRateHertz: cfg.sampleRateHertz ?? 16000,
          audioChannelCount: 1,
        }

        // Build language codes array for multi-language detection
        // Use chirp_2 model which supports multiple languages well
        // Note: Hebrew uses "iw-IL" not "he-IL" in Google Speech API
        const defaultLanguageCodes = ["en-US"]
        const languageCodes =
          cfg.alternativeLanguageCodes && cfg.alternativeLanguageCodes.length > 0
            ? [cfg.languageCode ?? "en-US", ...cfg.alternativeLanguageCodes]
            : cfg.languageCode
              ? [cfg.languageCode]
              : defaultLanguageCodes

        const recognitionConfig = {
          explicitDecodingConfig,
          languageCodes,
          model: "long",
        }

        const streamingConfig = {
          config: recognitionConfig,
          streamingFeatures: {
            interimResults: true,
          },
        }

        const configRequest = {
          recognizer: RECOGNIZER_PATH,
          streamingConfig,
        }

        log("INFO", "Creating V2 STT stream", {
          recognizer: RECOGNIZER_PATH,
          languageCodes,
          sampleRate: explicitDecodingConfig.sampleRateHertz,
        })

        // V2 uses _streamingRecognize (private method)
        state.recognizeStream = speechClient
          ._streamingRecognize()
          .on("data", (response: { results?: Array<{ alternatives?: Array<{ transcript?: string }>; isFinal?: boolean; languageCode?: string }> }) => {
            const result = response.results?.[0]
            const alt = result?.alternatives?.[0]
            if (!alt) return

            safeSend(ws, {
              type: "transcript",
              isFinal: !!result.isFinal,
              text: alt.transcript ?? "",
              languageCode: result.languageCode ?? null,
            })
          })
          .on("error", (err: Error) => {
            log("ERROR", "STT stream error", {
              ip: state.ip,
              userId: state.claims.userId,
              error: err.message,
              code: (err as NodeJS.ErrnoException).code,
            })
            safeSend(ws, { type: "error", message: err.message || String(err) })
            cleanup("stt_error")
            ws.close(1000, "STT error")
          })

        // V2: First message must be config request
        state.recognizeStream.write(configRequest)
        state.configSent = true

        state.started = true
        resetIdleTimeout()
        safeSend(ws, { type: "ready" })
        log("INFO", "V2 STT stream started", {
          ip: state.ip,
          userId: state.claims.userId,
          languageCodes,
        })
      }

      const cleanup = (reason?: string) => {
        if (reason) state.disconnectReason = reason

        if (state.sessionTimeoutId) {
          clearTimeout(state.sessionTimeoutId)
          state.sessionTimeoutId = null
        }

        if (state.idleTimeoutId) {
          clearTimeout(state.idleTimeoutId)
          state.idleTimeoutId = null
        }

        if (state.recognizeStream) {
          try {
            state.recognizeStream.end()
          } catch {}
          state.recognizeStream = null
        }
        state.started = false
        state.configSent = false
      }

      // Handle starting the stream
      if (!state.started) {
        if (!isBinary) {
          try {
            const cfg = JSON.parse(message as string)
            startStream(cfg)
            return
          } catch {
            startStream()
          }
        } else {
          startStream()
        }
      }

      if (!state.recognizeStream) return

      // Handle binary audio data
      if (isBinary) {
        const buffer = message instanceof ArrayBuffer ? Buffer.from(message) : Buffer.from(message)
        state.totalBytesReceived += buffer.length

        // Check max bytes limit
        if (state.totalBytesReceived > MAX_BYTES_PER_SESSION) {
          log("WARN", "Max bytes exceeded, closing", {
            ip: state.ip,
            userId: state.claims.userId,
            totalBytes: state.totalBytesReceived,
          })
          cleanup("max_bytes_exceeded")
          ws.close(1000, "Max audio limit exceeded")
          return
        }

        resetIdleTimeout()
        // V2: Audio must be wrapped in { audio: base64String }
        const audioBase64 = buffer.toString("base64")
        state.recognizeStream.write({ audio: audioBase64 })
        return
      }

      // Handle text messages (end/cancel commands)
      try {
        const obj = JSON.parse(message as string)
        if (obj?.type === "end") {
          const duration = Date.now() - state.sessionStart
          log("INFO", "Client sent end, finalizing stream", {
            ip: state.ip,
            userId: state.claims.userId,
            durationMs: duration,
            totalBytes: state.totalBytesReceived,
          })

          // End the Google stream gracefully - it will emit remaining results
          // then trigger the 'end' event which we handle below
          if (state.recognizeStream) {
            state.recognizeStream.once("end", () => {
              log("INFO", "STT stream ended, closing WebSocket", {
                ip: state.ip,
                userId: state.claims.userId,
              })
              cleanup("client_end")
              safeSend(ws, { type: "ended" })
              ws.close(1000, "Done")
            })
            state.recognizeStream.end()
          } else {
            cleanup("client_end")
            safeSend(ws, { type: "ended" })
            ws.close(1000, "Done")
          }
        } else if (obj?.type === "cancel") {
          const duration = Date.now() - state.sessionStart
          log("INFO", "Client sent cancel, closing", {
            ip: state.ip,
            userId: state.claims.userId,
            durationMs: duration,
            totalBytes: state.totalBytesReceived,
          })
          cleanup("client_cancel")
          safeSend(ws, { type: "canceled" })
          ws.close(1000, "Canceled")
        }
      } catch {}
    },

    close(ws, code, reason) {
      const state = ws.data
      const duration = Date.now() - state.sessionStart

      // Cleanup timeouts
      if (state.sessionTimeoutId) {
        clearTimeout(state.sessionTimeoutId)
      }
      if (state.idleTimeoutId) {
        clearTimeout(state.idleTimeoutId)
      }
      if (state.recognizeStream) {
        try {
          state.recognizeStream.end()
        } catch {}
      }

      log("INFO", "Connection closed", {
        ip: state.ip,
        userId: state.claims.userId,
        code,
        reason: reason || state.disconnectReason,
        durationMs: duration,
        totalBytes: state.totalBytesReceived,
      })
    },
  },
})

log("INFO", `Server listening on :${server.port}`)
