# sst-ws-bridge

WebSocket bridge service for streaming Google Speech-to-Text. Deployed to Cloud Run.

**This service intentionally uses plain TypeScript/Bun, NOT Effect.ts.**

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start with hot reload
bun run start        # Start production server
bun run deploy       # Deploy to Cloud Run
```

## APIs (Bun)

- `Bun.serve()` for HTTP + WebSocket server
- `@google-cloud/speech` v2 for streaming STT
- No external frameworks (Express, ws, etc.)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 8080) | No |
| `WS_SESSION_SECRET` | HMAC secret for token verification | Yes |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID | Yes |
| `GOOGLE_CLOUD_CLIENT_EMAIL` | Service account email | Yes (via ADC) |
| `GOOGLE_CLOUD_PRIVATE_KEY` | Service account private key | Yes (via ADC) |

On Cloud Run, credentials are auto-provided via Application Default Credentials (ADC).

## Deployment

```bash
gcloud run deploy stt-ws-bridge \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --session-affinity \
  --timeout 300
```

Set environment variables in Cloud Run console or via `gcloud run services update`.

---

## Architecture Decisions

### Why Plain TypeScript (Not Effect.ts)

The main ScrollTunes app uses Effect.ts for:
- Async operations and error handling
- Dependency injection via Context/Layer
- Configuration via Config module
- Tagged errors and typed error channels

**This bridge service deliberately does NOT use Effect.ts** for these reasons:

1. **Standalone microservice** — Self-contained, single-purpose service
2. **Event-driven nature** — WebSocket + gRPC streams are inherently callback-based
3. **Simpler operational model** — Easier to debug and monitor in isolation
4. **No shared code with main app** — No benefit from Effect.ts DI or services

This is a documented architectural decision, not technical debt.

---

## Documented Violations of ScrollTunes Architecture

The following patterns deviate from the main ScrollTunes codebase conventions. They are intentional and documented:

### 1. No Effect Runtime

**Convention**: Use Effect for all async operations
**Violation**: Uses Bun's native async/await and event-driven patterns

```typescript
// What we do (intentional):
speechClient._streamingRecognize()
  .on("data", (response) => { ... })
  .on("error", (err) => { ... })

// What ScrollTunes convention would require:
// Effect.async + Effect.tryPromise + typed error channels
```

### 2. No Context/Layer DI

**Convention**: Dependencies modeled as Effect services via Context.Tag
**Violation**: Uses global singletons and module-level instantiation

```typescript
// What we do (intentional):
const speechClient = new SpeechClient()
const ipConnectionCounts = new Map<string, { count: number; resetAt: number }>()

// What ScrollTunes convention would require:
// class SpeechClientService extends Context.Tag<...>() {}
// const SpeechClientLive = Layer.effect(...)
```

### 3. Plain Error Handling

**Convention**: Tagged errors with Data.TaggedClass, typed error channels
**Violation**: Uses try/catch, null returns, string error messages

```typescript
// What we do (intentional):
function verifyToken(token: string, secret: string): TokenPayload | null {
  try { ... }
  catch { return null }
}

// What ScrollTunes convention would require:
// class TokenVerificationError extends Data.TaggedClass("TokenVerificationError")<...> {}
// const verifyToken = (...): Effect.Effect<TokenPayload, TokenVerificationError> => ...
```

### 4. Raw Environment Access

**Convention**: Use Effect.Config + ConfigProvider, validate at startup
**Violation**: Direct `process.env` access at module load

```typescript
// What we do (intentional):
const WS_SESSION_SECRET = process.env.WS_SESSION_SECRET
if (!WS_SESSION_SECRET) throw new Error("Missing WS_SESSION_SECRET")

// What ScrollTunes convention would require:
// const ServerConfig = Config.all({ wsSessionSecret: Config.nonEmptyString("WS_SESSION_SECRET"), ... })
// Layer.effect(ServerConfig, config)
```

### 5. Manual Resource Lifecycle

**Convention**: Effect scopes for resource management
**Violation**: Manual setTimeout/clearTimeout, explicit cleanup functions

```typescript
// What we do (intentional):
state.sessionTimeoutId = setTimeout(() => { ... }, MAX_SESSION_DURATION_MS)
// ... later in cleanup:
if (state.sessionTimeoutId) clearTimeout(state.sessionTimeoutId)

// What ScrollTunes convention would require:
// Effect.acquireRelease for managed resources
```

### 6. Console Logging

**Convention**: Effect-based structured logging
**Violation**: Plain console.log wrapper

```typescript
// What we do (intentional):
function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>): void {
  console.log(`[${timestamp}] [${level}] ${message}${dataStr}`)
}

// What ScrollTunes convention would require:
// Effect.logInfo, Effect.logWarning, Effect.logError with structured data
```

---

## Future Considerations

If this service grows in complexity (multiple speech providers, complex routing, shared utilities with main app), consider:

1. Migrating to Effect.ts patterns for consistency
2. Creating shared Effect services for speech client wrapper
3. Using Effect's resource scoping for stream lifecycle

For now, the simple event-driven approach is appropriate for a focused bridge service.

---

## Testing

```bash
bun test
```

Currently no tests. Consider adding:
- Token verification unit tests
- WebSocket protocol compliance tests
- Mock Google STT integration tests
