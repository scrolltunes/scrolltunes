# Voice Search Implementation Plan

> Design doc for voice-to-text song search using Google Cloud Speech-to-Text V2 (Chirp 3)

## Overview

Add voice search capability allowing musicians to search for songs hands-free. The feature detects speech in any supported language, shows transcribed text in the detected language, and triggers the existing search flow.

## Architecture

```
Browser → WebSocket → Next.js API → Google STT V2 (Chirp 3)
   ↓                      ↓
VoiceActivityStore   streams audio
(mic + VAD)          returns partial/final transcripts
```

### High-Level Flow

**Client (browser)**
- User taps mic → `SpeechRecognitionStore.start()`:
  - Ensures mic is active using existing `VoiceActivityStore` / `soundSystem`
  - Opens WebSocket to `/api/voice-search/stream`
  - Starts streaming audio chunks (PCM) from mic to server
  - Listens for transcript messages to update UI (`partial` + `final`)
- `SongSearch` subscribes to `SpeechRecognitionStore`, shows:
  - Mic state (idle/connecting/listening)
  - Level waveform (from `VoiceActivityStore`)
  - Live transcript preview in the detected language
- When a **final** transcript arrives or auto-stop triggers:
  - `SongSearch` updates its `query` state with transcript
  - Calls existing `searchTracks(transcript)` to fetch from `/api/search`

**Server (Next.js API route)**
- New route: `app/api/voice-search/stream/route.ts`
  - Upgrades HTTP to WebSocket
  - First message: JSON config (sample rate, language hints)
  - Subsequent messages: audio chunks (binary, e.g. Int16 mono 16kHz)
- Uses `@google-cloud/speech` (Chirp v2) with streamingRecognize:
  - Config:
    - `model` = Chirp 3 (e.g. `"chirp"`/`"chirp_general"`)
    - `languageCodes`: list of supported languages
    - Automatic language detection enabled (multi-language)
    - `enableAutomaticPunctuation` = true
  - Sends incoming audio chunks into the gRPC stream
  - For each Google response:
    - Emits WebSocket JSON messages:
      - `{"type":"partial","text":"…","languageCode":"en-US"}`
      - `{"type":"final","text":"…","languageCode":"es-ES"}`

**Google Cloud STT (Chirp 3)**
- Receives streaming audio from server
- Performs multi-language automatic detection
- Returns interim and final results with the chosen `languageCode`

## New Files

### Core / State

| File | Purpose |
|------|---------|
| `src/core/SpeechRecognitionStore.ts` | State management (Effect.ts + useSyncExternalStore) |
| `src/hooks/useVoiceSearch.ts` | React hook wrapping the store |
| `src/lib/google-speech-client.ts` | Effect.ts wrapper for Google STT |
| `src/lib/speech-errors.ts` | Tagged error classes |

### API / Backend

| File | Purpose |
|------|---------|
| `app/api/voice-search/stream/route.ts` | WebSocket route for streaming audio to Google STT |

### UI Components

| File | Purpose |
|------|---------|
| `src/components/audio/VoiceSearchButton.tsx` | Mic button with level visualization |
| `src/components/audio/LiveTranscriptPreview.tsx` | Shows partial/final transcript + language chip |

## State Management

### SpeechState Shape

```ts
export interface SpeechState {
  readonly isSupported: boolean
  readonly isConnecting: boolean
  readonly isRecording: boolean
  readonly hasAudioPermission: boolean
  readonly isAutoStopping: boolean
  readonly partialTranscript: string
  readonly finalTranscript: string | null
  readonly detectedLanguageCode: string | null
  readonly lastUpdatedAt: number | null
  readonly errorCode: string | null
  readonly errorMessage: string | null
}
```

### Tagged Events (Effect.ts)

