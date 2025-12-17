# 🎤 ScrollTunes

A live lyrics teleprompter for musicians. Detects your voice and syncs scrolling lyrics to your performance.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## The Problem

Live musicians need lyrics on stage, but traditional karaoke apps require playing the original track. **ScrollTunes** solves this by detecting when *you* start singing and syncing the lyrics to *your* live performance.

## How It Works

```
🎸 You play the intro...        📱 Lyrics wait at the start
🎤 You start singing...         📱 Voice detected → lyrics scroll
🎵 You perform at your tempo    📱 Lyrics follow along
```

## Features

### Core
- **Voice-triggered sync** — Microphone detects vocal onset and starts scrolling
- **Synced lyrics** — Timestamped lyrics from LRCLIB scroll at the song's tempo
- **Voice search** — Say a song name to search hands-free (requires sign-in)
- **Click-to-seek** — Tap any line to jump to that position
- **Manual scroll override** — Swipe to take control, auto-scroll resumes after 3 seconds

### Playback Controls
- **Tempo adjustment** — Speed up or slow down scroll (0.5x–2x)
- **Progress indicator** — Visual progress bar with duration
- **Play/Pause/Reset** — Standard playback controls
- **Metronome** — Optional visual/audio beat indicator with BPM display

### Mobile-First
- **Responsive design** — Optimized for phone on music stand or lap
- **Large touch targets** — Easy to tap while playing
- **Wake lock** — Screen stays on during performance
- **Distraction-free mode** — Auto-hiding controls

### Hands-Free
- **Double-tap** — Pause/resume without reaching for buttons
- **Shake to restart** — Shake device to jump back to start (opt-in)
- **Voice indicator** — Visual feedback for mic status and voice detection

### Song Management
- **Search** — Find songs by title or artist via LRCLIB
- **Recent songs** — Quick access to recently played tracks
- **Lyrics caching** — 7-day local cache for offline access
- **Resume playback** — Return to where you left off

### Chords (Experimental)
- **Guitar chords** — Display chord progressions above lyrics (via Songsterr)
- **Transpose** — Shift chords up/down by semitones
- **Chord toggle** — Show/hide chords with one tap
- **Enable in Settings** — Settings → Experimental → Enable chords

### Settings
- **Font size** — Adjustable lyrics text size (16–64px)
- **Auto-hide timeout** — Configure when controls disappear
- **Gesture toggles** — Enable/disable double-tap and shake
- **Theme** — Dark mode optimized for stage visibility

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 |
| Animation | Motion (motion.dev) |
| Audio | Tone.js + Web Audio API |
| State | Effect.ts patterns |
| Testing | Vitest |
| Linting | Biome |
| Hosting | Vercel |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js 18+
- A microphone for voice detection

### Installation

```bash
# Clone the repository
git clone https://github.com/scrolltunes/scrolltunes.git
cd scrolltunes

# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Optional: GetSongBPM API key for tempo data
# Get yours at https://getsongbpm.com/api
GETSONGBPM_API_KEY=your_api_key_here
```

## Usage

1. **Search for a song** — Enter title or artist on the home page
2. **Select your song** — Click a search result to load lyrics
3. **Enable microphone** — Click the mic button to start listening
4. **Start performing** — When you sing, lyrics automatically start scrolling
5. **Adjust as needed** — Use controls to adjust tempo, seek, or restart

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `R` | Reset to beginning |
| `←` / `→` | Seek backward/forward |
| `↑` / `↓` | Adjust tempo |

## Project Structure

```
scrolltunes/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Home (search)
│   ├── song/[...]/        # Lyrics player page
│   ├── settings/          # Settings page
│   └── api/               # API routes
├── src/
│   ├── components/        # React components by domain
│   │   ├── audio/         # Voice, metronome, controls
│   │   ├── display/       # Lyrics display
│   │   ├── search/        # Search, recent songs
│   │   ├── chords/        # Chord display components
│   │   └── ui/            # Reusable primitives
│   ├── core/              # State management (Effect.ts)
│   │   ├── LyricsPlayer.ts
│   │   ├── VoiceActivityStore.ts
│   │   └── PreferencesStore.ts
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and API clients
│   └── sounds/            # Audio system (Tone.js)
└── docs/                  # Documentation
```

## Scripts

```bash
bun run dev        # Start development server
bun run build      # Production build
bun run start      # Start production server
bun run typecheck  # TypeScript check
bun run lint       # Biome lint
bun run test       # Run tests
bun run check      # lint + typecheck + test
```

## Architecture

ScrollTunes follows an **Effect-first architecture** with:

- **Tagged events** — Type-safe state transitions using Effect.ts `Data.TaggedClass`
- **Store pattern** — Domain stores with `useSyncExternalStore` for React integration
- **Singleton audio** — Centralized `SoundSystem` owns the AudioContext
- **Mobile-first** — Responsive design with large touch targets

See [docs/architecture.md](docs/architecture.md) for details.

## Data Sources

| Service | Purpose | Attribution |
|---------|---------|-------------|
| [LRCLIB](https://lrclib.net) | Synced lyrics | Displayed in footer |
| [GetSongBPM](https://getsongbpm.com) | Tempo/BPM data | Displayed in footer |
| [Songsterr](https://songsterr.com) | Guitar chords | Experimental feature |

## Privacy

- **No server-side storage** — Lyrics are fetched on-demand, not stored on our servers
- **Local caching only** — Browser localStorage with 7-day TTL for performance
- **No tracking** — No analytics or user tracking
- **Microphone access** — Used only for voice detection, audio is not recorded or transmitted

## Roadmap

### V1 (Current)
- ✅ Voice-triggered lyrics sync
- ✅ Tempo adjustment
- ✅ Mobile-optimized UI
- ✅ Hands-free gestures
- ✅ Recent songs & caching
- ✅ Voice search (Google Speech-to-Text)
- ✅ User accounts & cloud sync
- ✅ Favorites & setlists

### V1.1 (Experimental)
- ✅ Guitar chord integration (Songsterr)
- ✅ Transpose controls
- 🔲 Chord diagrams (tap to view fingering)
- 🔲 Capo indicator

### V2 (Planned)
- Karaoke mode (large text, word highlighting)
- Jam session mode (multiplayer)

### V3 (Future)
- Smart sync (word-level detection)
- Live tempo tracking
- Spotify integration

## Contributing

Contributions are welcome! Please read the architecture docs before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run checks (`bun run check`)
5. Commit your changes
6. Push to the branch
7. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- [LRCLIB](https://lrclib.net) for free synced lyrics
- [GetSongBPM](https://getsongbpm.com) for tempo data
- [Effect.ts](https://effect.website) for the architecture inspiration
- [visual-effect](https://github.com/kitlangton/visual-effect) for state management patterns

---

Built with 🎵 for musicians who need their lyrics on stage.
