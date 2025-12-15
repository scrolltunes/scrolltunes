# ScrollTunes Architecture Review

> Analysis of architecture.md against the visual-effect reference, with recommended improvements.

## Structure Improvements

### Add `src/core/` Layer

The architecture implies core state classes (LyricsPlayer, VoiceDetector) but doesn't give them a clear home. Following visual-effect's pattern of top-level core files:

```
src/
  core/
    LyricsPlayer.ts          # Scrolling + timing state machine
    VoiceActivityStore.ts    # VAD state (speaking, level, events)
    TempoTracker.ts          # Beat detection state
    SessionManager.ts        # Jam session queue, guests
    __tests__/
      LyricsPlayer.test.ts
      VoiceActivityStore.test.ts
```

Keep `lib/` for **pure functions only**:

```
src/
  lib/
    lyrics-parser.ts         # Pure LRC parsing
    voice-detection.ts       # Pure signal processing math
    tempo-tracker.ts         # Pure beat detection algorithms
    songs-manifest.ts        # Registry
    __tests__/
      lyrics-parser.test.ts
      voice-detection.test.ts
```

### Fix API Route Paths

Current doc shows mismatched patterns. Use Next.js 15 conventions:

```
app/api/
  lyrics/[songId]/route.ts       # GET /api/lyrics/:songId
  spotify/
    search/route.ts              # GET /api/spotify/search
    track/[id]/route.ts          # GET /api/spotify/track/:id
  session/
    create/route.ts              # POST /api/session/create
    [id]/
      route.ts                   # GET /api/session/:id
      join/route.ts              # POST /api/session/:id/join
      queue/route.ts             # GET/POST /api/session/:id/queue
```

### Single Audio Owner

Risk: Multiple AudioContexts from Tone.js, VAD, and metronome cause mobile issues.

**Solution**: `SoundSystem` owns the single `AudioContext`:

```
src/
  sounds/
    SoundSystem.ts           # Single AudioContext owner
    audio-input.ts           # Mic access, reuses SoundSystem context
    metronome.ts             # Uses SoundSystem
    notifications.ts         # Uses SoundSystem
```

VAD should receive an `AnalyserNode` from SoundSystem, not create its own context.

---

## State Management Refinements

### `useSyncExternalStore` — Right Tool, Right Granularity

✅ Correct for: `LyricsPlayer`, `VoiceActivityStore`, `SessionManager`

❌ Wrong for: Per-frame audio samples, raw amplitude values

**Pattern to follow:**

```typescript
// src/core/VoiceActivityStore.ts
type VoiceState = {
  speaking: boolean
  level: number        // Smoothed 0-1, not raw samples
  lastStartAt: number | null
}

class VoiceActivityStore {
  private listeners = new Set<() => void>()
  private state: VoiceState = { speaking: false, level: 0, lastStartAt: null }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  setState(partial: Partial<VoiceState>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach(l => l())
  }
}

export const voiceActivityStore = new VoiceActivityStore()

export function useVoiceActivity() {
  return useSyncExternalStore(
    voiceActivityStore.subscribe,
    voiceActivityStore.getSnapshot,
  )
}
```

**Key constraint**: Only update stores on **semantic transitions**:
- `silence → speaking`
- `speaking → silence`
- Coarse level buckets (every 50ms, only if `|Δlevel| > 0.05`)

Never push 60fps audio data into React state.

### Singleton Lifecycle

Singletons are fine but need lifecycle methods for tests and hot-reload:

```typescript
class LyricsPlayer {
  constructor(private now: () => number = () => performance.now()) {}
  
  reset() { /* clear state, stop timers */ }
  dispose() { /* cleanup for tests */ }
}

export const lyricsPlayer = new LyricsPlayer()
```

Inject clock for deterministic tests.

---

## Audio / Real-Time Considerations

### Single AudioContext + Lazy Init

```typescript
// src/sounds/SoundSystem.ts
class SoundSystem {
  private context: AudioContext | null = null
  private initialized = false

  async initialize(): Promise<AudioContext> {
    if (this.initialized && this.context) return this.context
    
    await Tone.start()
    this.context = Tone.getContext().rawContext
    this.initialized = true
    return this.context
  }

  getAnalyserForVAD(): AnalyserNode {
    // Returns analyser connected to mic input
    // VAD uses this, doesn't create own context
  }
}
```

### VAD Architecture

Keep `lib/voice-detection.ts` **pure** (math only):

```typescript
// Pure functions - no Web Audio
export function computeRMS(samples: Float32Array): number
export function detectVoiceActivity(
  energy: number,
  state: VoiceState,
  config: VADConfig
): VoiceState
```

Put Web Audio wiring in `core/VoiceActivityStore.ts`:

```typescript
// Side effects - mic access, audio nodes
class VoiceActivityStore {
  private analyser: AnalyserNode | null = null
  
  async startListening() {
    const context = await soundSystem.initialize()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Wire up analyser, start detection loop
  }
}
```

### Smoothing & Hysteresis

In `lib/voice-detection.ts`:

```typescript
export const DEFAULT_VAD_CONFIG = {
  thresholdOn: 0.15,       // Energy to trigger "speaking"
  thresholdOff: 0.08,      // Energy to trigger "silent" (hysteresis)
  holdTimeMs: 150,         // Min time before state change
  smoothingWindow: 5,      // Moving average samples
}
```

