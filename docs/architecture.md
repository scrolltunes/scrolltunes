# ScrollTunes - Architecture Document

> Reference architecture based on [kitlangton/visual-effect](https://github.com/kitlangton/visual-effect)

## Overview

ScrollTunes is a web application for live musicians that displays synchronized scrolling lyrics with voice-triggered playback. Built with modern web technologies and designed for responsive, hands-free operation.

**In this house, we use bun.** All package management and script execution should use `bun` commands, not `npm` or `node`.

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19 | UI components with hooks |
| **Framework** | Next.js 15 (App Router) | SSR, routing, API routes, code splitting |
| **Animation** | Motion (motion.dev) | Smooth spring animations, hardware-accelerated |
| **Styling** | Tailwind CSS 4 | Utility-first, responsive design |
| **Audio** | Tone.js + Web Audio API | Sound synthesis, audio analysis, VAD |
| **Hosting** | Vercel | Zero-config deployment, edge functions |
| **Package Manager** | bun | Fast installs and script execution |
| **Linting/Formatting** | Biome | Single tool replacing ESLint + Prettier |
| **Testing** | Vitest + jsdom | Fast unit testing with DOM environment |
| **Types** | TypeScript (strict) | Full type safety |
| **Database** | TBD | User profiles, session data |

## Project Structure

```
scrolltunes/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout with metadata
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Global styles + Tailwind
│   ├── ClientAppContent.tsx      # Client-side app wrapper
│   ├── song/[id]/
│   │   └── page.tsx              # Song player page
│   ├── session/[id]/
│   │   └── page.tsx              # Jam session page
│   ├── profile/
│   │   └── page.tsx              # User profile
│   └── api/                      # API routes
│       ├── lyrics/route.ts
│       ├── spotify/route.ts
│       └── session/route.ts
│
├── src/
│   ├── components/               # React components (by domain)
│   │   ├── display/              # Main display logic
│   │   │   ├── LyricsDisplay.tsx
│   │   │   ├── KaraokeDisplay.tsx
│   │   │   └── ScrollingLyrics.tsx
│   │   ├── audio/                # Audio-related components
│   │   │   ├── VoiceDetector.tsx
│   │   │   ├── Metronome.tsx
│   │   │   └── TempoControl.tsx
│   │   ├── chords/               # Guitar/chord components
│   │   │   ├── ChordDiagram.tsx
│   │   │   ├── ChordLegend.tsx
│   │   │   └── InlineChord.tsx
│   │   ├── feedback/             # User feedback (toasts, alerts)
│   │   │   └── NotificationBubble.tsx
│   │   ├── layout/               # Layout and navigation
│   │   │   ├── NavigationSidebar.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── session/              # Jam session components
│   │   │   ├── QRCode.tsx
│   │   │   ├── SongQueue.tsx
│   │   │   └── GuestList.tsx
│   │   ├── ui/                   # Reusable UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Slider.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── SegmentedControl.tsx
│   │   │   ├── VolumeToggle.tsx
│   │   │   └── index.ts          # Barrel export
│   │   ├── CodeBlock.tsx         # Top-level shared components
│   │   ├── Timer.tsx
│   │   └── index.ts
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useVoiceDetection.ts  # VAD hook
│   │   ├── useLyricsSync.ts      # Lyrics timing hook
│   │   ├── useAudioAnalysis.ts   # Web Audio analysis
│   │   ├── useWakeLock.ts        # Screen wake lock
│   │   ├── useHandsFree.ts       # Voice commands hook
│   │   ├── useStateTransition.ts # State change tracking
│   │   └── useOptionKey.ts       # Keyboard detection
│   │
│   ├── lib/                      # Core library code
│   │   ├── lyrics-parser.ts      # LRC/timestamp parsing
│   │   ├── spotify-client.ts     # Spotify API wrapper
│   │   ├── voice-detection.ts    # VAD algorithms
│   │   ├── tempo-tracker.ts      # Beat detection
│   │   └── songs-manifest.ts     # Song registry (like examples-manifest)
│   │
│   ├── sounds/                   # Audio system (Tone.js)
│   │   ├── SoundSystem.ts        # Centralized sound manager
│   │   ├── metronome.ts          # Metronome sounds
│   │   └── notifications.ts      # UI feedback sounds
│   │
│   ├── constants/                # App constants
│   │   ├── colors.ts             # Color tokens
│   │   └── dimensions.ts         # Sizing/spacing values
│   │
│   ├── shared/                   # Shared utilities
│   │   └── idUtils.ts            # ID generation helpers
│   │
│   ├── animations.ts             # Centralized animation config
│   ├── theme.ts                  # Design tokens
│   └── AppContent.tsx            # Main app component
│
├── public/                       # Static assets
│   └── sounds/                   # Audio files (if any)
│
├── scripts/                      # Build/dev scripts
│
├── docs/                         # Documentation
│   ├── design.md
│   └── architecture.md
│
├── biome.json                    # Linting/formatting config
├── tailwind.config.js
├── tsconfig.json
├── next.config.js
├── vercel.json
├── vitest.config.ts
└── package.json
```

## Configuration Files

### TypeScript (tsconfig.json)

Strict configuration matching visual-effect:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "esModuleInterop": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "noErrorTruncation": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Biome (biome.json)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.5/schema.json",
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "off" },
      "suspicious": { "noArrayIndexKey": "off", "noExplicitAny": "warn" },
      "style": { "noNonNullAssertion": "warn", "useNodejsImportProtocol": "error" },
      "complexity": { "useLiteralKeys": "error" },
      "a11y": {
        "noStaticElementInteractions": "off",
        "noSvgWithoutTitle": "off",
        "useKeyWithClickEvents": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "semicolons": "asNeeded",
      "quoteStyle": "double",
      "jsxQuoteStyle": "double",
      "trailingCommas": "all",
      "arrowParentheses": "asNeeded"
    }
  }
}
```

### Vitest (vitest.config.ts)

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
})
```

