# ScrollTunes Architecture Review

> Analysis of architecture.md against the visual-effect reference, with recommended improvements.
> 
> **Last updated**: Phase 4 implementation complete

## Implementation Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Project setup | ✅ Complete | Next.js 15, TypeScript strict, Biome, Tailwind 4, Vitest |
| `src/core/` layer | ✅ Complete | LyricsPlayer, VoiceActivityStore with Effect.ts patterns |
| `src/lib/` pure functions | ✅ Complete | lyrics-parser, voice-detection, spotify-client, lyrics-client |
| Single AudioContext | ✅ Complete | SoundSystem owns context, VAD receives AnalyserNode |
| API routes | ✅ Complete | Response normalization, Effect usage consistency |
| State publishing | ✅ Fixed | LyricsPlayer only notifies on line changes |
| Permalink routes | ✅ Complete | /song/[artistSlug]/[trackSlugWithId], /s/[id] |
| Tests | ⚠️ Partial | lyrics-parser, voice-detection, LyricsPlayer tested |

---

## Structure Improvements

### Add `src/core/` Layer ✅ IMPLEMENTED

The architecture now has a clear `src/core/` layer:

```
src/
  core/
    LyricsPlayer.ts          # Scrolling + timing state machine
    VoiceActivityStore.ts    # VAD state (speaking, level, events)
    __tests__/
      LyricsPlayer.test.ts   # ✅ Implemented
```

`lib/` contains **pure functions only**:

```
src/
  lib/
    lyrics-parser.ts         # Pure LRC parsing ✅
    voice-detection.ts       # Pure signal processing math ✅
    spotify-client.ts        # Spotify API with Effect.ts ✅
    lyrics-client.ts         # LRCLIB API with Effect.ts ✅
    slug.ts                  # URL slug generation ✅
    __tests__/
      lyrics-parser.test.ts  # ✅ Implemented
      voice-detection.test.ts # ✅ Implemented
```

### API Route Paths

Current implementation:

```
app/api/
  search/route.ts              # GET /api/search?q=...&limit=...
  lyrics/route.ts              # GET /api/lyrics?track=...&artist=...
  lyrics/[id]/route.ts         # GET /api/lyrics/[id] - by LRCLIB ID

app/song/
  [artistSlug]/
    [trackSlugWithId]/
      page.tsx                 # Canonical lyrics page

app/s/
  [id]/
    page.tsx                   # Short URL redirect
```

**Deviation from docs**: Original spec called for `/api/spotify/search` and `/api/lyrics/[songId]`. Current approach is acceptable for MVP but differs from documented REST-style paths.

### Single Audio Owner ✅ IMPLEMENTED

`SoundSystem` owns the single `AudioContext`:

```
src/
  sounds/
    SoundSystem.ts           # Single AudioContext owner ✅
```

VAD receives an `AnalyserNode` from SoundSystem via `getMicrophoneAnalyserEffect`, not creating its own context.

---

## State Management Refinements

### `useSyncExternalStore` — Right Tool, Right Granularity ✅

Correctly used for: `LyricsPlayer`, `VoiceActivityStore`

### ✅ FIXED: Per-Frame State Updates

**Previous issue**: `LyricsPlayer.handleTick()` called `setState` on every animation frame, triggering React re-renders in all subscribers every frame.

**Current implementation**: Only notifies listeners when `currentLineIndex` changes:

```typescript
private handleTick(deltaTime: number): void {
  if (this.state._tag !== "Playing") return
  
  const oldLineIndex = this.getCurrentLineIndex()
  const newTime = this.state.currentTime + deltaTime * this.scrollSpeed
  
  // Update internal state without notifying
  this.state = { _tag: "Playing", lyrics: this.state.lyrics, currentTime: newTime }
  
  // Only notify on semantic changes
  if (this.getCurrentLineIndex() !== oldLineIndex) {
    this.notify()
  }
}
```

### Singleton Lifecycle ✅ IMPLEMENTED

Both `LyricsPlayer` and `VoiceActivityStore` have lifecycle methods:

```typescript
class LyricsPlayer {
  constructor(private now: () => number = () => performance.now() / 1000) {}
  reset() { /* implemented */ }
  dispose() { /* implemented */ }
  hardReset() { /* for tests and hot-reload */ }
}
```

Clock injection is supported for deterministic tests.

---

## Audio / Real-Time Considerations

### Single AudioContext + Lazy Init ✅ IMPLEMENTED

```typescript
// src/sounds/SoundSystem.ts
class SoundSystem {
  private initialized = false
  
  async initialize(): Promise<void> {
    if (this.initialized) return
    await Tone.start()
    // ... setup synths
    this.initialized = true
  }
  
  getAudioContext(): AudioContext | null {
    return Tone.getContext().rawContext as AudioContext
  }
}
```

### VAD Architecture ✅ IMPLEMENTED

`lib/voice-detection.ts` is **pure** (math only):

```typescript
export function computeRMSFromByteFrequency(data: Uint8Array): number
export function smoothLevel(current: number, target: number, factor: number): number
export function detectVoiceActivity(
  level: number,
  state: VADRuntimeState,
  config: VADConfig,
  now: number
): VADRuntimeState
```

