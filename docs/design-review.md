# ScrollTunes Design Review

> Analysis of design.md features, identifying gaps, corner cases, and open questions.
>
> **Last updated**: Phase 7 implementation mostly complete

## Implementation Status

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| Core teleprompter | 2 | ✅ Complete | LyricsDisplay with smooth scrolling |
| Voice detection | 3 | ✅ Complete | VAD with hysteresis, auto-play trigger |
| Song search | 4 | ✅ Complete | Spotify integration, direct navigation |
| Lyrics fetch | 4 | ✅ Complete | Effect-based API with ID endpoint |
| Permalink support | 7 | ✅ Complete | SEO-friendly URLs with ID suffix |
| Tempo adjustment | 5 | ⚠️ Partial | UI exists via TempoControl |
| Recent Songs/Caching | 8 | ✅ Complete | localStorage with 7-day TTL, resume support |
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
| Wake lock | ✅ Implemented via useWakeLock hook |
| Auto-hide controls | ✅ Implemented via useAutoHide hook |

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
- ✅ BPM attribution shown when fetched
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

### 3. Song Search (Phase 4) ✅ COMPLETE

**Implemented**:
- Spotify client credentials OAuth
- Token caching with auto-refresh
- Debounced search (300ms)
- Search results with album art
- Direct navigation to song pages (no confirmation modal)

**Notes**:
- Search returns normalized `SearchResultTrack[]`
- Navigation goes directly to `/song/[artistSlug]/[trackSlugWithId]` routes

### 4. Lyrics Fetch (Phase 4) ✅ COMPLETE

**Implemented**:
- LRCLIB integration for synced lyrics
- LRC parsing into `Lyrics` type
- Fallback from direct lookup to search
- 404 handling for missing lyrics
- Attribution in API response
- ID-based endpoint: `/api/lyrics/[id]`

**Notes**:
- Effect-based API with proper Effect.runPromise usage
- BPM fetched and displayed with attribution

### 5. Permalink Support (Phase 7) ✅ COMPLETE

**Implemented**:
- Canonical URLs: `/song/[artistSlug]/[trackSlugWithId]`
- Short URLs: `/s/[id]` with 308 permanent redirect
- Slug utilities in `src/lib/slug.ts`
- ID-based lyrics API: `/api/lyrics/[id]`
- SEO-friendly URL structure with track ID suffix

**URL examples**:
- `/song/artist-name/track-title-abc123` (canonical)
- `/s/abc123` (short URL, redirects to canonical)

---

## Gaps vs Design Document

### From design.md Section 1: Tempo Adjustment

| Feature | Status |
|---------|--------|
| Manual slider control | ⚠️ Partial (TempoControl UI exists) |
| Presets (Slower, Original, Faster) | ⚠️ Partial (preset buttons exist) |
| Per-song tempo preferences | ⚠️ Partial (stored in localStorage) |
| Auto-detection from live audio | ❌ Not implemented |

**Current**: `LyricsPlayer` has `scrollSpeed` (default 1.0, range 0.5-2.0) with TempoControl UI component.

### From design.md Section 7: Metronome Mode

| Feature | Status |
|---------|--------|
| Audio click | ⚠️ `SoundSystem.playMetronomeTick()` exists |
| Visual pulse | ⚠️ Partial (FloatingMetronome with BPM display) |
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
| Wake lock | ✅ Implemented |
| Double-tap to pause | ❌ Not implemented |
| Voice commands | ❌ Not implemented |

---

## Priority Decisions for Next Phases

### Phase 8: Recent Songs ✅ COMPLETE

1. ✅ RecentSongsStore with localStorage persistence (max 5 songs)
2. ✅ Lyrics caching with 7-day TTL (`scrolltunes:lyrics:{id}`)
3. ✅ Resume support (saves position on pause/leave, validates age <2h)
4. ✅ RecentSongs component on home page

### Phase 8.5: Polish & Cleanup

1. Remove dead code (SongConfirmation component)
2. Unify SearchResultTrack type between API and client
3. Add distraction-free mode toggle
4. Improve permission denied UX with actionable guidance

### Phase 9: Karaoke Mode

1. Implement word-level highlighting
2. Add pitch detection for scoring
3. Design karaoke-specific UI overlay

### Phase 10: Jam Session

1. Design multi-device sync architecture
2. Evaluate WebSocket vs WebRTC
3. Implement shared tempo/position state

---

## Critical Fixes Required

1. **Remove dead code: SongConfirmation component** - No longer used after navigation model change
2. **Unify SearchResultTrack type between API and client** - Ensure consistent typing across boundaries

---

## Open Questions (Updated)

### Answered

- **Lyrics provider?** → LRCLIB (free, provides synced LRC)
- **Voice detection approach?** → Energy-based VAD with hysteresis
- **State management?** → useSyncExternalStore with Effect.ts patterns
- **URL structure?** → SEO-friendly slugs with ID suffix
- **BPM source?** → Fetched from LRCLIB API

### Still Open

- **Offline mode scope?** → Pre-cache setlists vs always-online
- **Multi-device sync for Jam Session?** → WebSocket vs WebRTC
- **User accounts?** → OAuth only vs email/password
- **Chord data source?** → Ultimate Guitar API vs community submissions
