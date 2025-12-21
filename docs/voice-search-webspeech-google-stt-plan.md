# Voice Search (Song Titles) – Web Speech API + Google Cloud STT Fallback  
Detailed implementation plan (for an LLM/agentic coder)

## 0) Objective

Implement a voice-search pipeline for song titles (and optionally artists) optimized for **1–2 second clips**:

- **Primary:** In-browser Web Speech API (fast, free, native end-of-utterance detection)
- **Fallback:** Google Cloud Speech-to-Text (STT) called via Vercel backend when Web Speech confidence is low
- **Search:** Normalize transcript → generate candidates → rank → return results
- **Reliability:** Confidence-based fallback (transcript length, garbage ratio)
- **Cost:** Keep fallback usage low (target < 20% of traffic) while maintaining high success rate

Deliverables: client-side recording + STT orchestration, backend STT endpoint, search/ranking module, logging/monitoring, and rollout plan.

## Current Implementation Status

**Implemented:**
- Web Speech API as primary tier with native end-of-utterance detection
- MediaRecorder runs in parallel to capture audio for potential fallback
- Confidence evaluation: min length (2 chars), garbage ratio (<30%)
- Google STT fallback only when confidence is low AND quota available
- `tierUsed` state tracks which tier produced the final transcript
- Test page at `/test/voice-search`
- **Brave desktop detection** — skips Web Speech and uses Google STT directly
- **VAD-based end-of-utterance** for Google STT mode using VoiceActivityStore

**Brave Desktop Handling:**
- Brave desktop blocks Web Speech API connections to Google's speech servers
- Detection via `navigator.brave.isBrave()` API at initialization
- Mobile Brave uses native OS speech recognition (works fine) — excluded via user-agent pattern `/Android|iPhone|iPad|iPod/i`
- When Brave desktop detected: `useGoogleSTTOnly` flag is set, Web Speech is skipped entirely

**End-of-utterance in Google STT Mode:**
- Uses `VoiceActivityStore` with Silero VAD for robust voice detection in noisy environments
- AND-gate is temporarily disabled (only voice detection needed, not singing+energy gate)
- When VAD reports voice stopped after minimum 500ms of speech, starts a 1.5s silence timer
- If voice resumes before timer fires, timer is cancelled (handles pauses between words)
- If silence persists for 1.5s, recording auto-stops and audio is sent to Google STT

**Not using:**
- Parallel race strategy (simplified to sequential: Web Speech first, fallback if needed)

---

## 1) Assumptions and Constraints

### 1.1 Product constraints
- Audio clips are **1–2 seconds** (hard limit enforced client+server, e.g., 3s max).
- Intended UX: “Tap mic → speak → results” with minimal latency.
- Supported platforms: web, mixed browsers (Chromium dominant, but must handle Safari/Firefox gracefully).
- Catalog: a collection of song metadata (at least title; ideally artist, popularity, and IDs).

### 1.2 Technical constraints
- Web Speech API support is uneven across browsers; treat it as “best effort.”
- Web Speech API audio is sent to a vendor backend; no SLA.
- Google Cloud STT requires credentials; **must not** be called directly from the browser.
- Vercel serverless functions have runtime limits; keep backend lightweight.

---

## 2) High-level Architecture

### 2.1 Components
1. **Client UI**
   - Microphone button, listening indicator, result list, “try again” affordance.
2. **Client STT Orchestrator**
   - Uses Web Speech API when available
   - Applies fallback heuristics
   - Sends audio to backend only when needed
3. **Backend STT Service (Vercel)**
   - `POST /api/stt` accepts audio
   - Calls Google Cloud Speech-to-Text
   - Returns transcript (+ optional alternatives/metadata)
4. **Search & Ranking Module**
   - Normalization, parsing (“by <artist>”), candidate generation, scoring/ranking
5. **Observability**
   - Client + server logs, metrics, and sampling for transcripts and fallback decisions

