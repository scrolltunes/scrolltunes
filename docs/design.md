# ScrollTunes - Design Document

## Overview

A web app that displays scrolling lyrics synced to a live musical performance. The app detects when a performer starts singing and automatically synchronizes the lyrics display to the song's timing.

## Problem Statement

Live musicians and karaoke performers need a lyrics teleprompter that syncs to their **live performance**, not a pre-recorded track. Traditional karaoke apps require playing the original audio, which doesn't work for acoustic/live scenarios.

## Core Concept

```
┌─────────────────────────────────────────────────────────────┐
│                    LIVE PERFORMANCE                         │
│                                                             │
│   🎸 Guitarist plays intro...  │  📱 App: lyrics WAITING   │
│                                │      (paused at start)     │
│                                │                            │
│   🎤 Singer starts: "Hello..." │  📱 App: DETECTS VOICE →  │
│                                │      JUMPS to Line 1       │
│                                │      → scrolling begins    │
│                                │                            │
│   🎵 Performance continues     │  📱 Lyrics scroll at       │
│                                │      song's known tempo    │
└─────────────────────────────────────────────────────────────┘
```

## User Flow

1. User selects a song (searches via Spotify or other music provider)
2. App fetches lyrics with timestamps from lyrics API
3. App enters **waiting state** — lyrics visible but paused at the beginning
4. App listens via device microphone for vocal onset
5. **Trigger**: Voice detected → timestamp jumps to first lyric's timecode
6. Lyrics auto-scroll at the song's pre-defined pace from that sync point
7. User can click any lyric line to manually jump to that timecode

## Key Assumptions

- Performer plays at roughly the **original song tempo**
- Only need to detect **when** singing starts, not **what** is being sung
- Initial sync is always to **first lyric line** (no mid-song detection yet)

## Open Questions

- **False positives** — Guitar strums or audience noise triggering early? Need robust voice-vs-instrument discrimination
- **Manual override** — Tap to re-sync if detection fails?

## Recent VAD tuning (dev)

- Silero guitar preset: threshold 0.88, minSpeechMs 250, negative 0.7, redemption 500; starts require smoothed >= threshold, defer releases after energy gate opens, plus preroll release when raw >= 0.95 and smoothed >= 0.75 (max 600ms defer)
- Energy gate: on 0.16, off 0.09, hold 150ms, smoothing 0.2; burst suppression: peak 0.35, decay 0.18, window 500ms
- Dev-only VAD server logs are gated by `NEXT_PUBLIC_ENABLE_DEV_VAD_LOGS=true` (in addition to NODE_ENV guard); keep disabled in production/staging
- Goal: allow soft vocal onsets (e.g., “another turning”) while blocking guitar-only strums; if false starts return, raise energy on-threshold slightly; if missed soft onsets return, drop Silero threshold marginally

---

## Backlog / Future Features

### 1. Tempo Adjustment

**Priority**: High | **Version**: MVP+

**Manual Mode**:
- Slider control to adjust playback tempo (e.g., 50% - 150% of original)
- Presets: "Slower", "Original", "Faster"
- Remember per-song tempo preferences

**Auto-Detection Mode** (future):
- Analyze live audio to detect current playing tempo via beat detection
- Continuously adjust scroll speed to match performer's tempo
- Handle tempo drift gracefully — live performers don't play to a click track
- Use onset detection and beat tracking (librosa/essentia algorithms) to estimate BPM in real-time
- Smoothing algorithm to avoid jarring speed changes

---

### 2. Karaoke Mode

**Priority**: High | **Version**: v1.0

Full-screen karaoke display optimized for stage/TV viewing:

- **Large text display** — Current line prominent, next line preview
- **Per-word highlighting** — Words illuminate as they should be sung
- **Bouncing ball animation** — Classic karaoke visual cue tracking word timing
- **Color themes** — Dark mode for stage, high-contrast options
- **Dual-line view** — Show current + upcoming line for singer preparation
- **Countdown indicator** — Visual cue before singing starts (e.g., "3... 2... 1...")

Technical considerations:
- Word-level timestamps required (not all lyrics APIs provide this)
- Fallback: estimate word timing based on line duration and syllable count

---

### 3. Jam Session Mode

**Priority**: Medium | **Version**: v1.5

Collaborative session for groups/parties:

**Session Creation**:
- Host creates a jam session with unique ID
- Generates shareable one-time URL
- QR code generation for easy mobile access

**Guest Access**:
- Join anonymously or with custom display name
- No account required for guests
- Session expires after configurable time (e.g., 4 hours)

