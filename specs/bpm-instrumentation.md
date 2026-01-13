# BPM Instrumentation Spec

## Overview

Instrument the BPM fetch pipeline to log attempts at each stage: Turso lookup and provider cascade.

## Architectural Requirements

**This module MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

- Use `Effect.tap` and `Effect.tapError` for logging (NOT try/catch)
- Providers return `Effect.Effect<BPMResult, BPMError>`, not `Promise`
- Logging wrapper must preserve Effect semantics
- Do NOT use `async/await` with `try/catch` in provider wrapper

## Files to Modify

1. `src/services/song-loader.ts` - Turso embedded tempo logging
2. `src/services/bpm-providers.ts` - Provider cascade logging

## Part 1: Update `fireAndForgetBpmFetch` Signature

Location: `src/services/song-loader.ts`

### Current Signature

```typescript
function fireAndForgetBpmFetch(
  songId: string,
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

### Updated Signature

```typescript
function fireAndForgetBpmFetch(
  songId: string,
  lrclibId: number,
  title: string,
  artist: string,
  spotifyId: string | undefined,
)
```

### Call Site Update

Update the call in `loadSongData` to pass `lrclibId`:

```typescript
fireAndForgetBpmFetch(
  cachedSong.songId,
  actualLrclibId,
  lyrics.title,
  lyrics.artist,
  resolvedSpotifyId
)
```

## Part 2: Instrument Turso Lookup

Location: `src/services/song-loader.ts` (around line 516-537)

Wrap the embedded tempo check with timing and logging:

```typescript
const tursoStart = Date.now()
const embeddedTempo = lrclibSong?.tempo

if (embeddedTempo) {
  logBpmAttempt({
    lrclibId: actualLrclibId,
    songId: cachedSong.songId,
    title: lyrics.title,
    artist: lyrics.artist,
    stage: "turso_embedded",
    provider: "Turso",
    success: true,
    bpm: Math.round(embeddedTempo),
    latencyMs: Date.now() - tursoStart,
  })
  // ... existing cache update logic
} else {
  logBpmAttempt({
    lrclibId: actualLrclibId,
    songId: cachedSong.songId,
    title: lyrics.title,
    artist: lyrics.artist,
    stage: "turso_embedded",
    provider: "Turso",
    success: false,
    errorReason: "not_found",
    latencyMs: Date.now() - tursoStart,
  })
  // ... existing fallback logic
}
```

## Part 3: Wrap Providers with Logging

Location: `src/services/bpm-providers.ts`

### Create Logging Wrapper

Uses Effect.tap/tapError pattern (NOT try/catch):

```typescript
import {
  logBpmAttempt,
  mapErrorToReason,
  type BpmProvider as BpmProviderType,
  type BpmStage,
} from "@/lib/bpm/bpm-log"
import type { BPMProvider } from "@/lib/bpm/bpm-provider"
import type { BPMTrackQuery } from "@/lib/bpm/bpm-types"
import { Effect } from "effect"

export interface LoggingContext {
  lrclibId: number
  songId: string | undefined
  title: string
  artist: string
}

function wrapProviderWithLogging(
  provider: BPMProvider,
  stage: BpmStage,
  context: LoggingContext,
): BPMProvider {
  return {
    name: provider.name,
    getBpm: (query: BPMTrackQuery) => {
      const start = Date.now()
      return provider.getBpm(query).pipe(
        Effect.tap(result => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: true,
            bpm: result.bpm,
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
        Effect.tapError(error => {
          logBpmAttempt({
            ...context,
            stage,
            provider: provider.name as BpmProviderType,
            success: false,
            errorReason: mapErrorToReason(error),
            errorDetail: String(error).slice(0, 500),
            latencyMs: Date.now() - start,
          })
          return Effect.void
        }),
      )
    },
  }
}
```

### Update Provider Cascade

Add `withLogging` method to `BpmProvidersService`:

```typescript
export interface BpmProvidersService {
  readonly fallbackProviders: readonly BPMProvider[]
  readonly raceProviders: readonly BPMProvider[]
  readonly lastResortProvider: BPMProvider
  /** Wrap providers with logging for a specific request context */
  readonly withLogging: (context: LoggingContext) => {
    fallbackProviders: readonly BPMProvider[]
    raceProviders: readonly BPMProvider[]
    lastResortProvider: BPMProvider
  }
}

// Implementation in makeBpmProviders
const withLogging = (context: LoggingContext) => ({
  fallbackProviders: fallbackProviders.map(p =>
    wrapProviderWithLogging(p, "cascade_fallback", context),
  ),
  raceProviders: raceProviders.map(p =>
    wrapProviderWithLogging(p, "cascade_race", context),
  ),
  lastResortProvider: wrapProviderWithLogging(lastResortProvider, "last_resort", context),
})
```

### Usage in song-loader.ts

```typescript
function fireAndForgetBpmFetch(
  songId: string,
  lrclibId: number,
  title: string,
  artist: string,
  spotifyId: string | undefined,
) {
  const loggingContext = { lrclibId, songId, title, artist }

  const bpmEffect = BpmProviders.pipe(
    Effect.flatMap(service => {
      const { fallbackProviders, raceProviders, lastResortProvider } = service.withLogging(loggingContext)
      // ... rest of cascade logic
    }),
  )

  Effect.runPromise(bpmEffect.pipe(Effect.provide(ServerLayer))).catch(err =>
    console.error("[BPM] Background fetch failed:", err),
  )
}
```

## Acceptance Criteria

- [ ] `fireAndForgetBpmFetch` signature updated to include `lrclibId`
- [ ] All call sites updated with `lrclibId` parameter
- [ ] Turso embedded tempo lookup logs success/failure with latency
- [ ] Provider wrapper uses `Effect.tap`/`Effect.tapError` (NOT try/catch)
- [ ] `withLogging` method added to `BpmProvidersService`
- [ ] Provider cascade wraps each provider with logging
- [ ] Each stage is correctly tagged: `turso_embedded`, `cascade_fallback`, `cascade_race`, `last_resort`
- [ ] Logging does not block request response (fire-and-forget via `Effect.runFork`)
- [ ] Error details are captured and truncated
- [ ] `bun run typecheck` passes
