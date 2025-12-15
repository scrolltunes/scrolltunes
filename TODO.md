# ScrollTunes Implementation TODO

> Track progress by checking off items: `- [x]`

## Phase 0: Project Setup ✅

- [x] Initialize Next.js 15 project with App Router
- [x] Configure TypeScript (strict mode, path aliases)
- [x] Set up Biome for linting/formatting
- [x] Configure Tailwind CSS 4
- [x] Set up Vitest for testing
- [x] Create initial folder structure (`src/`, `app/`, etc.)
- [x] Add Motion (motion.dev) dependency
- [x] Add Tone.js dependency
- [x] Add Effect.ts dependency
- [x] Configure Vercel deployment
- [x] Create `.env.example` with required variables

## Phase 1: Core Infrastructure ✅

### Design Tokens
- [x] Create `src/theme.ts` with token exports
- [x] Create `src/animations.ts` with spring configs
- [x] Create `src/constants/index.ts` with app constants

### Audio System
- [x] Create `src/sounds/SoundSystem.ts` (singleton, owns AudioContext)
- [x] Implement lazy initialization pattern
- [x] Add mute/unmute functionality
- [x] Create basic UI feedback sounds
- [x] Add microphone analyser for VAD

### State Management (Effect.ts)
- [x] Create `src/core/` folder
- [x] Implement base store pattern with `useSyncExternalStore`
- [x] Create `src/core/LyricsPlayer.ts` with tagged events
- [x] Create `src/core/VoiceActivityStore.ts` with VAD logic
- [x] Export React hooks for state subscription

## Phase 2: Lyrics Display ✅

### Data Layer
- [x] Define `Lyrics` type (lines, timestamps, words)
- [x] Create `src/lib/lyrics-parser.ts` (parse LRC format)
- [x] Write tests for lyrics parser
- [x] Create mock lyrics data for development

### Components
- [x] Create `src/components/display/LyricsDisplay.tsx`
- [x] Create `src/components/display/LyricLine.tsx`
- [x] Implement smooth scrolling with Motion transforms
- [x] Add current line highlighting
- [x] Make responsive (mobile-first)

### Player Logic
- [x] Implement `LyricsPlayer` state machine (idle → playing → paused)
- [x] Add time-based line advancement
- [x] Implement click-to-seek on lyric lines
- [x] Add manual scroll override detection

## Phase 3: Voice Detection ✅

### VAD Implementation
- [x] Create `src/lib/voice-detection.ts` (pure math functions)
- [x] Implement RMS energy calculation
- [x] Add smoothing and hysteresis logic
- [x] Write tests for VAD logic

### Integration
- [x] Implement `VoiceActivityStore` with mic access
- [x] Create `src/hooks/useVoiceTrigger.ts`
- [x] Wire VAD to LyricsPlayer (voice start → play)
- [x] Add visual indicator for listening state
- [x] Handle permission denied gracefully

### Testing
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Verify VAD doesn't trigger on guitar/instruments
- [ ] Test with background noise

## Phase 4: Song Search & Lyrics API ✅

### LRCLIB Integration
- [x] Choose lyrics provider (lrclib.net - free, synced LRC)
- [x] Create `src/lib/lyrics-client.ts`
- [x] Implement lyrics fetch API route
- [x] Handle missing lyrics gracefully
- [x] Add lyrics attribution as required
- [x] Implement song search via LRCLIB API

### UI
- [x] Create song search component
- [x] Create song selection/confirmation screen
- [x] Show loading states
- [x] Handle API errors

## Phase 5: Tempo & Controls ✅

### Tempo Adjustment
- [x] Add tempo slider component (`TempoControl.tsx`)
- [x] Implement scroll speed adjustment
- [x] Add preset buttons (Slower, Original, Faster)
- [x] Persist tempo preference per song (localStorage)

### Playback Controls
- [x] Create play/pause button
- [x] Add restart button
- [x] Implement progress indicator (`ProgressIndicator.tsx`)
- [x] Add keyboard shortcuts (`useKeyboardShortcuts.ts`)

## Phase 6: Mobile & Hands-Free ✅

### Responsive UI
- [x] Implement distraction-free mode (auto-hide controls)
- [x] Add wake lock (`useWakeLock` hook)
- [x] Test all screens on mobile viewports (pending manual testing)
- [x] Ensure large touch targets

### Hands-Free (Basic)
- [x] Implement double-tap to pause/resume (`useDoubleTap`)
- [x] Add shake to restart (`useShakeDetection`, opt-in)
- [x] Create preferences store for gesture toggles (`PreferencesStore`)

### Pending
- [ ] Create settings UI screen for gesture toggles
- [ ] Manual mobile testing (iOS Safari, Android Chrome)

## Phase 7: Single-User Polish

### Settings UI
- [x] Create `/settings` page
- [x] Add toggle for wake lock
- [x] Add toggle for double-tap pause
- [x] Add toggle for shake-to-restart
- [x] Add auto-hide timeout slider
- [x] Add distraction-free mode toggle