**Features**:
- **Song queue** — Guests can search and add songs to shared playlist
- **Voting** — Upvote/downvote queued songs to prioritize
- **Now playing** — All participants see current lyrics
- **Host controls** — Skip, remove, reorder queue; kick users
- **Chat** (optional) — Simple text chat for coordination

Technical considerations:
- WebSocket-based real-time sync
- Rate limiting to prevent queue spam
- Session state stored temporarily (Redis or similar)

---

### 4. Word-Level Detection (Smart Sync)

**Priority**: Medium | **Version**: v2.0

Detect which words/lines are being sung and jump to that position:

**Use Cases**:
- Skip spoken intros in studio versions when performing live
- Jump into any verse/chorus directly
- Re-sync mid-song if performer skips a section
- Handle songs where live versions differ from studio arrangement

**Technical Approach**:
- Speech-to-text (STT) on live audio input
- Fuzzy matching detected words against lyrics
- Confidence threshold before jumping (avoid false matches)
- Consider phonetic matching for sung words (stretched vowels, etc.)

**Challenges**:
- Real-time STT accuracy with background music
- Handling singing vs. speaking (different acoustic properties)
- Multiple languages support

---

### 5. Karaoke Playback

**Priority**: Low | **Version**: v3.0+

Play instrumental backing tracks for true karaoke experience:

**Option A: Karaoke Track Providers**
- Integrate with services that provide official karaoke/instrumental versions
- Examples: Karaoke Version, Sing King, licensed karaoke catalogs
- Cleanest audio quality, proper licensing

**Option B: Real-Time Vocal Removal**
- Strip vocals from original tracks using AI source separation
- Libraries: Spleeter, Demucs, UVR
- Could run server-side or potentially in-browser (WebAssembly/WebGPU)

**Option C: Live Stream Processing**
- Process YouTube or Spotify audio in real-time (pending TOS review)
- Strip vocals on-the-fly without storing content
- Technical feasibility and legal compliance TBD

**Legal Considerations**:
- ⚠️ Requires thorough TOS review for each service
- May need licensing agreements for commercial use
- Consider partnerships with rights holders

---

### 6. Content Policy & Compliance

**Priority**: Critical | **Version**: All

**No server-side content storage** — The app never stores on external servers:
- Song lyrics (fetched on-demand from providers)
- Audio files or streams
- Video content
- Copyrighted album artwork (use provider CDN URLs)

**Local Browser Caching**:
- Lyrics and metadata are cached locally in the browser (localStorage) for performance
- Cache has a 7-day TTL and is automatically pruned
- No data is sent to or stored on external servers
- Users can clear their local cache at any time via browser settings

**What IS stored (server-side)**:
- Nothing — all user data remains local to the browser

**What IS stored (locally in browser)**:
- Song metadata: title, artist, album name, duration
- Cached lyrics (with 7-day expiration)
- Timecode/sync data (timestamps for lyrics)
- User preferences and history (song IDs only)
- Session data (temporary)

**Display vs. Storage Normalization**:
- **Display**: Always show normalized titles/artists to users (e.g., "Song" not "Song (2020 Remaster)")
- **Storage**: Use original names or IDs for storage, caching, and API lookups
- Normalization uses `@web-scrobbler/metadata-filter` library to strip remaster labels, radio edit suffixes, feat. artists, etc.
- This ensures consistent user experience while maintaining data integrity for matching across providers

**Compliance**:
- Adhere to TOS of all integrated services (Spotify, YouTube, lyrics APIs)
- Display proper attribution as required by API providers
- Implement rate limiting per API requirements
- No redistribution of copyrighted content
- Consider DMCA takedown process if user-generated content added later

---

### 7. Metronome Mode

**Priority**: Medium | **Version**: v1.0

Help performers keep time with configurable tempo cues:

**Audio Click**:
- Classic metronome tick sound
- Configurable volume (0-100%, or muted)
- Sound options: click, woodblock, hi-hat, custom
- Accent on downbeat (first beat of measure)
- Subdivisions support (quarter, eighth notes)

**Visual Pulse**:
- Pulsating light/glow effect synced to beat
- Screen edge flash or central indicator
- Color-coded: strong beat vs. weak beats
- Useful in loud environments where audio click is drowned out
- Low-latency rendering to stay perfectly in sync

**Configuration**:
- Time signature support (4/4, 3/4, 6/8, etc.)
- Tap tempo to set/adjust BPM manually
- Sync to song's detected tempo or override
- Count-in before song starts (e.g., "1, 2, 3, 4...")

