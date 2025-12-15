# ScrollTunes Implementation TODO

> Track progress by checking off items: `- [x]`

## Phase 0: Project Setup

- [ ] Initialize Next.js 15 project with App Router
- [ ] Configure TypeScript (strict mode, path aliases)
- [ ] Set up Biome for linting/formatting
- [ ] Configure Tailwind CSS 4
- [ ] Set up Vitest for testing
- [ ] Create initial folder structure (`src/`, `app/`, etc.)
- [ ] Add Motion (motion.dev) dependency
- [ ] Add Tone.js dependency
- [ ] Configure Vercel deployment
- [ ] Create `.env.example` with required variables

## Phase 1: Core Infrastructure

### Design Tokens
- [ ] Install Style Dictionary
- [ ] Add `tokens:build` script to package.json
- [ ] Generate initial Tailwind config from tokens
- [ ] Create `src/theme.ts` with token exports
- [ ] Create `src/animations.ts` with spring configs

### Audio System
- [ ] Create `src/sounds/SoundSystem.ts` (singleton, owns AudioContext)
- [ ] Implement lazy initialization pattern
- [ ] Add mute/unmute functionality
- [ ] Create basic UI feedback sounds

### State Management
- [ ] Create `src/core/` folder
- [ ] Implement base store pattern with `useSyncExternalStore`
- [ ] Create `src/core/LyricsPlayer.ts` skeleton
- [ ] Create `src/core/VoiceActivityStore.ts` skeleton

## Phase 2: Lyrics Display (MVP)

### Data Layer
- [ ] Define `Lyrics` type (lines, timestamps, words)
- [ ] Create `src/lib/lyrics-parser.ts` (parse LRC format)
- [ ] Write tests for lyrics parser
- [ ] Create mock lyrics data for development

### Components
- [ ] Create `src/components/display/LyricsDisplay.tsx`
- [ ] Create `src/components/display/LyricLine.tsx`
- [ ] Implement smooth scrolling with Motion transforms
- [ ] Add current line highlighting
- [ ] Make responsive (mobile-first)

### Player Logic
- [ ] Implement `LyricsPlayer` state machine (idle → playing → paused)
- [ ] Add time-based line advancement
- [ ] Implement click-to-seek on lyric lines
- [ ] Add manual scroll override detection

## Phase 3: Voice Detection

### VAD Implementation
- [ ] Create `src/lib/voice-detection.ts` (pure math functions)
- [ ] Implement RMS energy calculation
- [ ] Add smoothing and hysteresis logic
- [ ] Write tests for VAD logic

### Integration
- [ ] Implement `VoiceActivityStore` with mic access
- [ ] Create `src/hooks/useVoiceDetection.ts`
- [ ] Wire VAD to LyricsPlayer (voice start → jump to first line)
- [ ] Add visual indicator for listening state
- [ ] Handle permission denied gracefully

### Testing
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Verify VAD doesn't trigger on guitar/instruments
- [ ] Test with background noise

## Phase 4: Song Search & Lyrics API

### Spotify Integration
- [ ] Set up Spotify OAuth flow
- [ ] Create `src/lib/spotify-client.ts`
- [ ] Implement song search API route
- [ ] Implement track metadata fetch
- [ ] Store tokens securely

### Lyrics API
- [ ] Choose lyrics provider (Musixmatch, Genius, etc.)
- [ ] Create `src/lib/lyrics-client.ts`
- [ ] Implement lyrics fetch API route
- [ ] Handle missing lyrics gracefully
- [ ] Add lyrics attribution as required

### UI
- [ ] Create song search component
- [ ] Create song selection/confirmation screen
- [ ] Show loading states
- [ ] Handle API errors

## Phase 5: Tempo & Controls

### Tempo Adjustment
- [ ] Add tempo slider component
- [ ] Implement scroll speed adjustment
- [ ] Add preset buttons (Slower, Original, Faster)
- [ ] Persist tempo preference per song

### Playback Controls
- [ ] Create play/pause button
- [ ] Add restart button
- [ ] Implement progress indicator
- [ ] Add keyboard shortcuts

## Phase 6: Mobile & Hands-Free

### Responsive UI
- [ ] Test all screens on mobile viewports
- [ ] Implement distraction-free mode
- [ ] Add wake lock (`useWakeLock` hook)
- [ ] Ensure large touch targets

### Hands-Free (Basic)
- [ ] Implement double-tap to pause/resume
- [ ] Add shake to restart (optional, configurable)
- [ ] Create settings screen for gesture toggles

## Phase 7: Chords Integration

### Data Layer
- [ ] Define `ChordChart` type
- [ ] Research chord API options
- [ ] Create `src/lib/chords-client.ts`
- [ ] Implement chord fetch

### Components
- [ ] Create `src/components/chords/InlineChord.tsx`
- [ ] Create `src/components/chords/ChordDiagram.tsx`
- [ ] Create `src/components/chords/ChordLegend.tsx` (sidebar)
- [ ] Integrate chords with lyrics display

### Features
- [ ] Add transpose controls (+/- semitones)
- [ ] Implement capo indicator
- [ ] Toggle chords on/off

## Phase 8: User Accounts

- [ ] Set up database (Vercel Postgres or alternative)
- [ ] Implement authentication (OAuth or email)
- [ ] Create user profile page
- [ ] Implement song history
- [ ] Add favorites/setlists
- [ ] Connect Spotify account

## Phase 9: Karaoke Mode

- [ ] Create `src/components/display/KaraokeDisplay.tsx`
- [ ] Implement large text display
- [ ] Add per-word highlighting (if timestamps available)
- [ ] Implement countdown before start
- [ ] Add color themes

## Phase 10: Jam Session

- [ ] Set up WebSocket infrastructure
- [ ] Create session creation flow
- [ ] Implement QR code generation
- [ ] Add guest join flow
- [ ] Build song queue UI
- [ ] Implement real-time sync
- [ ] Add host controls

## Future / Backlog

- [ ] Metronome mode
- [ ] Word-level detection (Smart Sync)
- [ ] Karaoke playback (instrumental tracks)
- [ ] Voice commands
- [ ] Foot pedal support
- [ ] Multi-language support
- [ ] Offline mode / setlist caching

---

## Current Focus

> Update this section with what you're currently working on

**Active:** Phase 0 - Project Setup

**Blocked:** Nothing

**Next:** Phase 1 - Core Infrastructure
