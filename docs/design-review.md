# ScrollTunes Design Review

> Analysis of design.md features, identifying gaps, corner cases, and open questions.

## Cross-Cutting Concerns

### Permissions & Startup Flow

- Mic access requires user gesture and clear UX for denied/unavailable states
- Bluetooth device permissions (foot pedals, external mics)
- Wake lock permission handling
- Notification permissions for jam sessions
- **Missing**: Graceful degradation when permissions denied (manual scroll only)

### Latency & Timing

- JS timers are unreliable on mobile browsers
- Bluetooth audio adds 100-300ms latency
- Background tabs get throttled, breaking metronome/scrolling
- **Decision needed**: Define a "master clock" per mode (tempo metadata vs live detection vs metronome)

### Offline / Network

- Design assumes always-online (lyrics API, Spotify, STT, chords)
- **Missing**: Strategy for pre-caching setlists within content policy
- **Missing**: Clear "offline mode" with degraded features
- Jam Session is inherently online-only — surface this clearly

### Privacy & Legal

- "No content storage" needs precise definition:
  - Cache duration limits?
  - STT transcripts = content?
  - User-submitted chords = content?
- Logs may accidentally contain lyrics in error payloads
- **Missing**: Data classification policy

### Internationalization

- RTL languages (Arabic, Hebrew) need layout support
- CJK languages have different word/character boundaries
- Chord naming varies by locale (B vs H in German)
- Voice commands need per-language vocabulary
- **Missing**: Multi-language lyrics in same song

---

## Feature-Specific Gaps

### 1. Tempo Adjustment

**Corner cases:**
- Songs with variable tempo (rubato, tempo jumps, ritardando)
- Tempo metadata missing or inaccurate from provider
- Performer intentionally deviating (half-time, double-time)
- Multi-device setups need consistent tempo across views

**Failure modes:**
- Incorrect BPM detection → lyrics drift
- Jittery scroll from noisy beat detection
- Manual vs auto conflict when user adjusts slider during auto mode

**Missing:**
- Per-section tempo (bridge faster than verse)
- Calibration/testing mode to verify alignment
- Quick in-performance controls (+/- buttons, hardware volume keys)
- Low-end device fallback (CPU-intensive beat tracking)

**Open questions:**
- Are we optimizing for "match studio tempo" or "follow performer"?
- Bounded auto-adjustment (e.g., ±15% max) to prevent runaway drift?

---

### 2. Karaoke Mode

**Corner cases:**
- No word-level timestamps from API (common)
- Complex scripts (CJK) where word boundaries differ
- Very long lines wrapping multiple rows
- Small screens in portrait mode
- Singer starts before countdown ends

**Failure modes:**
- Misaligned per-word highlights → cognitive dissonance
- High CPU/GPU from animations → dropped frames, battery drain
- Countdown vs live detection conflict

**Missing:**
- Display mirroring / Chromecast / AirPlay to TV
- Safe area handling for notched devices
- Customizable font family and weight
- Syllable-based timing estimation fallback
- "Reduce motion" mode honoring OS preference

**Open questions:**
- Separate "performance mode" (distraction-free) vs "party mode" (animations)?
- Per-device offset calibration for latency compensation?

---

### 3. Jam Session Mode

**Corner cases:**
- Host disconnects (network drop, battery dies, browser closed)
- Network partitions → guests see different queue states
- Guests joining mid-song need position sync
- Songs unavailable in certain regions
- Session ID brute-forcing / QR screenshot persisting beyond expiry
- Mobile browsers backgrounding WebSockets

**Failure modes:**
- Desync between participants (queue order, lyric position)
- Queue spam / abuse / offensive usernames
- Host disappears permanently
- Redis restart → sessions vanish

**Missing:**
- Host handoff / transfer mechanism
- Host authentication (PIN or special link)
- Moderation tools (mute chat, ban user, profanity filter)
- Rate limiting per user and global
- Device role option (queue-only view vs full lyrics)
- "Offline – session paused" indicator

**Open questions:**
- Server-authoritative state with regular resync?
- Session persistence beyond Redis restart?
- Guest identity vs abuse prevention tension?

---

### 4. Word-Level Detection (Smart Sync)

**Corner cases:**
- Accents, covers, paraphrasing, ad-libs
- Multiple singers / backing vocals / crowd
- Instrumental sections with talking between verses
- Repeated phrases (chorus 4x) → wrong repeat matched
- Language mismatch (UI vs STT vs lyrics)

**Failure modes:**
- Incorrect jumps to wrong verse/chorus
- Cloud STT latency causing late jumps
- No match for long periods (noise, speaking)
- Privacy: streaming audio to cloud conflicts with "no storage"

**Missing:**
- High confidence thresholds + windowed matching
- Hysteresis: require sustained match before jumping
- Tuning/diagnostic view showing matched words + confidence
- "Lock to section" option to prevent large jumps
- Explicit opt-in with privacy notice

**Open questions:**
- On-device STT vs cloud? (latency vs accuracy vs privacy)
- Phonetic matching for sung/stretched words?
- Clearly label as "experimental/advanced" feature?

---

### 5. Karaoke Playback

