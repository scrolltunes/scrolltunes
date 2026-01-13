# BPM Instrumentation Spec

## Overview

Instrument the BPM fetch pipeline to log attempts at each stage: Turso lookup and provider cascade.

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

```typescript
import { logBpmAttempt, mapErrorToReason, type BpmStage, type BpmProvider } from "@/lib/bpm/bpm-log"

interface LoggingContext {
  lrclibId: number
  songId: string | undefined
  title: string
  artist: string
  stage: BpmStage
}

function wrapProviderWithLogging(
  provider: BPMProvider,
  context: LoggingContext,
): BPMProvider {
  return {
    name: provider.name,
    getBpm: async (query: BPMTrackQuery) => {
      const start = Date.now()
      try {
        const result = await provider.getBpm(query)
        logBpmAttempt({
          ...context,
          provider: provider.name as BpmProvider,
          success: true,
          bpm: result.bpm,
          latencyMs: Date.now() - start,
        })
        return result
      } catch (error) {
        logBpmAttempt({
          ...context,
          provider: provider.name as BpmProvider,
          success: false,
          errorReason: mapErrorToReason(error),
          errorDetail: String(error).slice(0, 500),
          latencyMs: Date.now() - start,
        })
        throw error
      }
    },
  }
}
```

### Update Provider Cascade

Pass logging context through the cascade:

```typescript
// In fetchBpmWithCascade or equivalent
const loggingContext = {
  lrclibId,
  songId,
  title,
  artist,
}

// Wrap fallback providers
const wrappedFallback = fallbackProviders.map(p =>
  wrapProviderWithLogging(p, { ...loggingContext, stage: "cascade_fallback" })
)

// Wrap race providers
const wrappedRace = raceProviders.map(p =>
  wrapProviderWithLogging(p, { ...loggingContext, stage: "cascade_race" })
)

// Wrap last resort
const wrappedLastResort = wrapProviderWithLogging(
  lastResortProvider,
  { ...loggingContext, stage: "last_resort" }
)
```

## Acceptance Criteria

- [ ] `fireAndForgetBpmFetch` signature updated to include `lrclibId`
- [ ] All call sites updated with `lrclibId` parameter
- [ ] Turso embedded tempo lookup logs success/failure with latency
- [ ] Provider cascade wraps each provider with logging
- [ ] Each stage is correctly tagged: `turso_embedded`, `cascade_fallback`, `cascade_race`, `last_resort`
- [ ] Logging does not block request response
- [ ] Error details are captured and truncated