---

### 8. Guitar Tabs & Chords Integration

**Priority**: High | **Version**: v1.0

Display chord progressions alongside lyrics for guitarists:

**Inline Chord Display**:
- Chord names positioned above corresponding lyrics at character-level positions
- Amber/gold color (`text-amber-400`) with heavy font weight for visibility
- Both current and next line chords highlighted so musicians can look ahead
- Transpose support (+/- semitones) for capo or alternate tunings

**Chord Mode UX** (optimized for musicians):
- Word-by-word painting animation disabled when chords are shown (static highlight)
- Lyrics use neutral colors so chords remain the visual focus
- Upcoming lines stay visible (no aggressive dimming) for easy scanning
- Variable-speed word painting (syllable-based timing) available for non-chord mode

**Chord Shape Legend** (sidebar):
- Visual chord diagrams showing finger positions
- Updates dynamically to show only chords used in current song
- Fingering numbers and barre indicators
- Alternative voicings toggle (beginner vs. advanced shapes)

**Data Sources**:
- Songsterr API for chord data with character-level positioning
- User-submitted chord charts
- Auto-detection from audio (future — ML-based chord recognition)

**Display Modes**:
- Chords + lyrics (default)
- Full tab view (tablature notation)
- Chord-only mode (compact, just progressions)

---

### 9. Responsive UI & Hands-Free Mode

**Priority**: Critical | **Version**: MVP

The app must work seamlessly for musicians with occupied hands:

**Responsive Design**:
- Mobile-first approach — phones and tablets are primary devices
- Fluid layouts adapting to any screen size/orientation
- Large touch targets for quick glances
- High contrast text, readable from arm's length (phone on lap/music stand)
- Landscape and portrait mode optimization
- Icons replace text labels on small screens to prevent overflow/overlap

**Distraction-Free Mode**:
- Hide all UI chrome — only lyrics visible
- Auto-hide controls after inactivity
- Dark/OLED-friendly theme to reduce glare on stage
- Minimal animations to avoid drawing eye away from lyrics
- Wake lock to prevent screen dimming during performance

**Hands-Free Navigation** (when both hands are on instrument):

*Tap/Gesture Detection*:
- Double-tap anywhere → pause/resume scrolling
- Triple-tap → restart from beginning
- Shake device → next song in queue
- Proximity sensor (if available) → wave to trigger actions

*Voice Commands*:
- "Faster" / "Slower" → adjust scroll tempo
- "Stop" / "Pause" → halt scrolling
- "Next" / "Skip" → move to next song
- "Restart" → jump to beginning
- Keyword activation (e.g., "Hey ScrollTunes") or always-listening mode
- Works even with background music/singing (noise-robust recognition)

*Audio Cue Detection*:
- Detect specific sounds (e.g., two quick guitar taps on body)
- Configurable trigger patterns
- Foot pedal support via Bluetooth/audio input

**Accessibility**:
- Large font size options
- Screen reader support for setup/configuration
- High contrast and colorblind-friendly themes
- Reduce motion option

---

### 10. User Profiles & Account Management

**Priority**: Medium | **Version**: v1.0

**Profile Features**:
- Display name and avatar
- Email for account recovery
- Privacy settings

**Song History**:
- Recently played songs
- Favorite songs list
- Personal tempo preferences per song
- Playback statistics (optional)

**Service Connections**:
- OAuth integration with Spotify, Apple Music, etc.
- Secure token storage and refresh handling
- Revoke access controls
- Sync playlists from connected services

**Session Management**:
- View active sessions
- Remote logout capability
- API key management for connected services

**Data Portability**:
- Export personal data (GDPR compliance)
- Delete account and all associated data

## Technical Approach (Initial)

- **Voice Detection**: Voice Activity Detection (VAD) tuned for vocal frequencies (formants ~300-3400Hz) to distinguish from guitar/instruments
- **Lyrics API**: Musixmatch, Genius, or similar service with timestamp data
- **Music Metadata**: Spotify API for song search and tempo information

## Candidate Libraries

| Component | Library | Notes |
|-----------|---------|-------|
| Voice Activity Detection | webrtc-vad, VAD.js | Browser-based, real-time |
| Singing/Voice Classification | TensorFlow.js | Run trained model in browser |
| Audio Analysis | Tone.js, Web Audio API | Onset detection, frequency analysis |
| Lyrics Sync | lyrics-kit | LRC format parsing, timestamp sync |
| Source Separation (optional) | spleeter | Separate vocals from instruments (server-side) |
