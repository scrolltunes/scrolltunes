# ScrollTunes Voice Search: Streaming Google STT (gRPC) + VAD Tuning + Integration

This document is the practical “do this next” guide for integrating **Google Speech-to-Text streaming** (for **partial / interim transcripts**) into ScrollTunes, while reusing the existing **Silero VAD** “end-of-utterance” behavior described in:

- `docs/voice-search-webspeech-google-stt-plan.md` (raw URL provided)

It covers:

1. **Whether to alter VAD activation parameters** (recommended adjustments for better UX with partials).
2. A concrete **WebSocket ↔ Cloud Run ↔ Google gRPC** design.
3. **Actionable integration points** (what to change in ScrollTunes and where, conceptually).
4. **Client consumption** patterns for Next.js on Vercel.

> Note: I could not reliably browse the repository’s source tree from this environment at the time of writing (GitHub views intermittently error). The integration points below are grounded in the design doc’s described `VoiceActivityStore` responsibilities and common VAD wiring patterns. If you paste/upload the relevant source files, I can produce a fully path-accurate integration map.

---

## 1) Should we alter the VAD activation parameters?

### Current parameters (from the plan)
- **Min speech to count:** 500ms
- **Silence to finalize:** 1.5s (after VAD transitions to “no voice”)

This is sensible when you record a blob and then transcribe. For **streaming STT**, you already get partial results during speech, so VAD’s job shifts to: **when to finalize** (end the stream and trigger the search).

### Recommendation (yes, adjust)
For a search-box UX, the default can be faster without being reckless:

#### Default (“Fast Search”) preset
- `minSpeechMs`: **300ms** (down from 500ms)
- `silenceToFinalizeMs`: **900ms** (down from 1500ms)
- `stableTranscriptMs`: **400ms** (new guard)
- `minCharsBeforeFinalize`: **3–5** (new guard)
- `minTotalSpeechMsBeforeFinalize`: **600ms** (new guard)

#### Why these changes help
- Users see *something* in the search box quickly (interim text), so they feel progress immediately.
- Lower silence-to-finalize reduces “dead air” at the end.
- The stability guard prevents cutting off slow speakers or mid-phrase pauses.

### Stability guard (high-impact)
When the VAD silence timer fires, only finalize if:

- VAD indicates silence for `silenceToFinalizeMs`, **and**
- the interim transcript hasn’t changed for `stableTranscriptMs`

If it *is* still changing, extend the finalize timer by 200–300ms and re-check.

This single rule eliminates a lot of premature-finalize annoyances.

### Noisy environment preset (optional)
- `minSpeechMs`: **450ms**
- `silenceToFinalizeMs`: **1200ms**
- `stableTranscriptMs`: **500ms**
- `minCharsBeforeFinalize`: **5–8**
- `minTotalSpeechMsBeforeFinalize`: **800ms**

Use this if you observe many “false starts” in noisy rooms.

---

## 2) Architecture (Vercel UI + Cloud Run streaming bridge)

### Why this split exists
- **Google streaming STT** (interim results) is **bidirectional streaming gRPC**.
- Vercel-hosted Next.js is not a great place to run a long-lived WebSocket server.
- Solution: keep UI on Vercel, run a small bridge service elsewhere (Cloud Run recommended).

### Data flow
1) Browser captures mic audio as PCM frames.
2) Browser sends PCM frames over **WebSocket** to the bridge service.
3) Bridge forwards audio into Google STT **streamingRecognize** (gRPC).
4) Bridge emits interim / final transcripts back to the browser over the same WebSocket.
5) ScrollTunes VAD decides when to send `{type:"end"}` (finalize).

---

## 3) WebSocket protocol (recommended contract)

### Client → Server
1) Initial config message (JSON, text frame):
```json
{
  "type": "config",
  "languageCode": "en-US",
  "sampleRateHertz": 16000
}
```

2) Audio frames (binary frames):
- PCM16 little-endian
- mono
- 16kHz
- small chunks (10–40ms each is typical; don’t batch into multi-second blobs)

3) End utterance control (JSON, text frame):
```json
{ "type": "end" }
```

4) Abort / cancel (optional):
```json
{ "type": "cancel" }
```

### Server → Client
- Ready:
```json
{ "type": "ready" }
```

- Transcript:
```json
{ "type": "transcript", "isFinal": false, "text": "bohemian rha..." }
```

```json
{ "type": "transcript", "isFinal": true, "text": "bohemian rhapsody" }
```

- Error:
```json
{ "type": "error", "message": "..." }
```

- Optional telemetry:
```json
{ "type": "timing", "tFirstPartialMs": 180, "tFinalMs": 980 }
```

---

## 4) Client-side integration (Next.js on Vercel)

### A) Add a streaming mode in the voice-search state machine
Where ScrollTunes currently has a “Google STT fallback / record then transcribe” path, add a parallel streaming mode:

Suggested states:
- `google_stream_connecting`
- `google_stream_listening`
- `google_stream_finalizing`
- `google_stream_done`
- `google_stream_error`

Suggested state fields:
- `partialText`
- `finalText`
- `lastTranscriptChangeAt`
- `vadState` (`speech | silence`)
- `finalizeTimerId`

### B) Implement a `useGoogleSttStream()` hook/module
Responsibilities:
- Open the WebSocket
- Send config
- Send binary PCM frames
- Receive transcripts and update:
  - `partialText` for `isFinal:false`
  - `finalText` for `isFinal:true`

API surface:
- `connect({ languageCode })`
- `sendAudioFrame(arrayBuffer)`
- `endUtterance()`
- `close()`
- state: `status`, `partialText`, `finalText`, `lastTranscriptChangeAt`, `error`

### C) Audio capture: AudioWorklet (preferred)
Use an AudioWorklet to get low-latency PCM and stream it immediately.

Pipeline:
- `getUserMedia({ audio:true })`
- `AudioContext`
- `audioWorklet.addModule("/pcm-worklet.js")`
- `AudioWorkletNode` posts Float32 frames
- Convert Float32 → PCM16 and send as binary

**Important:** Some browsers won’t truly operate at 16kHz. If the audio context ends up at 48kHz, resample client-side (or resample server-side). Start simple, measure quality, then add resampling only if needed.

### D) Bind interim transcripts to the search input
While streaming:
- update the search box’s value with `partialText`
- show a “listening” indicator
When final arrives:
- set input to `finalText`
- trigger search immediately
- cleanup audio + ws + VAD

---

## 5) VAD wiring (VoiceActivityStore integration points)

The design doc describes `VoiceActivityStore` using Silero VAD to determine end-of-utterance in Google STT mode. In streaming mode:

### Replace “stop recording + upload blob” with “send end control”
- On VAD “speech end”:
  - start a silence timer: `silenceToFinalizeMs`
- If speech resumes:
  - cancel timer
- When timer fires:
  - apply **stability guard**:
    - if transcript stable for `stableTranscriptMs` AND meets minimum guards:
      - send `{type:"end"}`
      - transition to `google_stream_finalizing`
    - else:
      - extend timer by 200–300ms and check again

### Minimum guards (recommended)
Only finalize if:
- `minTotalSpeechMsBeforeFinalize` satisfied OR `partialText.length >= minCharsBeforeFinalize`

This avoids “noise burst then finalize” behavior.

---

## 6) Backend bridge service (Cloud Run)

### Responsibilities
- Accept WebSocket at `/ws`
- On config: create `streamingRecognize({ interimResults: true, config })`
- On binary frame: `recognizeStream.write({ audioContent })`
- On `{type:"end"}`: `recognizeStream.end()`
- Forward STT responses to the client

### Deployment notes
- Set Cloud Run timeout high enough for expected sessions (e.g. 3600s).
- Attach a service account with Speech-to-Text permissions.
- Keep the service stateless per connection.

### Required environment variables
The bridge service needs these credentials (same as ScrollTunes backend):

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID (e.g., `api-project-640068751634`) |
| `GOOGLE_CLOUD_CLIENT_EMAIL` | Service account email |
| `GOOGLE_CLOUD_PRIVATE_KEY` | Service account private key (PEM format) |

Verify with:
```bash
grep -E "^(GOOGLE_CLOUD_PROJECT_ID|GOOGLE_CLOUD_CLIENT_EMAIL|GOOGLE_CLOUD_PRIVATE_KEY)=" .env.local | cut -d= -f1
```

Verify gcloud CLI setup:
```bash
gcloud config get-value project
gcloud services list --enabled --filter="name:speech.googleapis.com"
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

---

## 7) Rollout plan (minimize risk)
1) Enable streaming mode only for the already-planned “Google STT only” path (e.g. Brave desktop).
2) Keep Web Speech primary path unchanged.
3) Add logs/metrics:
   - time to first partial
   - time from VAD finalize trigger to final transcript
   - premature-finalize rate (user quickly restarts mic)
4) Tune parameters after collecting real data.

---

## 8) Checklist

### Client
- [ ] Add streaming states + fields to voice-search store
- [ ] Implement `useGoogleSttStream()`
- [ ] Implement AudioWorklet PCM streaming
- [ ] Wire VAD silence timer to `{type:"end"}`
- [ ] Update search box live from interim transcripts
- [ ] Trigger search on final transcript

### Backend
- [ ] Implement WS server
- [ ] Implement Google gRPC streaming bridge
- [ ] Deploy to Cloud Run with appropriate timeout
- [ ] Add basic logging + error messages

---

## Appendix: What I still need to make this path-accurate
To turn this into precise “edit these files / functions” instructions, share:
- the `VoiceActivityStore` implementation file
- the voice-search UI component/hook that starts/stops recording
- any existing Google STT fallback code path

Then I can map:
- exact event names
- store APIs
- where to insert the streaming hook
- and where to replace blob upload with WS streaming.
