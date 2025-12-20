# ScrollTunes Architecture Audit

Date: 2025-02-14

## Scope

- Review of README and docs in `docs/`
- Core/state, lib utilities, sounds, hooks, UI components, and Next.js routes
- Alignment with Effect-first design, type safety, side effects, and library best practices

## Executive Summary

The project broadly follows the intended architecture: core state lives in `src/core` with `useSyncExternalStore`, audio ownership is centralized in `SoundSystem`, and Effect.ts is used for domain workflows in key areas (lyrics, VAD, Spotify, BPM). Environment configuration is now centralized via Effect Config with fail-fast validation, but the largest deviations from design goals remain (1) inconsistent Effect-first usage across stores and client workflows, (2) documentation drift vs current implementation (voice search, storage, database), and (3) data-layer inefficiencies that conflict with Neon HTTP driver best practices. The voice search pipeline also diverges from the streaming design and may incur double microphone usage.

## Strengths (Aligned With Design Goals)

- Single audio owner is enforced and lazy-initialized via `src/sounds/SoundSystem.ts`.
- `useSyncExternalStore` pattern is used consistently for core stores (`src/core/*`).
- `LyricsPlayer` avoids per-frame React updates by notifying only on line changes.
- Effect.ts is used for external API workflows (lyrics, Spotify, BPM, Songsterr, Google STT).
- Environment configuration is centralized via Effect Config with startup validation.
- External API access is always enabled; tests should mock or stub network calls as needed.
- Local caching for lyrics and recents is implemented with TTL and invalidation.
- VAD logic is split between pure math (`src/lib/voice-detection.ts`) and wiring in `src/core/VoiceActivityStore.ts`.

## Findings (Prioritized)

### P0 / High

- Neon HTTP driver best practice is violated in multiple routes by performing per-item inserts/updates in a loop instead of `db.batch()`. This increases latency and cost and is explicitly discouraged.
  - `src/app/api/user/history/sync/route.ts`
  - `src/app/api/user/favorites/sync/route.ts`
  - `src/app/api/user/export/route.ts` (N+1 queries per setlist)

- Voice search implementation does not match the documented design (streaming WebSocket + Chirp 3). Current flow records via `MediaRecorder` and sends a base64 blob to `/api/voice-search/transcribe`, which uses `recognize` and the `latest_short` model.
  - `docs/voice-search-design.md`
  - `src/core/SpeechRecognitionStore.ts`
  - `src/app/api/voice-search/transcribe/route.ts`

- Voice search likely uses two separate microphone streams (SoundSystem analyzer + MediaRecorder), which can increase CPU usage and cause device-specific mic conflicts on mobile.
  - `src/core/SpeechRecognitionStore.ts`
  - `src/sounds/SoundSystem.ts`

### P1 / Medium

- Effect-first design is not consistently applied outside the lyrics/VAD/audio domains. Several stores and libs use direct async/await and side effects, which weakens composability and error typing.
  - `src/core/RecentSongsStore.ts`
  - `src/core/FavoritesStore.ts`
  - `src/core/SetlistsStore.ts`
  - `src/core/PreferencesStore.ts`
  - `src/core/MetronomeStore.ts`
  - `src/lib/sync-service.ts`

- `lib/` is not purely side-effect free (localStorage usage lives in lib modules). This conflicts with the architecture convention of keeping lib pure.
  - `src/lib/lyrics-cache.ts`
  - `src/lib/bpm/bpm-localstorage.ts`

- Multiple API routes type `params` as a Promise and then `await` it. This is not the standard Next.js route handler signature and weakens type clarity even if runtime behavior is fine.
  - `src/app/api/lyrics/[id]/route.ts`
  - `src/app/api/chords/[songId]/route.ts`
  - `src/app/api/user/setlists/[id]/route.ts`
  - `src/app/api/user/setlists/[id]/songs/route.ts`
  - `src/app/api/user/setlists/[id]/songs/[songId]/route.ts`
  - `src/app/api/user/setlists/[id]/reorder/route.ts`
  - `src/app/api/user/transpose/[songId]/route.ts`
  - `src/app/api/user/favorites/[songId]/route.ts`