Web Audio wiring is in `core/VoiceActivityStore.ts`:

```typescript
class VoiceActivityStore {
  private analyser: AnalyserNode | null = null
  
  async startListening() {
    const analyser = await soundSystem.getMicrophoneAnalyserEffect
    // Wire up detection loop
  }
}
```

### Smoothing & Hysteresis ✅ IMPLEMENTED

```typescript
// src/lib/voice-detection.ts
export const DEFAULT_VAD_CONFIG: VADConfig = {
  thresholdOn: 0.15,
  thresholdOff: 0.08,
  holdTimeMs: 150,
  smoothingFactor: 0.3,
}
```

### Permission & Recovery ⚠️ PARTIAL

| Scenario | Status |
|----------|--------|
| Mic denied | ✅ Sets `permissionDenied: true` in store |
| UI feedback for denied | ⚠️ VoiceIndicator shows state, but no guidance text |
| Mic lost (Bluetooth disconnect) | ❌ Not handled |
| Tab backgrounded | ❌ Not handled |
| iOS Safari quirks | ❌ Not tested |

---

## Performance Optimizations

### Transform-Based Scrolling ✅ IMPLEMENTED

```tsx
// LyricsDisplay.tsx
<motion.div
  animate={{ y: -scrollY }}
  transition={{ type: "tween", duration: 0.5, ease: "easeOut" }}
>
```

Uses GPU-accelerated transforms, not `scrollTop`.

### Cheap Lyrics DOM ✅ IMPLEMENTED

Only current line gets special treatment:

```tsx
{lyrics.lines.map((line, index) => (
  <LyricLine
    isActive={index === currentLineIndex}
    isPast={index < currentLineIndex}
  />
))}
```

### ✅ Throttled React Updates

Per-frame publishing is fixed. `LyricsPlayer` now only notifies on line index changes (see State Management section).

---

## Testing Strategy

### Unit Tests

| Module | Status |
|--------|--------|
| `lib/lyrics-parser.ts` | ✅ 14 tests |
| `lib/voice-detection.ts` | ✅ 12 tests |
| `core/LyricsPlayer.ts` | ✅ 10 tests |

Total: 36 tests passing

### Missing Tests

- `VoiceActivityStore` integration tests
- Hook tests (`useVoiceTrigger`)
- E2E tests (Playwright, deferred)

---

## API Integration Issues

### DTO Alignment Opportunities

| Issue | Location | Notes |
|-------|----------|-------|
| `SearchResultTrack` duplication | `/api/search/route.ts` and `SongSearch.tsx` | Should unify into shared type |
| `LyricsApiResponse` type exists | `lyrics-client.ts` | Routes don't use it explicitly |
| Params typing | `/api/lyrics/[id]/route.ts` | Uses `Promise<{id}>` incorrectly |

---

## Effect.ts Usage Consistency

**Decision**: Domain logic uses Effect, routes use async wrappers.

| Module | Pattern | Status |
|--------|---------|--------|
| `spotify-client.ts` | Effect + async wrappers | ✅ Correct |
| `lyrics-client.ts` | Effect + async wrappers | ✅ Correct |
| `/api/search` | Uses async wrapper | ✅ Correct |
| `/api/lyrics` | Uses async wrapper | ✅ Correct |
| `/api/lyrics/[id]` | Uses async wrapper | ✅ Correct |

---

## Missing Patterns from visual-effect

### Manifest-Driven Registries

Not yet implemented. Future addition:

```typescript
// src/lib/songs-manifest.ts
export const songsManifest = {
  "demo-wonderwall": {
    title: "Wonderwall",
    artist: "Oasis",
    defaultTempo: 87,
  },
}
```

### Helper Modules

Partially implemented:

- ✅ `formatArtists()`, `getAlbumImageUrl()` in spotify-client
- ❌ `normalizeLyrics()`, `normalizeChords()` not yet needed

### Repository Interfaces

Not yet implemented (Phase 8 - User Accounts):

```typescript
export interface UserProfileRepository {
  get(id: string): Promise<UserProfile | null>
  save(profile: UserProfile): Promise<void>
}
```

---

## Technical Debt Summary

| Issue | Priority | Effort |
|-------|----------|--------|
| No guidance text when mic permission denied | 🟡 Medium | S |
| SongConfirmation component is dead code | 🟡 Medium | S |
| SearchResultTrack type duplication | 🟢 Low | S |
| Unused async wrappers in lyrics-client.ts | 🟢 Low | S |
| Fixed LINE_HEIGHT may break with different fonts | 🟢 Low | M |

---

## When to Revisit Architecture

Consider more complex solutions if you see:

- VAD accuracy insufficient in noisy venues
- Scroll stutters on mid-range Android
- Need multi-user low-latency audio sync (Phase 10 - Jam Session)

At that point, consider:

- AudioWorklet + SharedArrayBuffer for VAD
- WebRTC for real-time session sync
- Event bus architecture for decoupled updates
