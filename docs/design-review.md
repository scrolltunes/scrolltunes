# ScrollTunes Design Review

> Analysis of design.md features, identifying gaps, corner cases, and open questions.
>
> **Last updated**: Phase 4 implementation complete

## Implementation Status

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| Core teleprompter | 2 | ✅ Complete | LyricsDisplay with smooth scrolling |
| Voice detection | 3 | ✅ Complete | VAD with hysteresis, auto-play trigger |
| Song search | 4 | ✅ Complete | Spotify integration |
| Lyrics fetch | 4 | ⚠️ Bug | API route has Effect usage issue |
| Tempo adjustment | 5 | ❌ Not started | Scroll speed exists but no UI |
| Karaoke mode | 9 | ❌ Not started | |
| Jam session | 10 | ❌ Not started | |

---

## Cross-Cutting Concerns

### Permissions & Startup Flow

| Scenario | Status |
|----------|--------|
| Mic access requires user gesture | ✅ Lazy init on first use |
| Clear UX for denied state | ⚠️ VoiceIndicator shows icon, needs text |
| Graceful degradation (manual scroll) | ⚠️ Works but no guidance shown |
| Wake lock permission | ❌ Not implemented |

**Current implementation**:
- `VoiceActivityStore.startListening()` catches permission errors
- Sets `permissionDenied: true` in state
- `VoiceIndicator` shows `MicrophoneSlash` icon when denied
- `PermissionPrompt` component exists but not integrated in main flow

**Gap**: When permission denied, user sees the slashed mic but no actionable guidance. Should show "Microphone access blocked – use manual controls" text.

### Latency & Timing

- ✅ LyricsPlayer uses `performance.now()` for timing
- ✅ Clock injection supported for testing
- ⚠️ No handling of tab backgrounding (RAF pauses)
- ❌ No master clock concept for multi-mode scenarios

### Offline / Network

- ❌ No offline strategy
- ❌ No pre-caching of setlists
- ✅ Error handling for API failures (shows error states)

### Privacy & Legal

- ✅ No permanent lyrics storage (fetched on-demand)
- ✅ Lyrics attribution displayed ("Lyrics provided by lrclib.net")
- ⚠️ Error logs may contain track names (not lyrics content)

---

## Feature-Specific Analysis

### 1. Core Teleprompter (Phase 2) ✅ COMPLETE

**Implemented**:
- LyricsDisplay with Motion transforms
- Current line highlighting
- Manual scroll override detection (3s timeout)
- Click-to-seek on any line
- Responsive text sizing

**Corner cases handled**:
- Empty lines render as spacing
- Manual scroll temporarily disables auto-scroll

**Known limitations**:
- Fixed `LINE_HEIGHT = 64px` may not match all font sizes
- No wrap detection for very long lines

### 2. Voice Detection (Phase 3) ✅ COMPLETE

**Implemented**:
- Energy-based VAD with hysteresis
- Configurable thresholds (`thresholdOn: 0.15`, `thresholdOff: 0.08`)
- Hold time to prevent flickering (`holdTimeMs: 150`)
- Level smoothing for visual feedback
- Auto-play on voice detection (`useVoiceTrigger`)
- Optional pause on silence

**Corner cases handled**:
- Hysteresis prevents rapid on/off switching
- Smoothing prevents jittery level display

**Known limitations**:
- No frequency analysis (guitar may trigger VAD)
- No calibration UI for different environments

### 3. Song Search (Phase 4) ✅ COMPLETE (with bugs)

**Implemented**:
- Spotify client credentials OAuth
- Token caching with auto-refresh
- Debounced search (300ms)
- Search results with album art
- Track selection flow

**⚠️ CRITICAL BUG**: `/api/search` returns raw `SpotifySearchResult` but client expects normalized `SearchResultTrack[]`. This will cause runtime errors.

### 4. Lyrics Fetch (Phase 4) ⚠️ NEEDS FIX

**Implemented**:
- LRCLIB integration for synced lyrics
- LRC parsing into `Lyrics` type
- Fallback from direct lookup to search
- 404 handling for missing lyrics
- Attribution in API response

**⚠️ CRITICAL BUG**: `/api/lyrics` awaits `getLyrics()` which returns an Effect, not a Promise. Should use `fetchLyricsWithFallback()`.

### 5. Song Confirmation (Phase 4) ✅ COMPLETE

**Implemented**:
- Track details display (art, name, artist, album)
- Lyrics loading state
- Success state with "Start" button
- Error state with "Play without synced lyrics" option
- Back navigation

---

## Gaps vs Design Document

### From design.md Section 1: Tempo Adjustment

| Feature | Status |
|---------|--------|
| Manual slider control | ❌ Not implemented |
| Presets (Slower, Original, Faster) | ❌ Not implemented |
| Per-song tempo preferences | ❌ Not implemented |
| Auto-detection from live audio | ❌ Not implemented |

**Current**: `LyricsPlayer` has `scrollSpeed` (default 1.0, range 0.5-2.0) but no UI to adjust it.

### From design.md Section 7: Metronome Mode

| Feature | Status |
|---------|--------|
| Audio click | ⚠️ `SoundSystem.playMetronomeTick()` exists |
| Visual pulse | ❌ Not implemented |
| Tap tempo | ❌ Not implemented |
| Count-in | ❌ Not implemented |

### From design.md Section 8: Guitar Tabs & Chords

| Feature | Status |
|---------|--------|
| Inline chord display | ❌ Not implemented |
| Chord diagrams | ❌ Not implemented |
| Transpose controls | ❌ Not implemented |

### From design.md Section 9: Responsive UI & Hands-Free

| Feature | Status |
|---------|--------|
| Mobile-first responsive | ✅ Implemented |
| Distraction-free mode | ❌ Not implemented |
| Wake lock | ❌ Not implemented |
| Double-tap to pause | ❌ Not implemented |
| Voice commands | ❌ Not implemented |

---

## Priority Decisions for Next Phases

### Phase 5: Tempo & Controls

1. Add tempo slider UI component
2. Add preset buttons (0.75x, 1.0x, 1.25x, 1.5x)
3. Wire to `LyricsPlayer.setScrollSpeed()`
4. Consider per-song preference storage (localStorage first)

### Phase 6: Mobile & Hands-Free

1. Implement `useWakeLock` hook
2. Add distraction-free mode toggle
3. Implement double-tap gesture detection
4. Test on iOS Safari and Android Chrome

---

## Critical Fixes Required Before Next Phase

1. **Fix `/api/lyrics` Effect usage** - Change to `fetchLyricsWithFallback()`
2. **Fix `/api/search` response shape** - Normalize to `SearchResultTrack[]`
3. **Throttle LyricsPlayer updates** - Only notify on line changes

---

## Open Questions (Updated)

### Answered

- **Lyrics provider?** → LRCLIB (free, provides synced LRC)
- **Voice detection approach?** → Energy-based VAD with hysteresis
- **State management?** → useSyncExternalStore with Effect.ts patterns

### Still Open

- **Offline mode scope?** → Pre-cache setlists vs always-online
- **Multi-device sync for Jam Session?** → WebSocket vs WebRTC
- **User accounts?** → OAuth only vs email/password
- **Chord data source?** → Ultimate Guitar API vs community submissions
