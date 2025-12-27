# ScrollTunes Voice Search: Streaming Google STT Implementation

This document describes the streaming Speech-to-Text implementation for ScrollTunes, providing real-time transcription via WebSocket for browsers without Web Speech API support (e.g., Brave desktop).

## Architecture Overview

```
┌─────────────────┐      WebSocket       ┌──────────────────┐      gRPC       ┌─────────────────┐
│  Browser        │◄────────────────────►│  stt-ws-bridge   │◄───────────────►│  Google STT V2  │
│  (Next.js)      │   PCM audio frames   │  (Cloud Run)     │  Streaming API  │  (Speech API)   │
│                 │   JSON transcripts   │                  │                 │                 │
└─────────────────┘                      └──────────────────┘                 └─────────────────┘
```

### Why This Split Exists

- **Google streaming STT** (interim results) requires **bidirectional gRPC streaming**
- Vercel-hosted Next.js cannot run long-lived WebSocket servers
- Solution: keep UI on Vercel, run a small bridge service on Cloud Run

---

## Implementation Status

### ✅ Completed

#### Client-Side (Next.js on Vercel)

- [x] **SpeechRecognitionStore** (`src/core/SpeechRecognitionStore.ts`)
  - Effect.ts patterns for async operations and error handling
  - Tagged events (`StartRecognition`, `ReceivePartial`, `ReceiveFinal`, etc.)
  - Brave desktop detection via `navigator.brave.isBrave()`
  - Streaming mode integration with `sttStreamClient`
  - VAD-based end-of-utterance detection

- [x] **SttStreamClient** (`src/lib/stt-stream-client.ts`)
  - WebSocket client with Effect.ts patterns
  - Token-based authentication via `/api/stt-token`
  - Binary PCM audio frame transmission
  - Partial/final transcript handling
  - Observable state with `useSyncExternalStore`

- [x] **Audio Capture** (`public/pcm-worklet.js`)
  - AudioWorklet processor for low-latency PCM capture
  - Float32 → PCM16 conversion
  - Configurable buffer size (4096 samples)

- [x] **Token Endpoint** (`src/app/api/stt-token/route.ts`)
  - HMAC-signed session tokens (60s TTL)
  - User authentication required
  - Nonce for replay protection

- [x] **useVoiceSearch Hook** (`src/hooks/useVoiceSearch.ts`)
  - React integration for voice search UI
  - Processing state tracking
  - Quota prefetching

#### Backend Bridge (stt-ws-bridge on Cloud Run)

- [x] **WebSocket Server** (`stt-ws-bridge/server.ts`)
  - Bun-based WebSocket server
  - Google Speech V2 streaming API integration
  - Token verification with timing-safe comparison
  - Rate limiting per IP
  - Origin validation
  - Session timeouts and idle detection

- [x] **Google Server-Side VAD** (`stt-ws-bridge/server.ts`)
  - Uses Google's built-in `voiceActivityTimeout` for end-of-utterance detection
  - `speechStartTimeout`: 5 seconds (max wait for speech to begin)
  - `speechEndTimeout`: 1 second (silence duration to finalize)
  - Server sends `{ type: "ended" }` on `END_OF_SINGLE_UTTERANCE` event

- [x] **Client-Side VAD** (non-streaming mode only)
  - Three presets: `fast`, `default`, `noisy`
  - Runtime switching via `setVADPreset()`
  - Only used for REST-based Google STT fallback, not streaming mode

### ⚠️ Partially Implemented / Known Deviations

#### Multi-Language Detection
- Server supports `alternativeLanguageCodes` in config
- Client currently hardcodes `languageCode: "en-US"` without alternatives
- Wiring from preferences → streaming config not implemented

### ❌ Not Implemented

1. **Telemetry / Timing Metrics**
   - `{ type: "timing", tFirstPartialMs, tFinalMs }` messages
   - Premature-finalize rate tracking
   - Current: basic console logging only

---

## WebSocket Protocol

### Client → Server

1. **Config message** (JSON, text frame, first message):
```json
{
  "languageCode": "en-US",
  "sampleRateHertz": 16000,
  "alternativeLanguageCodes": ["he-IL", "es-ES"]
}
```

2. **Audio frames** (binary frames):
   - PCM16 little-endian, mono, 16kHz
   - ~4096 samples per frame (~256ms)

3. **End utterance** (JSON, text frame):
```json
{ "type": "end" }
```

4. **Cancel** (JSON, text frame):
```json
{ "type": "cancel" }
```