### Permission & Recovery

Handle these failure paths:

| Scenario | Handling |
|----------|----------|
| Mic denied | Degrade to manual scroll, show prompt |
| Mic lost (Bluetooth disconnect) | Detect, show notification, don't crash |
| Tab backgrounded | Detect AudioContext suspend, reinit on resume |
| iOS Safari quirks | Test early, handle `interrupted` state |

---

## Performance Optimizations

### Transform-Based Scrolling

Don't use `scrollTop`. Use GPU-accelerated transforms:

```tsx
// ❌ Avoid
containerRef.current.scrollTop = targetY

// ✅ Prefer
<motion.div
  style={{ y: scrollYMotion }}
  transition={springs.scroll}
/>
```

Where `scrollYMotion` updates only on semantic events (line change), not per-frame.

### Cheap Lyrics DOM

- Don't wrap every word in a span
- Group by **line** or **phrase**
- Only split **current line** into spans for highlight
- Precompute chord positions ahead of time

```tsx
// Cheap: only current line has word spans
{lines.map((line, i) => 
  i === currentIndex 
    ? <HighlightedLine words={line.words} /> 
    : <PlainLine text={line.text} />
)}
```

### Throttle React Updates

`LyricsPlayer` should use its own timing loop and only publish coarse events:

```typescript
class LyricsPlayer {
  // Internal: runs at 60fps or via requestAnimationFrame
  private tick() {
    const now = this.now()
    const newIndex = this.computeLineIndex(now)
    
    // Only notify React on actual changes
    if (newIndex !== this.state.currentLineIndex) {
      this.setState({ currentLineIndex: newIndex })
    }
  }
}
```

Target 10-30Hz for React updates; Motion handles interpolation.

### Motion Layout Sparingly

- Use `layout` prop only on container/line elements that need reflow
- Avoid animating width/height; prefer translate/scale
- Test on mid-range Android devices

---

## Testing Strategy

### Unit Tests (Vitest)

| Module | Test Cases |
|--------|------------|
| `lib/lyrics-parser.ts` | Basic LRC, overlapping tags, missing tags, unsorted, empty lines |
| `lib/voice-detection.ts` | Energy samples → state machine transitions |
| `lib/tempo-tracker.ts` | Synthetic click tracks → BPM accuracy |
| `core/LyricsPlayer.ts` | Time source → correct line indices, snap behavior |

**Inject clock for determinism:**

```typescript
const mockClock = { now: 0 }
const player = new LyricsPlayer(() => mockClock.now)

mockClock.now = 5000
player.tick()
expect(player.state.currentLineIndex).toBe(2)
```

### Hook Tests (Vitest + jsdom)

```typescript
// Mock Web Audio
vi.mock('navigator.mediaDevices', () => ({
  getUserMedia: vi.fn().mockResolvedValue(mockStream)
}))

test('useVoiceDetection starts listening on mount', async () => {
  const { result } = renderHook(() => useVoiceDetection())
  await result.current.start()
  expect(result.current.isListening).toBe(true)
})
```

### E2E Tests (Playwright, later)

Defer but plan for:

- Load test song
- Simulate voice trigger via test flag
- Assert lyrics advance at mobile viewport
- Test wake lock behavior

---

## Missing Patterns from visual-effect

### Manifest-Driven Registries

Extend `songs-manifest.ts`:

```typescript
// src/lib/songs-manifest.ts
export const songsManifest = {
  "demo-wonderwall": {
    title: "Wonderwall",
    artist: "Oasis",
    source: "local",
    defaultTempo: 87,
    scrollMode: "voice-triggered",
  },
  // ...
}
```

### Helper Modules

Add `src/lib/song-helpers.ts`:

```typescript
export function normalizeLyrics(raw: APILyricsResponse): Lyrics
export function normalizeChords(raw: APIChordResponse): ChordChart
export function estimateWordTimings(line: LyricLine): WordTiming[]
```

### Repository Interfaces (for future DB)

Even with DB TBD, define interfaces now:

```typescript
// src/lib/repositories.ts
export interface UserProfileRepository {
  get(id: string): Promise<UserProfile | null>
  save(profile: UserProfile): Promise<void>
  delete(id: string): Promise<void>
}

export interface SessionRepository {
  create(session: Session): Promise<string>
  get(id: string): Promise<Session | null>
  update(id: string, data: Partial<Session>): Promise<void>
}

// In-memory implementation for now
export class InMemoryUserProfileRepository implements UserProfileRepository {
  private store = new Map<string, UserProfile>()
  // ...
}
```

---

## Technical Debt Risks

| Risk | Mitigation |
|------|------------|
| Multiple AudioContexts | Enforce SoundSystem as single owner |
| Singletons without lifecycle | Add `reset()`, `dispose()` methods |
| VAD mixing pure + side effects | Keep `lib/` pure, side effects in `core/` |
| DB "TBD" causing API rewrites | Define repository interfaces now |
| React render storms from audio | Only publish semantic state changes |

---

## When to Revisit Architecture

Consider more complex solutions if you see:

- VAD accuracy insufficient in noisy venues
- Scroll stutters on mid-range Android
- Need multi-user low-latency audio sync

At that point, consider:

- AudioWorklet + SharedArrayBuffer for VAD
- WebRTC for real-time session sync
- Event bus architecture for decoupled updates