- Limited runtime validation for JSON bodies. Many routes cast `request.json()` to a type without schema validation, risking undefined behavior with malformed input.
  - `src/app/api/user/history/sync/route.ts`
  - `src/app/api/user/favorites/sync/route.ts`
  - `src/app/api/user/setlists/route.ts`
  - `src/app/api/user/transpose/[songId]/route.ts`

- Error management with Effect timeouts/retries/fallbacks is inconsistent. Several external calls can hang indefinitely, and some stores still use `try/catch` instead of typed Effect error channels.
  - `src/lib/lyrics-client.ts`
  - `src/lib/spotify-client.ts`
  - `src/lib/chords/songsterr-client.ts`
  - `src/lib/deezer-client.ts`
  - `src/lib/google-speech-client.ts`
  - `src/core/RecentSongsStore.ts`
  - `src/core/PreferencesStore.ts`

- `LyricsPlayer` returns index 0 for the Completed state, which likely causes the UI to highlight the first line after completion instead of the last line. This appears to be a logic error.
  - `src/core/LyricsPlayer.ts`

- Not all third-party API calls retain typed error channels end-to-end. Some calls run outside the Effect pipeline or fall back to untyped `Error` values.
  - `src/lib/speech-usage-tracker.ts` (uses `Error` instead of `Data.TaggedClass`)
  - `src/app/api/lyrics/[id]/route.ts` (album art fetch after Effect completion)

### P2 / Low

- Voice search does not explicitly check `MediaRecorder` availability, which could cause errors in unsupported browsers (notably some iOS versions).
  - `src/core/SpeechRecognitionStore.ts`

- Speech transcription route logs full responses and transcripts to server logs. This can expose sensitive user content if logs are retained.
  - `src/app/api/voice-search/transcribe/route.ts`

- Several documents are out of date or mismatched with current implementation (database provider, server-side storage policy, voice search pipeline).
  - `docs/architecture.md`
  - `docs/design.md`
  - `docs/voice-search-design.md`

- Fanout/race usage is concentrated in BPM resolution; other external lookups are sequential and could be parallelized for latency and resilience (e.g., album art sources).
  - `src/app/api/search/route.ts`
  - `src/app/api/lyrics/[id]/route.ts`

## Alignment With Design Goals

### Effect-first design

- Strong in API/client integration layers (lyrics, Spotify, BPM, Songsterr, STT), but inconsistent in user state stores. If Effect-first is a strict goal, consider moving store side effects (fetch/localStorage) into Effect programs and isolating them from state updates.

## Effect.ts Pattern Audit

### Required Effect usage (per architecture)

- Use Effect for all async work, fanout/parallelism, timeouts, and retries.
- Use Effect error channels with typed errors and recovery (`catchTag` / `catchAll`), not `try/catch`.
- Manage dependencies via `Context`/`Tag` and provide them at the composition root using `Layer`.
- Load all environment/config via Effect Config + ConfigProvider, and fail fast at startup when required config is missing.

References:
- https://effect.website/docs/requirements-management/services/
- https://effect.website/docs/configuration/#loading-configuration-from-environment-variables
- https://effect.website/docs/error-management/two-error-types/
- https://effect.website/docs/parallelism/
- https://effect.website/docs/recursion-and-retrying/retrying/
- https://effect.website/docs/timeouts/

### Observed and aligned with Effect.ts patterns

- `Data.TaggedClass` used for typed errors and event discrimination, enabling tag-based recovery and switch exhaustiveness.
  - `src/lib/lyrics-client.ts`
  - `src/lib/spotify-client.ts`
  - `src/core/VoiceActivityStore.ts`
  - `src/core/SpeechRecognitionStore.ts`
  - `src/sounds/SoundSystem.ts`
- Config is centralized via Effect Config (`PublicConfig`, `ServerConfig`) with a ConfigProvider and startup validation.
  - `src/services/public-config.ts`
  - `src/services/server-config.ts`
  - `src/services/config-provider.ts`
  - `src/services/validate-env.ts`
- `Effect.gen` + `Effect.tryPromise` used to sequence async work with typed failures.
  - `src/lib/lyrics-client.ts`
  - `src/lib/spotify-client.ts`
  - `src/app/api/lyrics/[id]/route.ts`
  - `src/app/api/search/route.ts`
  - `src/app/api/voice-search/transcribe/route.ts`