## Design Patterns

### 1. Component Architecture

Components organized by domain, not type:

```
components/
├── display/      # What the user sees (lyrics, karaoke view)
├── audio/        # Audio input/output (detection, metronome)
├── chords/       # Guitar-specific (diagrams, inline chords)
├── feedback/     # User feedback (notifications, alerts)
├── layout/       # App shell (header, nav, sidebar)
├── session/      # Multiplayer/social (queue, guests)
└── ui/           # Primitives (buttons, sliders, modals)
```

Top-level shared components (used across domains) live alongside folders.

### 2. State Management

**No external state management library** — each component/hook manages its own state:

```typescript
// Each domain object manages its own state internally
class LyricsPlayer {
  private listeners = new Set<() => void>()
  state: PlayerState = { type: "idle" }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach(l => l())
  }
}

// React components subscribe via useSyncExternalStore
function useLyricsState(player: LyricsPlayer) {
  return useSyncExternalStore(
    player.subscribe.bind(player),
    () => player.state
  )
}
```

Key principles:
- Each core class manages its own state
- React components subscribe via `useSyncExternalStore`
- Lightweight hooks handle UI-specific state
- No global state for playback/detection
- State persists across component re-renders

### 3. Animation System

Centralized animation config using Motion (Framer Motion successor):

```typescript
// src/animations.ts
export const defaultSpring = {
  type: "spring" as const,
  mass: 1,
  stiffness: 200,
  damping: 2 * Math.sqrt(200), // ≈ 28.28 (critical damping)
  bounce: 0,
}

export const springs = {
  default: { type: "spring", stiffness: 180, damping: 25, mass: 0.8 },
  bouncy: { type: "spring", bounce: 0.3, visualDuration: 0.5 },
  lyricHighlight: { type: "spring", stiffness: 260, damping: 18 },
}

export const timing = {
  fadeIn: { duration: 0.2 },
  scroll: { duration: 0.3, ease: [0.4, 0, 0.6, 1] },
}

export const colors = {
  highlight: "rgba(100, 200, 255, 0.3)",
  active: "rgba(255, 255, 255, 0.9)",
}
```

Usage:
- Spring animations for natural movement
- Hardware-accelerated transforms
- Different animations for different state transitions
- All tokens centralized in `animations.ts`

### 4. Sound System

Centralized audio using Tone.js singleton pattern:

```typescript
// src/sounds/SoundSystem.ts
class SoundSystem {
  private synthMetronome: Tone.PolySynth | null = null
  private initialized = false
  private muted = false

  private async ready(): Promise<boolean> {
    if (this.muted) return false
    await this.initialize()
    return true
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return
    await Tone.start()
    
    this.synthMetronome = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination()
    
    this.initialized = true
  }

  async playTick(accent: boolean) {
    if (!(await this.ready())) return
    const note = accent ? "C5" : "G4"
    this.synthMetronome?.triggerAttackRelease(note, "32n")
  }

  setMuted(muted: boolean) { this.muted = muted }
}

export const soundSystem = new SoundSystem()
```