### Server → Client

- **Hello** (after connection):
```json
{ "type": "hello", "userId": "..." }
```

- **Ready** (after config processed):
```json
{ "type": "ready" }
```

- **Transcript** (interim or final):
```json
{ "type": "transcript", "isFinal": false, "text": "bohemian rha...", "languageCode": "en-US" }
```

- **Session ended**:
```json
{ "type": "ended" }
```

- **Error**:
```json
{ "type": "error", "message": "..." }
```

---

## Technical Details

### Google Speech V2 API

- Uses `_streamingRecognize()` private method for bidirectional streaming
- First message must be config request with recognizer path
- Audio sent as `{ audio: base64String }`
- Model: `"long"` (streaming compatible)
- `languageCodes` array for multi-language detection
- `enableVoiceActivityEvents: true` enables server-side VAD
- `voiceActivityTimeout` controls speech start/end detection
- Server emits `END_OF_SINGLE_UTTERANCE` when speech ends

### Authentication Flow

1. Client calls `/api/stt-token` to get HMAC-signed token
2. Token includes: `exp`, `userId`, `nonce`
3. Client connects to WebSocket with `?session=<token>`
4. Bridge verifies token signature and expiration
5. Token TTL: 60s (connect window)
6. Session max: 30s (enforced server-side)

### Rate Limiting

- **Per IP**: 10 connections per 60 seconds
- **Per session**: 5MB max audio, 30s max duration
- **Idle timeout**: 10s with no audio

---

## Key Files

| Component | File | Description |
|-----------|------|-------------|
| Speech Store | `src/core/SpeechRecognitionStore.ts` | Main state machine |
| Stream Client | `src/lib/stt-stream-client.ts` | WebSocket client |
| Voice Search Hook | `src/hooks/useVoiceSearch.ts` | React integration |
| Token Endpoint | `src/app/api/stt-token/route.ts` | Auth token generation |
| PCM Worklet | `public/pcm-worklet.js` | Audio capture |
| Bridge Server | `stt-ws-bridge/server.ts` | Cloud Run service |

---

## Environment Variables

### ScrollTunes (Vercel)

| Variable | Description |
|----------|-------------|
| `WS_SESSION_SECRET` | HMAC secret for token signing (shared with bridge) |
| `NEXT_PUBLIC_STT_WS_URL` | WebSocket bridge URL (e.g., `wss://stt-ws-bridge-xxx.run.app/ws`) |

### stt-ws-bridge (Cloud Run)

| Variable | Description |
|----------|-------------|
| `WS_SESSION_SECRET` | HMAC secret for token verification (shared with app) |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID |
| `GOOGLE_CLOUD_CLIENT_EMAIL` | Service account email |
| `GOOGLE_CLOUD_PRIVATE_KEY` | Service account private key (PEM) |

---

## Deployment

### Bridge Service (Cloud Run)

```bash
cd stt-ws-bridge
bun run deploy
# or manually:
gcloud run deploy stt-ws-bridge \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --session-affinity \
  --timeout 300
```

---

## Architecture Decisions

### Client-Side Effect.ts Usage

`SpeechRecognitionStore` follows Effect.ts patterns:
- Async operations as `Effect.Effect<T, E, R>`
- Tagged errors (`SpeechRecognitionError`)
- Dependency injection via `ClientLayer`
- Tagged events for state transitions

**Known Deviations** (documented, not issues):
- `sttStreamClient` is a global singleton, not injected via Layer
- `speechDetectionStore` is a global singleton for VAD
- Direct browser APIs (`getUserMedia`, `AudioContext`) inside Effects

### Bridge Service (stt-ws-bridge)

**Intentionally does NOT use Effect.ts**. This is a standalone Bun server with:
- Plain TypeScript / Bun runtime
- Event-driven async (callbacks, not Effect)
- try/catch error handling
- Global mutable state for rate limiting

See `stt-ws-bridge/AGENTS.md` for documented architectural violations.

---

## Future Work

1. **Multi-Language Wiring**
   - Pass `alternativeLanguageCodes` from preferences
   - UI for language selection

2. **Named Recognizer**
   - Use named recognizer instead of `_` for Google Cloud monitoring
   - Enables `audio_durations` metric

3. **Telemetry**
   - Time to first partial
   - Time to final transcript
   - Premature-finalize rate

4. **VAD Preset UI**
   - Expose preset selection in settings
   - Auto-detect noisy environment (optional)