### UX Improvements
- [ ] Add onboarding/tutorial for first-time users
- [x] Improve error states (API failures, no lyrics found)
- [x] Add loading skeletons for search results
- [x] Add "no results" empty state with suggestions
- [ ] Display lyrics attribution in UI (API already returns it)
- [ ] Skip lyrics fetch when `hasLyrics === false` (show error immediately)

### Visual Polish
- [ ] Refine typography and spacing
- [ ] Add subtle animations for state transitions
- [x] Improve voice indicator feedback
- [x] Add haptic feedback on mobile (if supported)

### Testing & Validation
- [ ] Manual testing on iOS Safari
- [ ] Manual testing on Android Chrome
- [ ] Test VAD with various microphones
- [ ] Verify VAD doesn't trigger on guitar/instruments
- [ ] Test with background noise
- [ ] Performance audit (bundle size, FCP, LCP)

## Phase 8: Song Management (Local)

### Recent Songs
- [ ] Store recent songs in localStorage
- [ ] Create recent songs list on home page
- [ ] Add "clear history" option

### Favorites
- [ ] Add heart/star button to save favorites
- [ ] Store favorites in localStorage
- [ ] Create favorites list view
- [ ] Quick-access from home page

### Per-Song Settings
- [ ] Persist tempo per song (already done via useTempoPreference)
- [ ] Add notes field per song (key, capo position, etc.)
- [ ] Store in localStorage keyed by song ID

---

## V2 Features (Future)

### Chords Integration
- [ ] Define `ChordChart` type
- [ ] Research chord API options (Ultimate Guitar, Chordify)
- [ ] Create `src/lib/chords-client.ts`
- [ ] Create chord overlay components
- [ ] Add transpose controls (+/- semitones)
- [ ] Implement capo indicator

### User Accounts
- [ ] Set up database (Vercel Postgres or alternative)
- [ ] Implement authentication (OAuth or email)
- [ ] Create user profile page
- [ ] Sync favorites/history across devices
- [ ] Connect Spotify account for personalized search

### Karaoke Mode
- [ ] Create `src/components/display/KaraokeDisplay.tsx`
- [ ] Implement large text display (2-3 lines max)
- [ ] Add per-word highlighting (if timestamps available)
- [ ] Implement countdown before start
- [ ] Add color themes

### Jam Session (Multiplayer)
- [ ] Set up WebSocket infrastructure
- [ ] Create session creation flow
- [ ] Implement QR code generation
- [ ] Add guest join flow
- [ ] Build song queue UI
- [ ] Implement real-time sync
- [ ] Add host controls

### Advanced Features
- [ ] Metronome mode (UI for existing `SoundSystem.playMetronomeTick`)
- [ ] Word-level detection (Smart Sync) - requires ML-based VAD
- [ ] Karaoke playback (instrumental tracks)
- [ ] Voice commands
- [ ] Foot pedal support
- [ ] Multi-language support
- [ ] Offline mode / setlist caching

### Code Quality
- [ ] Wrap client-side fetch calls in Effect for consistency
- [ ] Add Effect-based caching layer for LyricsPlayer
- [ ] Use Effect Schema or Zod for API response validation

---

## V3 Features (Future)

### Spotify Integration
- [ ] Set up Spotify OAuth flow (client credentials)
- [ ] Create `src/lib/spotify-client.ts`
- [ ] Implement song search API route with Spotify
- [ ] Implement track metadata fetch (tempo, BPM)
- [ ] Store tokens securely (in-memory cache with auto-refresh)
- [ ] Merge Spotify search results with LRCLIB lyrics availability
- [ ] Add album art from Spotify to search results

---

## Current Focus

> Update this section with what you're currently working on

**Completed:** Phase 0, 1, 2, 3, 4, 5, 6

**Active:** Phase 7 - Single-User Polish
- UX improvements
- Mobile testing

**Blocked:** Nothing

**Next:** Phase 8 (Song Management - Local), then V2 features

---

## Architecture Notes

### Voice Detection Flow
```
User clicks mic → VoiceActivityStore.startListening()
  → SoundSystem.getMicrophoneAnalyser() (Tone.js AudioContext)
  → requestAnimationFrame analysis loop
  → computeRMSFromByteFrequency() → smoothLevel() → detectVoiceActivity()
  → isSpeaking changes → VoiceStart/VoiceStop events
  → useVoiceTrigger hook detects isSpeaking=true
  → lyricsPlayer.play() called
  → LyricsPlayer starts animation loop, advances currentTime
  → useCurrentLineIndex() updates → LyricsDisplay scrolls
```

### Libraries
| Purpose | Library | Notes |
|---------|---------|-------|
| Audio Context | Tone.js | Single AudioContext owner |
| VAD | Custom RMS | Simple energy-based, sufficient for MVP |
| Animation | Motion | Spring-based, GPU-accelerated |
| State | Effect.ts | Tagged events, type-safe |
| Lyrics Source | LRCLIB | Free, synced LRC format |
| Song Search | LRCLIB | Direct search by artist/title |

### Demo Page
Access `/demo` to test voice detection with mock lyrics without needing Spotify/LRCLIB integration.