```ts
import { Data } from "effect"

export class StartRecognition extends Data.TaggedClass("StartRecognition")<object> {}
export class StopRecognition extends Data.TaggedClass("StopRecognition")<object> {}
export class ReceivePartial extends Data.TaggedClass("ReceivePartial")<{
  text: string
  languageCode: string | null
}> {}
export class ReceiveFinal extends Data.TaggedClass("ReceiveFinal")<{
  text: string
  languageCode: string | null
}> {}
export class SetSpeechError extends Data.TaggedClass("SetSpeechError")<{
  code: string
  message: string
}> {}
```

### Tagged Errors

```ts
import { Data } from "effect"

export class SpeechAPIError extends Data.TaggedClass("SpeechAPIError")<{
  readonly code: string
  readonly message: string
}> {}

export class SpeechPermissionError extends Data.TaggedClass("SpeechPermissionError")<{
  readonly message: string
}> {}

export class SpeechNetworkError extends Data.TaggedClass("SpeechNetworkError")<{
  readonly message: string
}> {}

export class SpeechQuotaError extends Data.TaggedClass("SpeechQuotaError")<{
  readonly message: string
}> {}
```

### Reusing VoiceActivityStore

`SpeechRecognitionStore` should:
- Call `voiceActivityStore.startListening()` on first `start()` (if not already listening)
- Subscribe to `voiceActivityStore.subscribeToVoiceEvents`:
  - On `VoiceStop`: Start a silence timer (e.g. 1.5–2s)
  - If no voice resumes and `isRecording`, call `StopRecognition` (auto-stop)
- Use `voiceActivityStore.getSnapshot().level` to show level meter in UI

## API Route Design

### Route

`app/api/voice-search/stream/route.ts`

- **Runtime**: force Node.js (not edge) for gRPC:
  ```ts
  export const config = {
    runtime: "nodejs",
  }
  ```

### Message Protocol

**Client → Server**
- First message (JSON):
  ```json
  { "type": "config", "sampleRate": 16000, "languageHints": ["en-US", "es-ES"] }
  ```
- Then binary frames: Raw PCM Int16LE mono audio, ~100–200ms chunks
- Optional final JSON:
  ```json
  { "type": "stop" }
  ```

**Server → Client**
- `{"type":"ready"}`
- `{"type":"partial","text":"bohemian rhapsody","languageCode":"en-US"}`
- `{"type":"final","text":"bohemian rhapsody queen","languageCode":"en-US"}`
- `{"type":"error","code":"QUOTA_EXCEEDED","message":"..."}`
- `{"type":"end"}`

### Google STT Config

```ts
const request = {
  recognizer: `projects/${projectId}/locations/${location}/recognizers/_`,
  streamingConfig: {
    config: {
      model: "chirp",
      languageCodes: ["en-US", "es-ES", "fr-FR", "pt-BR", "he-IL", "ru-RU"],
      enableAutomaticPunctuation: true,
    },
  },
}
```

## UI/UX Flow

### Trigger Mechanism

**Default**: Tap-to-toggle + auto-stop on silence
- First tap:
  - Requests mic permission (if not already)
  - Starts both VAD (`VoiceActivityStore`) and STT streaming
- While active:
  - Mic button shows "Listening…" with VAD animation
  - Live transcript preview appears under search bar
- Auto-stop:
  - When `VoiceActivityStore` reports silence for 2s:
    - Stop streaming, send `stop` to server
    - Treat last transcript as final for search
- Second tap:
  - Manually stops listening and triggers search

### Mic Button Placement (Mobile-First)

- Keep search bar at top as-is
- Add **persistent mic button at bottom** (thumb-friendly):
  ```tsx
  <div className="fixed inset-x-0 bottom-4 flex justify-center pointer-events-none">
    <div className="pointer-events-auto">
      <VoiceSearchButton />
    </div>
  </div>
  ```
- Also show small inline mic icon in input on larger screens

### Visual Feedback

**VoiceSearchButton states:**
- Idle: outline mic icon
- Connecting: spinner overlay
- Listening: filled mic with pulsing ring
- Error: red border, small warning icon

**Level meter:**
- Simple `div` whose scale is tied to `voiceState.level` (0–1)