**Corner cases:**
- Region restrictions on tracks
- Bluetooth latency (user hears delayed backing track)
- Device underpowered for real-time AI source separation
- TOS fragility for live-stream processing

**Failure modes:**
- Lyrics out of sync with backing track (version mismatch, latency)
- TOS violations (capturing Spotify/YouTube audio)
- Quality issues from AI vocal removal (artifacts)

**Missing:**
- Fine-tune offset (+/- ms) between audio and lyrics
- Per-song offset preferences
- Mix controls (click, backing track, reference volumes)
- Practice mode vs stage mode distinction
- "Unavailable in your region" graceful handling

**Open questions:**
- Drop Option C (live stream processing) without legal partnership?
- Explicit "experimental" labeling for AI separation?
- Conflicts with core "no playback" design philosophy?

---

### 6. Content Policy & Compliance

**Corner cases:**
- Logs/analytics accidentally containing lyrics in URLs or error payloads
- Backups storing data longer than intended
- STT transcripts and AI outputs = "content"?
- User-generated content (chat, chord submissions)

**Failure modes:**
- Accidental storage of copyrighted text
- Token leaks for API providers
- TOS drift: provider changes terms, app non-compliant

**Missing:**
- Data classification document
- Cache TTL and backup retention policy
- Concrete Privacy Policy and Terms of Service
- User data export/delete implementation (GDPR)
- Auditability: proving compliance if challenged
- Strip/hash lyric content before logging

**Recommended clarification:**
> "No long-term storage of third-party copyrighted content; short-lived caching permitted for performance. User-generated content stored with user consent."

---

### 7. Metronome Mode

**Corner cases:**
- Metronome click bleeding into mic → confuses VAD/STT
- Bluetooth audio latency makes click feel off-beat
- Backgrounded tab breaks timing
- Metronome continues after song ends

**Failure modes:**
- Timing drift/jitter from JS timers
- Metronome fights auto-tempo or Smart Sync
- User confusion about which is "master" (click vs scroll)

**Missing:**
- Web Audio scheduled events instead of `setInterval`
- Haptic feedback (vibration on beat)
- Click frequency shaping to reduce VAD interference
- Clear precedence rules (practice mode vs live-follow mode)
- Visual + haptic cues for deaf/hard-of-hearing

**Open questions:**
- Headphone-only mode to prevent mic interference?
- "Follow song length" vs "free metronome" toggle?

---

### 8. Guitar Tabs & Chords

**Corner cases:**
- Chord naming conventions vary (B vs H, Bb vs A#, solfège)
- Long jazz chord names overlapping lyrics
- Transposition + capo interactions confusing for beginners
- Small phone screens with little space

**Failure modes:**
- Misaligned chords when lyrics wrap or fonts differ
- Chord data errors from providers or user submissions
- Performance issues rendering many diagrams

**Missing:**
- Instrument mode selector (guitar, ukulele, piano)
- Printable/export view for offline rehearsal
- Alternative voicings toggle (beginner vs advanced)
- Chord anchoring to word tokens, not absolute positions
- Source labeling ("Community chords" vs official)

**Open questions:**
- User-submitted chords conflict with "no storage" policy?
- Per-locale chord naming configuration?

---

### 9. Responsive UI & Hands-Free Mode

**Corner cases:**
- Accidental gesture triggers (stage movement, vibrations)
- Devices without proximity sensor
- Voice commands matching lyrics ("stop", "next" sung in song)
- Browsers not honoring wake lock
- OS killing background PWA

**Failure modes:**
- Unintended navigation mid-performance
- Voice command misfires in noisy environments
- Screen sleep despite wake lock

**Missing:**
- Gestures explicitly opt-in and configurable
- Sensitivity thresholds and "lock gestures" toggle
- Wake word requirement ("Hey ScrollTunes") or push-to-talk
- Calibration UI for audio cue triggers (guitar body taps)
- Status indicators ("Listening", "Shake enabled")
- Panic button to reset and disable all hands-free

**Open questions:**
- Always-listening vs privacy/battery concerns?
- Per-language voice command vocabulary?

---

### 10. User Profiles & Account Management

**Corner cases:**
- Shared devices (band members on same tablet) → account switching
- OAuth token revocation or 2FA changes
- Deleted accounts appearing in jam session history/logs

**Failure modes:**
- Token expiry causing silent failures
- Incomplete GDPR delete (data in backups, third-party systems)
- Account lockouts (email lost, social login disabled)

**Missing:**
- Secondary recovery options
- Roles (performer, host, guest) with permissions
- Device trust ("remember this device")
- Tiered model: anonymous local mode vs full account

**Open questions:**
- What does "delete account" mean for derived data?
- Guest/offline mode syncing history when back online?

---

## Priority Decisions Needed

1. **Content & privacy stance**: Precise definition of "no storage" (duration, caching, derived data)
2. **Timing authority**: Consistent master clock per mode with clear precedence
3. **Offline story**: Pre-cached setlist mode in scope? How to reconcile with content policy?
4. **Mode separation**: Clear distinction between:
   - Core live teleprompter (simple, robust)
   - Karaoke/party features
   - Experimental ML features (Smart Sync, AI separation)