### 2.2 Data flow
1. User taps mic → client records short clip
2. If Web Speech supported:
   - Start recognition
   - On final transcript → search immediately
   - If low-confidence/ambiguous/no results → fallback to backend STT with recorded audio
3. If Web Speech unsupported or fails:
   - Immediately call backend STT
4. Return results, include metadata on which tier was used

---


---

## 3.2 Fallback Race/Fanout Strategy (Most Reliable → Least Reliable)

This section defines how to “race” multiple STT backends and pick the best result quickly, while preserving reliability and minimizing cost.

### Reliability ordering (authoritative)
From **most reliable** to **least reliable** for this product:

1. **Google Cloud STT (Tier 1)**  
   - Highest quality and consistency across browsers/devices
   - **Must** remain gated by: logged-in + ToS + usage tracker (60-minute free tier)

2. **Self-hosted Whisper (Oracle Always Free, Tier 2)**  
   - Reliability depends on your service uptime and latency
   - No Google data processing; no quota
   - CPU-only, so slower under load than Google, but stable if traffic is low

3. **Web Speech API (Tier 0)**  
   - Browser/vendor-dependent behavior
   - No SLA, sometimes fails silently, and language handling varies
   - Still sends audio to Google servers, so requires logged-in + ToS

> Note: Web Speech is often the *fastest* in Chromium, but it is not the most reliable. We use it as a low-latency opportunistic path, not as the reliability anchor.

---

### Fanout goals
- Keep median “time to usable results” low
- Avoid wasting quota minutes when Web Speech already produced a good transcript
- Prefer higher-reliability engines when results are ambiguous or low-confidence

---

### Fanout mode A: “Speculative Google” (recommended default)

**Trigger:** user is eligible for Google STT (logged-in + ToS accepted + minutes remaining).

1. Start mic capture + VAD.
2. Start **Web Speech** immediately (for speed).
3. In parallel, record the short clip (always).
4. When VAD signals end-of-utterance (or max duration reached):
   - Send recorded audio to **Google STT** immediately.
   - Do **not** wait for Web Speech to finish if it is stalling.

**Winner selection:**
- If Web Speech returns a final transcript first:
  - Run search and compute confidence.
  - If confidence ≥ threshold and not ambiguous → accept Web Speech result and **cancel/ignore** Google result when it arrives.
  - Otherwise, use Google transcript when it arrives.
- If Google returns first:
  - Accept Google transcript (and cancel/ignore Web Speech if still running).

**Why this works:** you get Web Speech speed when it’s good, but Google reliability when it’s needed.

---

### Fanout mode B: “Google + Whisper race” (for reliability-critical queries)

**Trigger:** either of:
- search confidence is low after Web Speech, or
- user is in a browser known to be flaky for Web Speech, or
- you’re seeing increased Google STT errors/timeouts.

At end-of-utterance:
- Send audio to **Google STT** and **Whisper (Oracle)** concurrently.
- First acceptable transcript wins, but apply a quality gate:

**Quality gate rule:**
- If Whisper returns first, accept it **only** if:
  - transcript passes normalization checks (not empty/garbage), and
  - search confidence is good (≥ threshold and not ambiguous)
- Otherwise, wait for Google and use Google.

This keeps Whisper from “winning” with a fast but wrong transcript.

---

### Fanout mode C: “Whisper-first” (quota exhausted or Google disabled)

**Trigger:** Google STT is disallowed due to:
- ToS not accepted (but voice search is locked anyway), or
- usage quota depleted, or
- Google STT outage.

Run:
1. Web Speech opportunistically (if supported)
2. Whisper (Oracle) as the reliability anchor

Winner selection:
- If Web Speech gives a good result → accept
- Else Whisper

---

### Timeouts and cancellation (implementation requirements)

- Web Speech final timeout: ~2.0s after VAD stop
- Google STT request timeout: e.g. 3–5s (clip is tiny)
- Whisper request timeout: e.g. 3–5s (CPU-only)

Use an `AbortController` per request and cancel losers:

```ts
const webAbort = new AbortController()
const googleAbort = new AbortController()
const whisperAbort = new AbortController()

// start tasks...
// when winner chosen:
googleAbort.abort()
whisperAbort.abort()
webAbort.abort()
```

Even if you can’t truly cancel Web Speech mid-flight, you must ignore late results.

---

### Telemetry requirements
Log:
- which engines were started
- which engine won
- reasons for starting fanout (quota, low confidence, browser)
- search confidence metrics for each engine transcript
- end-to-end latency

This is essential to tune thresholds and keep Google usage under control.

---

## 3) Client Implementation Plan

### 3.1 Feature detection and permissions
- Detect Web Speech availability:
  - `window.SpeechRecognition || window.webkitSpeechRecognition`
- Ensure user gesture before calling `recognition.start()`
- Request microphone access for audio recording (MediaRecorder):
  - `navigator.mediaDevices.getUserMedia({ audio: true })`

### 3.2 Audio capture (needed for fallback)
Even if you plan to use Web Speech first, **record audio in parallel** for fallback.

- Use `MediaRecorder` to record a short clip (e.g., `audio/webm;codecs=opus`).
- Enforce max length:
  - stop recording at 2.5–3.0 seconds
- Store:
  - `blob`
  - `durationMs`
  - `mimeType`

### 3.3 Web Speech recognition setup
Configure SpeechRecognition:

- `recognition.lang = localeLangTag` (e.g., `en-US`)
- `recognition.interimResults = true` (optional: show interim)
- `recognition.continuous = false` (single utterance)
- Event handlers:
  - `onstart`: update UI state to “listening”
  - `onresult`: capture interim + final transcripts
  - `onerror`: classify error; trigger fallback if appropriate
  - `onend`: if no final transcript or stalled, consider fallback

### 3.4 State machine (client)
Implement a robust state machine. Example states:

- `idle`
- `listening` (Web Speech active)
- `recording` (MediaRecorder active, usually concurrent with listening)
- `transcribing_webspeech`
- `searching`
- `fallback_transcribing_backend`
- `done`
- `error_mic_permission` (no fallback possible if mic denied)

Store these fields:
- `webSpeechSupported: boolean`
- `webSpeechFinal: string | null`
- `webSpeechInterim: string | null`
- `webSpeechErrorCode: string | null`
- `audioBlob: Blob | null`
- `fallbackUsed: boolean`
- `transcriptFinal: string` (the one used for search)
- `tierUsed: "webspeech" | "google_stt"`
- `latencyMs`: timings described below

### 3.5 Fallback heuristics (no-confidence world)
Because Web Speech doesn’t provide reliable confidence, infer quality using transcript + search results.

#### 3.5.1 Immediate fallback conditions
- Web Speech unavailable
- `onerror` with:
  - `not-allowed`, `service-not-allowed` (recognition blocked)
  - `network` (recognition service failed)
  - `aborted` (if repeated)
- No final transcript within timeout:
  - e.g., 2000ms after speech end / `onend`

#### 3.5.2 Transcript-quality triggers
After normalization and intent stripping:
- Too short (e.g., < 3 chars or < 1 “real word”)
- Only filler words (um, uh, hmm)
- High garbage ratio (non-letters / symbols)

#### 3.5.3 Search-confidence triggers (recommended)
Run search using Web Speech transcript first. Fall back if:
- No results
- `topScore < SCORE_MIN` (e.g., 0.72)
- Ambiguity: `(top1Score - top2Score) < AMBIGUITY_MIN` (e.g., 0.06)
- Title-only match but user said “by <artist>” and artist mismatch strongly

### 3.6 Client timings (for observability)
Capture:
- `t0` user click
- `t_webSpeech_start`, `t_webSpeech_final`
- `t_recording_start`, `t_recording_stop`
- `t_search_start`, `t_search_end`
- `t_fallback_request_start`, `t_fallback_response_end`

