# ScrollTunes

Live lyrics teleprompter for musicians. Detects singing voice and syncs scrolling lyrics.

**Domain:** https://scrolltunes.com

**In this house, we use bun.** All package management and script execution should use `bun` commands, not `npm` or `node`.

**Do not commit unless explicitly asked.** Never run `git commit` or `git push` unless the user explicitly requests it. This is critical — no exceptions.

**Use subagents for TODO items.** When implementing TODO items (from TODO.md, Oracle plans, or any task list), always use the Task tool to spawn subagents for each independent task. This enables parallel execution and keeps the main thread focused on coordination.

## Commands

```bash
bun install                        # Install deps
bun run dev                        # Start Next.js dev server
bun run build                      # Production build
bun run typecheck                  # TypeScript check
bun run lint                       # Biome lint
bun run test                       # Run all tests
bun run test src/path/file.test.ts # Run single test file
bun run check                      # lint + typecheck + test
```

## Deployment

Vercel auto-deploys from git. Just commit and push — no manual deploy needed.

## Documentation

- **docs/architecture.md** — Tech stack, project structure, design patterns, config files, API design
- **docs/design.md** — Features backlog, TODOs, product requirements, open questions
- **docs/figma-workflow.md** — Design-to-code process, token pipeline, asset management
- **TODO.md** — Implementation progress tracking

## Code Style

- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`
- Biome for lint/format: 2-space indent, double quotes, no semicolons, trailing commas
- Path alias: `@/*` → `src/*`
- State: use `useSyncExternalStore` with class-based state, no Redux/Zustand
- Components: memoize effects, test on mobile, use ARIA labels
- Copy: imperative mood ("Detect voice"), no ending punctuation
- Prefer Effect.ts conventions over pure TypeScript patterns

## Core Concepts

### 1. LyricsPlayer

The `LyricsPlayer` class manages lyrics scrolling state using Effect.ts patterns with tagged events.

```typescript
import { lyricsPlayer, usePlayerState } from "@/core"

lyricsPlayer.load(lyrics, true) // autoPlay = true
const state = usePlayerState()
```

Key features:
- **State tracking**: idle → ready → playing → paused → completed
- **Observable hooks**: React components subscribe via `usePlayerState`, `useCurrentLineIndex`, `usePlayerControls`
- **Tagged events**: Effect.ts `Data.TaggedClass` for type-safe event dispatching
- **Effect caching**: Prevents re-execution of already completed effects
- **Time-based scrolling**: Internal animation loop with configurable scroll speed
- **Click-to-seek**: Jump to any line by clicking

### 2. VoiceActivityStore

The `VoiceActivityStore` handles voice activity detection (VAD) with hysteresis.

```typescript
import { voiceActivityStore, useVoiceActivity } from "@/core"

await voiceActivityStore.startListening()
const { isSpeaking, level } = useVoiceActivity()
```

Key features:
- **Real-time VAD**: Energy-based voice detection with smoothing
- **Hysteresis**: Separate on/off thresholds to prevent flickering
- **Configurable**: Adjustable thresholds, hold time, smoothing factor
- **Mic integration**: Uses SoundSystem for microphone access

### 3. SoundSystem

The `SoundSystem` is a singleton that owns the AudioContext via Tone.js.

```typescript
import { soundSystem } from "@/sounds"

await soundSystem.initialize()
await soundSystem.playClick()
const analyser = await soundSystem.getMicrophoneAnalyser()
```

Key features:
- **Lazy initialization**: Only initializes after user gesture
- **Single AudioContext**: All audio routes through one context
- **Mic access**: Provides AnalyserNode for voice detection
- **UI sounds**: Click, notification, success, metronome sounds
- **Mute control**: Global mute/unmute with user toggle

### 4. RecentSongsStore

The `RecentSongsStore` manages recent songs with localStorage persistence, server sync, and lyrics caching.

```typescript
import { recentSongsStore, useRecentSongs } from "@/core"

recentSongsStore.upsertRecent(song) // Adds to recents, syncs to server
const songs = useRecentSongs() // Subscribe to recent songs list
```

Key features:
- **localStorage persistence**: `scrolltunes:recents` for song list (max 5 songs)
- **Server sync**: Syncs to `/api/user/history` when authenticated
- **Lyrics caching**: `scrolltunes:lyrics:{id}` with 7-day TTL
- **Loading states**: `isLoading`, `isInitialized`, `expectedCount` for proper UI
- **useSyncExternalStore pattern**: Same as other stores

### 5. AccountStore

The `AccountStore` manages authentication state.

```typescript
import { accountStore, useAccount, useIsAuthenticated } from "@/core"

await accountStore.initialize() // Fetch user session
const isAuth = useIsAuthenticated() // Subscribe to auth state
```

### 6. FavoritesStore

The `FavoritesStore` manages favorite songs with localStorage and server sync.

```typescript
import { favoritesStore, useFavorites, useIsFavorite } from "@/core"

favoritesStore.toggle(song) // Toggle favorite status
const isFav = useIsFavorite(songId) // Check if song is favorited
```

### 7. SetlistsStore

The `SetlistsStore` manages user setlists (server-only, requires auth).

```typescript
import { setlistsStore, useSetlists } from "@/core"

await setlistsStore.fetchAll() // Load user's setlists
await setlistsStore.create("My Setlist") // Create new setlist
await setlistsStore.addSong(setlistId, song) // Add song to setlist
```

### 8. SongListItem Component

**Always use `SongListItem` when displaying a song in a list.** This component handles:
- Loading and displaying cached normalized titles from Spotify
- Album art loading with skeleton states
- Optional favorite button and remove button
- Optional entry/exit animations

```typescript
import { SongListItem } from "@/components/ui"

// Basic usage
<SongListItem
  id={song.id}
  title={song.title}
  artist={song.artist}
/>

// With favorite and remove buttons
<SongListItem
  id={song.id}
  title={song.title}
  artist={song.artist}
  albumArt={song.albumArt}
  showFavorite
  showRemove
  onRemove={(id, albumArt) => handleRemove(id)}
/>

// With animations (for lists with AnimatePresence)
<SongListItem
  id={song.id}
  title={song.title}
  artist={song.artist}
  animationIndex={index}
  animateExit
/>

// With custom action button
<SongListItem
  id={song.id}
  title={song.title}
  artist={song.artist}
  renderAction={({ albumArt }) => (
    <button onClick={() => doSomething(albumArt)}>Action</button>
  )}
/>
```

Key features:
- **Normalized titles**: Loads cached Spotify metadata for proper casing/formatting
- **Album art loading**: Fetches from cache or API, shows skeleton during load
- **Flexible actions**: `showFavorite`, `showRemove`, or custom `renderAction`
- **Animation support**: `animationIndex` for staggered entry, `animateExit` for exit animations

## Key Patterns

### 1. State Management with useSyncExternalStore

```typescript
class MyStore {
  private listeners = new Set<() => void>()
  private state: State = initialState

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  private notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export function useMyState() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
```

### 2. Effect.ts Tagged Events

```typescript
import { Data, Effect } from "effect"

export class Play extends Data.TaggedClass("Play")<object> {}
export class Seek extends Data.TaggedClass("Seek")<{ readonly time: number }> {}

readonly dispatch = (event: PlayerEvent): Effect.Effect<void> => {
  return Effect.sync(() => {
    switch (event._tag) {
      case "Play":
        this.handlePlay()
        break
      case "Seek":
        this.handleSeek(event.time)
        break
    }
  })
}
```

### 3. Effect Memoization in Components

```typescript
export function MyComponent() {
  const effect1 = useMemo(() => visualEffect("name", effect), [])
  
  const resultEffect = useMemo(() => {
    const composed = Effect.all([effect1.effect, effect2.effect])
    return new VisualEffect("result", composed, [effect1, effect2])
  }, [effect1, effect2])
}
```

### 4. Animation System

Uses Motion (Framer Motion successor) with centralized config:

```typescript
// src/animations.ts
export const springs = {
  default: { type: "spring", stiffness: 180, damping: 25, mass: 0.8 },
  scroll: { type: "spring", stiffness: 100, damping: 20, mass: 0.5 },
  lyricHighlight: { type: "spring", stiffness: 260, damping: 18 },
}
```

### 5. Sound System

Centralized Tone.js audio with singleton pattern:
- Lazy initialization (await user gesture)
- Shared reverb and volume processing
- Distinct synths for different sound types
- Mute flag gates all playback
- Sound triggers on state transitions

## File Structure

```
app/                         # Next.js App Router
├── layout.tsx              # Root layout
├── page.tsx                # Home page
├── globals.css             # Tailwind + global styles
└── favicon.ico

src/
├── animations.ts           # Motion spring/timing config
├── theme.ts                # Design tokens
├── components/
│   ├── display/            # Lyrics display components
│   ├── audio/              # Voice detection UI
│   ├── chords/             # Chord diagrams
│   ├── feedback/           # Notifications, toasts
│   ├── layout/             # Navigation, headers
│   ├── session/            # Jam session UI
│   └── ui/                 # Reusable primitives
├── constants/
│   └── index.ts            # App constants
├── core/
│   ├── LyricsPlayer.ts     # Lyrics state machine
│   ├── VoiceActivityStore.ts # VAD state
│   └── index.ts            # Exports
├── hooks/                  # Custom React hooks
├── lib/                    # Pure utilities
├── shared/                 # Shared helpers
├── sounds/
│   ├── SoundSystem.ts      # Tone.js singleton
│   └── index.ts
└── tokens/                 # Design tokens (Figma)
```

## Design Decisions

### 1. No External State Management
Each store manages its own state internally via `useSyncExternalStore`. No Redux, Zustand, or other state libraries.

### 2. Effect-First Design
Use Effect.ts patterns throughout. Tagged events and Effect patterns provide compile-time safety for state transitions.

### 3. Mobile-First
Primary use case is phone on music stand/lap. All features must work hands-free. Large touch targets for musicians with occupied hands.

### 4. Single Audio Owner
SoundSystem owns the AudioContext. VAD uses its analyser, not a separate context.

### 5. Type Safety
Strict TypeScript configuration:
- `noUncheckedIndexedAccess` for array safety
- `exactOptionalPropertyTypes` for precise optionals
- `isolatedModules` for Next.js compatibility
- Effect language service for enhanced checking

### 6. Neon Database
Using Neon with the HTTP driver (neon-http). Key constraints:
- **No transactions** — The HTTP driver doesn't support `db.transaction()`
- **Use `db.batch()` for multiple updates** — Sends all queries in one HTTP request

```typescript
// DON'T: Individual updates (N requests)
await Promise.all(items.map(item => db.update(table).set(...).where(...)))

// DO: Batch updates (1 request)
const updates = items.map(item => db.update(table).set(...).where(...))
if (updates.length > 0) {
  const [first, ...rest] = updates
  await db.batch([first, ...rest])
}
```

## Best Practices

1. **Always memoize effects** — Prevents recreation on every render
2. **Use `for...of` not `forEach`** — Biome lint rule for performance
3. **Keep stores low-frequency** — Don't push per-frame audio into React state
4. **Test on mobile** — Primary use case is phone/tablet
5. **Follow the pattern** — Consistency makes the codebase maintainable
6. **Use proper accessibility** — ARIA labels, focus states, keyboard controls
7. **Use `@/` imports** — Path alias for src/
8. **Enforce input limits** — All text inputs need `maxLength`; validate server-side too

### Input Limits

When adding new text inputs (name fields, descriptions, search boxes, etc.):

1. Add the limit to `src/constants/limits.ts`
2. Add `maxLength={INPUT_LIMITS.YOUR_FIELD}` to the input element
3. Add server-side validation in the API route handler

```typescript
import { INPUT_LIMITS } from "@/constants/limits"

// In component
<input maxLength={INPUT_LIMITS.SETLIST_NAME} />

// In API route
if (name.length > INPUT_LIMITS.SETLIST_NAME) {
  return NextResponse.json({ error: "Name too long" }, { status: 400 })
}
```

## Copy Style Guide

**Descriptions:**
- Use imperative mood (e.g., "Detect", "Scroll", "Sync")
- No ending punctuation
- Start with action verbs

**UI Text:**
- Sentence case for buttons and labels
- Keep instructions clear and action-oriented
- No exclamation marks

**Code Comments:**
- Use present tense for describing what code does
- Keep comments focused on the "why"