- `Effect.catchTag` and `Effect.all` used for recovery and concurrency.
  - `src/lib/spotify-client.ts`
  - `src/app/api/lyrics/[id]/route.ts`
  - `src/app/api/search/route.ts`

### Gaps vs Effect-first expectations

- Effects are frequently executed inside stores (`Effect.runSync` / `Effect.runPromise`) rather than returned to the React boundary. This makes Effects mostly a typed wrapper rather than the primary orchestration layer.
  - `src/core/LyricsPlayer.ts`
  - `src/core/VoiceActivityStore.ts`
  - `src/core/SpeechRecognitionStore.ts`
- Dependency injection via `Context`, `Tag`, and `Layer` is only partially adopted. Config/fetch/storage now use Layers, but several core services are still imported directly, limiting test substitution and runtime configuration.
  - `src/sounds/SoundSystem.ts` (direct singleton import usage in stores)
  - `src/lib/db/index.ts` (global DB construction)
- Managed resource patterns (`Effect.acquireRelease`, `Scope`) are not used for microphone streams, AudioContext, or VAD lifecycles. Cleanup is handled manually, which bypasses Effect's structured concurrency and cancellation model.
  - `src/sounds/SoundSystem.ts`
  - `src/core/VoiceActivityStore.ts`
  - `src/core/SpeechRecognitionStore.ts`
- Error handling and recovery often uses `try/catch` or ad-hoc Promise handling instead of Effect error channels and typed recovery. This conflicts with Effect’s error-management guidance.
  - `src/core/RecentSongsStore.ts`
  - `src/core/PreferencesStore.ts`
  - `src/core/SpeechRecognitionStore.ts`
  - `src/lib/sync-service.ts`
- Timeouts and retries are not consistently applied via Effect APIs on external calls; most fetches can hang indefinitely and do not use `Effect.timeout` or `Effect.retry`.
  - `src/lib/lyrics-client.ts`
  - `src/lib/spotify-client.ts`
  - `src/lib/chords/songsterr-client.ts`
  - `src/lib/deezer-client.ts`
  - `src/lib/google-speech-client.ts`
- Runtime validation uses ad-hoc parsing rather than `Schema` / typed decoding. This weakens Effect's typed error model for request bodies.
  - `src/app/api/user/history/sync/route.ts`
  - `src/app/api/user/favorites/sync/route.ts`
  - `src/app/api/user/setlists/route.ts`

### Implications

- Current usage gets some of the type-safety benefits (tagged errors) but misses core Effect patterns around composition, substitution, and resource safety. If Effect-first is a hard requirement, the orchestration boundary should move to Effect, with `Layer` and `Scope` managing dependency and lifecycle.

## Target Layering Map and Composition Root

### Current (implicit dependencies)

- Direct singletons and module-level constructors instead of service Tags:
  - `src/sounds/SoundSystem.ts` used directly by stores and hooks.
  - `src/lib/db/index.ts` constructs a global DB at import time.
  - External API clients are imported directly and use `fetch` inline.
- Composition root is partially established (`ServerLayer`, `ClientLayer`), but not consistently used across stores and async wrappers.

### Target (explicit service Tags + Layers)

Suggested services to encapsulate as `Effect.Tag` and provide via `Layer`:

- `SoundSystem` service (AudioContext, mic analyzer, sound playback)
- `VoiceActivity` and `SpeechRecognition` engines (VAD, STT)
- `LyricsClient`, `SpotifyClient`, `BpmProviders`, `ChordsClient` (external API access)
- `Db` (Neon/Drizzle), `Clock`, `Fetch`, `Logger`
- `LocalStorage` / `Storage` (for client cache and preferences)

This separates dependencies from usage and enables test substitution and safe lifecycle control.

### Composition root placement

Server (Next.js route handlers):

- Build a per-request layer inside each route module (or a shared helper) that wires env config, DB, and external clients.
- Provide it at the boundary where you run the Effect:
  - Define program as `Effect` and call `Effect.runPromise(program.pipe(Effect.provide(layer)))`.

Client (React app/stores):

- Create a client runtime layer once (e.g., in `src/app/layout.tsx` or a dedicated runtime module) and reuse it.
- Run Effects through a `Runtime` that already has the Layer installed, keeping stores pure and event handlers as Effect values.

This matches Effect’s requirements-management guidance: services are provided at the composition root rather than imported directly.

## Appendix: Proposed Service Tags and Layers