Compute:
- `webSpeechLatencyMs`
- `backendLatencyMs`
- `totalTimeToResultsMs`
- `fallbackDecisionReason`

---

## 4) Backend (Vercel) Implementation Plan

### 4.1 Endpoint contract
`POST /api/stt`

Request:
- `Content-Type: multipart/form-data` with field `audio`
- Optional fields:
  - `lang` (BCP-47 tag), default from app
  - `hintTitle` / `hintArtist` (optional)
  - `requestId` for tracing

Response (JSON):
- `transcript: string`
- `alternatives?: string[]` (optional)
- `lang: string`
- `tier: "google_stt"`
- `timingMs: { stt: number, total: number }`

### 4.2 Security
- Authenticate requests (session cookie/JWT) if applicable.
- Rate limit by:
  - user ID
  - IP
- Enforce clip constraints:
  - max duration (best effort: duration metadata; also enforce size limit)
  - max size (e.g., 200KB–500KB, depending on format)

### 4.3 Audio conversion strategy
Google STT supports multiple formats. You have two choices:

1. **Convert on backend** (more CPU):
   - Convert WebM/Opus → LINEAR16 (PCM WAV) 16kHz mono
2. **Send as-is** if supported by the API:
   - Validate supported encoding and sample rate

Recommendation:
- For simplest robustness: **convert on backend** using ffmpeg, but keep clips tiny.

### 4.4 Google Cloud Speech-to-Text integration
- Prefer synchronous recognition for short clips.
- Use streaming only if you need true “live” partial results.

Configuration:
- `languageCode`: from request or app default
- `enableAutomaticPunctuation`: optional (not critical for titles)
- `speechContexts/phraseHints`: optionally inject popular artist names or top-N titles to improve recognition
- Return alternatives if available

### 4.5 Error handling
Return structured errors:
- `400` invalid audio
- `413` too large
- `429` rate limited
- `500/502` upstream STT errors

Client behavior:
- If backend STT fails, show “Try again” and log error.

---

## 4.6 Vercel Setup (Exact Steps)

This section assumes **Google Cloud Speech-to-Text is already configured** (project, API enabled, service account/key or workload identity). Your task here is to wire Vercel to call it reliably and securely.

### 4.6.1 Create the Vercel project

1. Push your repo to a Git provider (GitHub/GitLab/Bitbucket).
2. In the Vercel dashboard:
   - **Add New → Project**
   - Import the repo
   - Choose the framework preset (typically **Next.js**)

3. Confirm build settings:
   - Build command: `next build` (default)
   - Output: Next.js (default)
   - Install: `npm install` / `pnpm install` / `yarn` (whatever your repo uses)

### 4.6.2 Add environment variables (server-only)

In Vercel → Project → **Settings → Environment Variables**:

Add the credentials and configuration your backend needs. Common patterns:

**Option A: Service account JSON (simplest)**
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` = the full JSON contents of the service account key  
  (Paste it as a single-line JSON string if needed; Vercel accepts multi-line too, but keep it exact.)

Then in your server code, write it to `/tmp/sa.json` at runtime and set:
- `GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json`

(You can do that programmatically inside the API route.)

**Option B: Individual fields (more annoying, but robust)**
- `GCP_PROJECT_ID`
- `GCP_CLIENT_EMAIL`
- `GCP_PRIVATE_KEY` (make sure newlines are preserved; replace `\n` with `
` in code)

**General settings**
- `STT_DEFAULT_LANG` = `en-US` (or your default)
- `STT_MAX_SECONDS` = `3` (hard limit)
- `STT_MAX_BYTES` = `500000` (example size limit)
- `STT_REGION` = e.g., `us-central1` (if you want to keep things near your users)
- `STT_ENABLE_LOGGING` = `false` (optional)

Set these for **Production**, and optionally for **Preview** and **Development** too.

### 4.6.3 Create the API route on Vercel (Next.js)

Use **Node runtime**, not Edge (Edge cannot run native binaries and is a bad fit for audio + Google SDK).

**Next.js App Router**
- Create: `app/api/stt/route.ts`

**Next.js Pages Router**
- Create: `pages/api/stt.ts`

Make sure the route:
- Accepts `multipart/form-data` with an `audio` field
- Enforces size and duration constraints
- Calls Google Cloud STT and returns JSON

### 4.6.4 Handling file uploads (multipart) in Next.js

#### App Router (route.ts)
You can use `await req.formData()` to read the upload. Example logic:

- `const form = await req.formData()`
- `const file = form.get("audio") as File`
- Convert to Buffer: `Buffer.from(await file.arrayBuffer())`

Then enforce:
- `buffer.length <= STT_MAX_BYTES`

#### Pages Router (pages/api)
Disable Next.js body parser and use a multipart parser like `formidable`.

- Export config:
  - `export const config = { api: { bodyParser: false } }`
- Parse with `formidable` and read the file path/buffer.

### 4.6.5 Audio conversion on Vercel (optional but recommended)

Browser recordings are often `webm/opus`. Google STT can handle several formats, but conversion tends to be the “works everywhere” choice.

**Recommended approach on Vercel:**
- Use `ffmpeg-static` (ships a Linux ffmpeg binary with your Node function)
- Convert to 16kHz mono WAV (LINEAR16)

Install:
- `npm i ffmpeg-static`

Conversion (conceptual):
- Write input buffer to `/tmp/input.webm`
- Run ffmpeg:
  - `ffmpeg -y -i /tmp/input.webm -ac 1 -ar 16000 -f wav /tmp/audio.wav`
- Read `/tmp/audio.wav` into a buffer and send to STT as LINEAR16

Keep clips short, or you’ll pay in CPU time and cold starts.

### 4.6.6 Configure Vercel Function resources

In Vercel, functions have configurable duration and memory depending on your plan.

Recommended:
- Memory: **1024–2048 MB** (conversion + STT client + buffers)
- Max duration: enough to handle worst-case cold start + STT call (e.g., 10–30s, depending on your plan)

For Next.js, set function config:
- App Router: `export const runtime = "nodejs";`
- You can also set `maxDuration` if supported by your setup:
  - `export const maxDuration = 30;`

### 4.6.7 Regions and latency

Pick regions close to users to reduce round-trip time.

- In Vercel project settings, choose a region strategy (or set `regions` for functions if your framework supports it).
- If your users are mostly in one geography, keep the function there.

### 4.6.8 Verify in Preview before Production

1. Deploy a preview branch (Vercel does this automatically on PRs).
2. Test:
   - Upload a 2s clip from Chrome
   - Confirm transcript response under 1–2 seconds
   - Confirm size limits, error handling, and rate limiting
3. If it works, promote/merge to deploy Production.

### 4.6.9 Minimal operational guardrails

- Rate limit `/api/stt` (IP + user ID).
- Return `429` with a short cooldown if exceeded.
- Log only:
  - timing, sizes, error codes
  - avoid logging raw audio and full transcripts unless sampled and explicitly allowed

---


---

## 4.8 Self-Hosted Whisper on Oracle Cloud (Always Free, tiny.en)

This section documents an **alternative to Hetzner** that supports **on-demand `whisper.cpp` with `tiny.en`** using a **true free tier**.

Oracle Cloud Infrastructure (OCI) offers an **Always Free** allocation that is sufficient for CPU-based Whisper inference on short clips.

---

### 4.8.1 Recommended Oracle Cloud configuration

**OCI Always Free – Ampere A1**

- Architecture: ARM64 (Ampere A1)
- Total Always Free allowance (per tenancy):
  - **4 OCPUs**
  - **24 GB RAM**
- Cost: **$0/month** if you stay within limits

This is enough to run:
- `whisper.cpp tiny.en`
- ffmpeg audio normalization
- A small HTTP service

Latency is slightly higher than x86 Hetzner CX machines, but acceptable for fallback STT.

---

### 4.8.2 OS and base setup

1. Create an **Ampere A1 Compute Instance** in an Always Free region.
2. Use **Ubuntu 22.04 LTS (ARM64)**.
3. SSH into the instance and install dependencies:

```bash
sudo apt update && sudo apt install -y build-essential git ffmpeg
```

---

### 4.8.3 Build whisper.cpp on ARM64

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make -j
```