Key principles:
- Singleton instance for shared state
- Lazy initialization (await `Tone.start()` on first use)
- Mute flag gates all playback
- Distinct sounds for different events
- User-friendly mute control

### 5. Theme Tokens

Minimal design tokens:

```typescript
// src/theme.ts
export const theme = {
  colors: {
    textPrimary: "#ffffff",
    textSecondary: "#a3a3a3",
    textMuted: "#525252",
  },
  spacing: {
    sm: 8,
  },
  radius: {
    md: 8,
  },
  shadow: {
    sm: "0 2px 4px rgba(0,0,0,0.4)",
  },
}
```

### 6. Custom Hooks Pattern

```typescript
// src/hooks/useVoiceDetection.ts
export interface UseVoiceDetectionOptions {
  threshold?: number
  onVoiceStart?: () => void
  deps?: DependencyList
}

export function useVoiceDetection(options: UseVoiceDetectionOptions = {}) {
  const { threshold = 0.5, onVoiceStart, deps = [] } = options
  
  const [isDetecting, setIsDetecting] = useState(false)
  const [confidence, setConfidence] = useState(0)
  
  // ... implementation
  
  return { isDetecting, confidence, start, stop }
}
```

### 7. Responsive Design

Mobile-first with Tailwind utilities:

```tsx
<div className="
  text-2xl md:text-4xl lg:text-5xl
  px-4 md:px-8
  flex flex-col md:flex-row
">
```

Key principles:
- Flex containers wrap naturally on small screens
- Sidebar collapses on narrow viewports
- Typography scales using relative units
- Large touch targets for finger taps

## API Design

### Internal API Routes

```
/api/lyrics/[songId]     # Fetch lyrics (proxy to avoid CORS)
/api/spotify/search      # Search songs
/api/spotify/track/[id]  # Get track metadata
/api/session/create      # Create jam session
/api/session/[id]/join   # Join session
/api/session/[id]/queue  # Manage song queue
```

### External Services

| Service | Purpose | Auth |
|---------|---------|------|
| Spotify | Song search, metadata, tempo | OAuth 2.0 |
| Musixmatch / Genius | Lyrics with timestamps | API Key |
| Ultimate Guitar | Chord charts | TBD |

## Development Workflow

### Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server
bun run build        # Production build
bun run typecheck    # TypeScript check
bun run lint         # Biome lint
bun run format       # Biome format
bun run test         # Run Vitest tests
bun run check        # lint + typecheck + test (pre-commit)
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "bun run lint && bun run typecheck && bun run test"
  }
}
```

## Best Practices

1. **Always memoize expensive computations** — Prevents recreation on every render
2. **Use `useSyncExternalStore`** — For subscribing to external state
3. **Keep core classes pure** — Side effects only where necessary
4. **Test on mobile** — Primary use case is phone on lap/music stand
5. **Follow the pattern** — Consistency makes the codebase maintainable
6. **Use proper accessibility** — ARIA labels, focus states, keyboard controls
7. **Optimize bundle size** — Lazy load routes, code split heavy components
8. **Path aliases** — Use `@/` for src imports

## Copy Style Guide

### Text and Descriptions

**Descriptions**: Use imperative mood, no ending punctuation
- ✅ "Detect voice and sync lyrics"
- ✅ "Display scrolling lyrics with chord diagrams"
- ❌ "Detects voice and syncs lyrics."
- ❌ "This displays scrolling lyrics"

**UI Text**: Sentence case for buttons/labels, action-oriented

**Error Messages**: Start with context, be specific, provide next steps

**Code Comments**: Present tense, focus on "why" not "what"

## Deployment

### Vercel Configuration

```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "SPOTIFY_CLIENT_ID": "@spotify-client-id",
    "SPOTIFY_CLIENT_SECRET": "@spotify-client-secret",
    "LYRICS_API_KEY": "@lyrics-api-key"
  }
}
```

- Automatic deployments on push to `main`
- Preview deployments for PRs
- Edge functions for API routes
- Environment variables via Vercel dashboard

## Database / Storage (TBD)

Options under consideration:

| Option | Pros | Cons |
|--------|------|------|
| **Vercel Postgres** | Integrated, serverless | Cost at scale |
| **PlanetScale** | MySQL, branching, generous free tier | External service |
| **Supabase** | Postgres + auth + realtime | More complex |
| **Upstash Redis** | Session storage, rate limiting | Not relational |

Likely: **Vercel Postgres** for user data + **Upstash Redis** for sessions/cache.