- `SoundSystemService` → wraps `src/sounds/SoundSystem.ts` (AudioContext lifecycle, mic analyzer, UI sounds)
- `VoiceActivityService` → wraps `src/core/VoiceActivityStore.ts` (VAD engine coordination)
- `SpeechRecognitionService` → wraps `src/core/SpeechRecognitionStore.ts` (voice search orchestration)
- `LyricsClientService` → wraps `src/lib/lyrics-client.ts` (LRCLIB access + parse)
- `SpotifyClientService` → wraps `src/lib/spotify-client.ts`
- `BpmService` → wraps `src/lib/bpm/*` (providers + fallback/race orchestration)
- `ChordsClientService` → wraps `src/lib/chords/songsterr-client.ts`
- `DeezerClientService` → wraps `src/lib/deezer-client.ts` (album art)
- `SpeechClientService` → wraps `src/lib/google-speech-client.ts`
- `UsageTrackerService` → wraps `src/lib/speech-usage-tracker.ts` and `src/lib/bpm/rapidapi-client.ts` quota paths
- `DbService` → wraps `src/lib/db/index.ts` (Drizzle/Neon HTTP)
- `StorageService` → wraps localStorage usage in `src/lib/lyrics-cache.ts`, `src/lib/bpm/bpm-localstorage.ts`, and store persistence
- `PublicConfig` / `ServerConfig` → centralizes env access (API keys, feature flags, limits)
- `ClockService` → provides `Date.now()`/`performance.now()` for deterministic tests
- `FetchService` → standardizes `fetch` (timeouts, retry, tracing)
- `LoggerService` → replaces direct `console.*` with Effect logging

Each service should expose a Tag + Layer, and higher-level programs should require only the Tags they need.

### Strong type safety guarantees

- TS config is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), which is good.
- Runtime validation is inconsistent; most routes use type assertions rather than schema validation, which undermines the compile-time guarantees at runtime.

### Minimizing side effects

- Audio and VAD side effects are mostly centralized.
- Several stores mix state updates and network writes directly (preferences, favorites, recents), which complicates testing and effect isolation.

## Layer Notes

### Core and Stores

- `LyricsPlayer` is cleanly structured, uses Effect-style events, and avoids per-frame React updates.
- `VoiceActivityStore` is sophisticated and supports Silero VAD + energy fallback, but does frequent store updates for level readings (20 FPS). This may be acceptable, but it is higher frequency than the general guidance.
- Several stores perform side effects inside state setters (network sync). This is convenient but makes it harder to test, mock, or run in Effect.

### Audio / VAD

- `SoundSystem` is the sole AudioContext owner (good) but does not deduplicate mic streams. Multiple consumers can open independent streams.
- Voice search uses a dedicated VAD instance with separate tuning (good separation from singing VAD).

### API and Data

- Effect usage is solid for most external calls.
- Neon HTTP driver batching guidance is only applied in setlist reorder but not in other bulk update routes.

### Client UI

- Song list rendering uses `SongListItem` consistently.
- `LyricsDisplay` is well optimized for GPU transforms and uses memoization for chord mapping.

### Testing

- Good coverage for pure libs and `LyricsPlayer`.
- Missing integration tests for VAD, speech recognition, and data sync flows.

## Documentation Drift

- `docs/design.md` asserts no server-side storage, but accounts and sync features now persist data in Postgres. Documentation should be updated to reflect current behavior.
- `docs/architecture.md` lists Vercel Postgres, while the code uses Neon via `@neondatabase/serverless`.
- `docs/voice-search-design.md` describes streaming WebSocket and Chirp 3, but implementation is non-streaming with `latest_short`.

## Recommendations (Short List)

1. Refactor bulk DB writes to use `db.batch()` where multiple inserts/updates are issued (history sync, favorites sync, export, etc.).
2. Decide whether to align implementation or docs for voice search; either implement streaming with Chirp 3, or update `docs/voice-search-design.md` and feature copy.
3. Add runtime validation for API request bodies (e.g., Zod) in user-facing routes.
4. Consider consolidating microphone capture for voice search to avoid multiple streams.
5. Fix `LyricsPlayer` Completed index behavior to avoid highlighting the first line.
6. Audit `lib/` for side effects if the "pure lib" rule remains a goal, and relocate side effects into core or effect layers.