Download the model:

```bash
bash ./models/download-ggml-model.sh tiny.en
```

Test locally:

```bash
./main -m models/ggml-tiny.en.bin -f samples/jfk.wav --no-timestamps
```

---

### 4.8.4 Service architecture

Use the same microservice design as the Hetzner setup:

- HTTP endpoint accepting short audio uploads
- Strict limits:
  - Max duration: **3 seconds**
  - Max payload size: **~500 KB**
- ffmpeg normalization to 16kHz mono WAV
- Execute whisper.cpp per request
- Return transcript JSON

Example response:

```json
{
  "transcript": "bohemian rhapsody",
  "model": "tiny.en",
  "engine": "whisper.cpp",
  "infra": "oracle-always-free"
}
```

---

### 4.8.5 Networking, security, and availability

- Oracle instances are public by default:
  - Restrict ingress to required ports only
- Strongly recommended:
  - Place **Cloudflare** in front
  - Enforce API key authentication
  - Add basic rate limiting
- Expect:
  - No autoscaling
  - Occasional noisy-neighbor effects
  - Acceptable uptime for a fallback tier

---

### 4.8.6 When to prefer Oracle over Hetzner

| Criterion | Oracle Always Free | Hetzner CX |
|---------|-------------------|------------|
| Monthly cost | **$0** | €12+ |
| CPU performance | Medium | High |
| Architecture | ARM64 | x86_64 |
| Predictability | Medium | High |
| Best use | Low-volume fallback | Primary fallback |

**Recommendation:**
- Use **Oracle Always Free** for:
  - early-stage
  - low traffic
  - cost-zero fallback
- Migrate to **Hetzner** once Whisper becomes performance-critical or traffic grows.

---


---

## 5) Search & Ranking Module

### 5.1 Transcript normalization
Create a shared normalization function (client and server can share logic).

Steps:
1. Lowercase
2. Unicode normalize (NFKC)
3. Remove punctuation (keep apostrophes optionally)
4. Collapse whitespace
5. Strip intent prefixes:
   - play, find, search, listen to, song
6. Parse optional artist:
   - Split on “ by ” (and language variants if needed)
7. Produce:
   - `rawTranscript`
   - `queryTitle`
   - `queryArtist?`

### 5.2 Candidate generation
Depending on your catalog backend:

- If using a search engine (Algolia/Meilisearch/Elastic):
  - Query title
  - Add artist filter or boost if present
- If using a database:
  - Precompute normalized fields and trigram indexes
  - Candidate set via trigram similarity or prefix match

### 5.3 Scoring
Compute a score in [0, 1]. Use a combination:
- String similarity between `queryTitle` and candidate title:
  - Jaro-Winkler or normalized Levenshtein
- Artist similarity boost if `queryArtist` present
- Popularity prior (log-scaled)
- User personalization (recent listens) if available

Return:
- `topK` results with scores
- `topScore`, `top2Score`

### 5.4 Confidence thresholds
Start with:
- `SCORE_MIN = 0.72`
- `AMBIGUITY_MIN = 0.06`

Tune via logs:
- Track false fallbacks (fallback used but Web Speech would have been fine)
- Track missed fallbacks (no fallback but results incorrect)

---

## 6) Putting It Together: Orchestration Algorithm (Pseudo-steps)

1. Start recording audio (MediaRecorder), start Web Speech if supported.
2. Wait for either:
   - Web Speech final transcript, or
   - Web Speech error/timeout