**LiveTranscriptPreview:**
```tsx
<div className="mt-2 text-sm text-neutral-300 flex items-center justify-between">
  <span className="truncate">{partialOrFinalText}</span>
  {detectedLanguageCode && (
    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
      {detectedLanguageCode}
    </span>
  )}
</div>
```

### Integration with SongSearch

```ts
const {
  isRecording, partialTranscript, finalTranscript, detectedLanguageCode, error, start, stop
} = useVoiceSearch()

useEffect(() => {
  if (!finalTranscript) return
  setQuery(finalTranscript)
  setIsPending(true)
  setHasSearched(false)
  setError(null)
  searchTracks(finalTranscript)
}, [finalTranscript, searchTracks])
```

## Error Handling

### Error Messages (imperative, no period)

| Error | Message |
|-------|---------|
| Permission | Allow microphone to use voice search |
| Network | Check connection and try again |
| Quota | Voice search temporarily unavailable |
| No speech | Start singing to search |

### Resilience

- If WebSocket fails mid-stream:
  - Client store sets `isRecording = false`, `errorCode = "NETWORK"`
  - `VoiceActivityStore` listening can continue for other features

## Implementation Phases

### Phase 1: Backend streaming to Google STT (0.5–1 day)

1. Add `@google-cloud/speech` and set up credentials via Vercel env
2. Implement `src/lib/google-speech-client.ts`
3. Implement `/api/voice-search/stream/route.ts`
4. Test locally with dummy audio

**Exit criteria**: Server can receive audio and return streaming transcripts with language codes

### Phase 2: SpeechRecognitionStore + client streaming (0.5–1 day)

1. Implement `SpeechRecognitionStore` with state + subscribe + getSnapshot
2. Implement audio capture using existing `soundSystem` mic access
3. Encode audio as 16-bit PCM, send chunks over WebSocket
4. Implement `useSpeechState` and `useVoiceSearch`
5. Add debug UI to test

**Exit criteria**: From the app in dev, tap button, talk, see streaming text, and stop

### Phase 3: Integrate with VoiceActivityStore for auto-stop (0.5–1 day)

1. Ensure `voiceActivityStore.startListening()` is called on first `start()`
2. Subscribe to `voiceActivityStore.subscribeToVoiceEvents` for silence detection
3. Use `voiceActivityStore.getSnapshot().level` in UI
4. Handle permission denied

**Exit criteria**: User can tap mic, talk, see responsive level UI, recognition ends after silence

### Phase 4: UI integration with SongSearch (0.5–1 day)

1. Create `VoiceSearchButton` and `LiveTranscriptPreview` components
2. Integrate into `SongSearch`
3. Add bottom-fixed mic button for mobile
4. Verify manual text search still works

**Exit criteria**: Musician can tap mic, say "Bohemian Rhapsody Queen", see search results

### Phase 5: Polish, error handling, accessibility (0.5–1 day)

1. Animations via `springs`
2. Highlight input when voice query applied
3. Toast/inline messages for errors
4. WebSocket reconnect handling
5. Max duration per session (15–30s)
6. ARIA roles for mic button and transcript region
7. Keyboard triggers (space/enter) on desktop
8. Unit tests for `SpeechRecognitionStore`
9. Manual mobile testing

## Environment Variables

```env
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
# Or use individual credentials:
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PRIVATE_KEY=...
GOOGLE_CLOUD_CLIENT_EMAIL=...
```

## Provider Alternatives Considered

| Provider | Auto-Detection | Languages | Notes |
|----------|---------------|-----------|-------|
| **Google STT V2 (Chirp 3)** ✓ | Built-in | 85+ | Selected |
| Deepgram | `language=multi` | 30+ | Good DX, code-switching |
| AssemblyAI | Universal model | 99+ | Strong multilingual |
| Azure Speech | Candidate list | 100+ | Enterprise, needs curated list |

## Future Enhancements

- **Hands-free search mode**: Auto-restart recognition when voice detected on home screen
- **Speech adaptation hints**: Music-specific vocabulary for artist/song names
- **Localized UI**: Use detected language to bias app copy
- **Voice commands**: "Next song", "Pause scrolling" in addition to search