3. If Web Speech final:
   - Normalize transcript
   - Run search
   - If search confidence good:
     - Return results (tier=webspeech)
   - Else:
     - Call backend STT with recorded audio
     - Normalize backend transcript
     - Run search again
     - Return results (tier=google_stt, fallbackReason=low_confidence)
4. If Web Speech failed/unavailable:
   - Call backend STT
   - Normalize transcript
   - Search and return

Edge cases:
- If recording failed but Web Speech succeeded: still proceed with Web Speech only.
- If both fail: show retry.

---

## 7) Observability & Metrics

### 7.1 Client events
Log (sampled, privacy-aware):
- `speech_started`
- `webspeech_result_final`
- `webspeech_error`
- `fallback_triggered` with reason
- `backend_stt_success/failure`
- `search_results` with `topScore`, `ambiguity`, `resultCount`
- Latencies

### 7.2 Backend logs
- requestId, userId (hashed), clip size, conversion time, STT time, response time
- error class and upstream codes

### 7.3 KPIs
- Success rate: % queries yielding a click/play
- Fallback rate
- Median time-to-results
- Incorrect result rate (if you have labeling/feedback)
- Cost per successful query (backend minutes + compute)

---

## 8) Testing Plan

### 8.1 Unit tests
- Normalization and parsing (“by” handling)
- Similarity scoring
- Confidence logic

### 8.2 Integration tests
- Web Speech mock (simulate final/timeout/error)
- Backend STT endpoint (mock Google STT responses)
- End-to-end: audio blob upload → transcript → search

### 8.3 Audio test set
Build a small test corpus:
- Common titles
- Confusables (“halo” vs “hello”)
- Artist inclusion (“halo by beyonce”)
- Background noise
- Different accents

Measure:
- Web Speech transcript quality vs backend STT
- Overall match correctness

---

## 9) Rollout Plan

1. Phase 1: Web Speech only (Chromium users), log everything
2. Phase 2: Add fallback for unsupported browsers + hard errors
3. Phase 3: Add confidence-based fallback (no results / low score / ambiguity)
4. Phase 4: Add speech hints (artist/title priors) to backend STT
5. Phase 5: Tune thresholds + optimize search ranking

---

## 10) Implementation Checklist (Concrete Tasks)

### Client
- [ ] Add mic UI + state machine
- [ ] Implement MediaRecorder capture with duration/size limits
- [ ] Implement Web Speech recognition wrapper
- [ ] Implement fallback decision logic
- [ ] Implement shared transcript normalization
- [ ] Implement search call + confidence scoring output
- [ ] Add telemetry hooks

### Backend (Vercel)
- [ ] `POST /api/stt` multipart upload
- [ ] Validate audio constraints + rate limiting
- [ ] Optional ffmpeg conversion (if required)
- [ ] Google Cloud STT call (sync)
- [ ] Return transcript + metadata
- [ ] Server logs + tracing

### Search
- [ ] Build candidate retrieval layer (DB/search engine)
- [ ] Implement ranking + confidence scores
- [ ] Return topK results and diagnostic scores

### Ops
- [ ] Dashboards: fallback rate, latency, error rates
- [ ] Budget alerts for Google STT minutes
- [ ] Privacy review (what gets logged, sampling, redaction)

---

## 11) Notes on Privacy and Compliance

- Web Speech sends audio to a third-party service via browser implementation; document this in privacy policy.
- For backend STT:
  - Decide whether to enable data logging (cheaper vs privacy)
  - Avoid storing raw audio unless needed for debugging (use sampling and explicit opt-in if possible)
- Redact or hash user identifiers in telemetry.

---

## 12) Suggested Defaults (Start Here)

- Max clip length: **3.0s**
- Web Speech final timeout: **2.0s** after `onend`
- Fallback confidence:
  - `SCORE_MIN = 0.72`
  - `AMBIGUITY_MIN = 0.06`
- Preferred model: Google STT standard for low-latency sync
- Target fallback rate: **< 20%**
- Target median time-to-results: **< 800ms** on Chromium warm path (excluding network)
