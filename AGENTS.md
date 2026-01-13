# ScrollTunes

Live lyrics teleprompter for musicians. Detects singing voice and syncs scrolling lyrics.

**Domain:** https://scrolltunes.com

> **Keep this file lean.** No verbose examples, no TODO items, no feature status. Use `docs/` for detailed documentation and `TODO.md` for task tracking.

## Hard Requirements (Non-Negotiable)

1. **Use bun exclusively** — not `npm` or `node`
2. **Do not commit unless explicitly asked**
3. **Follow architectural patterns** — Effect.ts, useSyncExternalStore, tagged events
4. **No external state libraries** — Use `useSyncExternalStore` with class-based stores
5. **Effect.ts for async** — All async operations, error handling, side effects
6. **Type safety** — No `any` types, no `@ts-ignore`

**Use subagents for TODO items** to enable parallel execution.

## Commands

```bash
bun install          # Install deps
bun run dev          # Start dev server
bun run build        # Production build
bun run typecheck    # TypeScript check
bun run lint         # Biome lint
bun run test         # Run all tests
bun run check        # lint + typecheck + test
```

## Documentation

| Document | Purpose |
|----------|---------|
| **docs/architecture.md** | Tech stack, project structure, Effect.ts patterns |
| **docs/technical-reference.md** | LRC parsing, VAD, audio classification, search, caching, BPM |
| **TODO.md** | Implementation progress tracking |

**Domain-specific specs** (in `docs/`):
- `lrc-enhancement-system.md` — Word-level timing extraction from Guitar Pro
- `search-optimization-plan.md` — Turso-first search with embedded Spotify metadata
- `canonical-normalization.md` — Song deduplication and caching
- `audio-classification-design.md` — YAMNet singing vs instrument detection
- `sqlite-extraction-optimizations.md` — FTS5 and SQLite performance

## Code Style

- TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Biome: 2-space indent, double quotes, no semicolons, trailing commas
- Path alias: `@/*` → `src/*`
- Copy: imperative mood ("Detect voice"), no ending punctuation

## Key Patterns

### State Management
Use `useSyncExternalStore` with class-based stores. No Redux/Zustand.

### Effect.ts
- Use Effect for async work, parallelism, timeouts, retries, fallbacks, DI
- Dependencies via `Layer`, errors through Effect error channels
- Tagged events with `Data.TaggedClass`

### Core Stores
All in `@/core`: `LyricsPlayer`, `VoiceActivityStore`, `SingingDetectionService`, `AudioClassifierService`, `RecentSongsStore`, `AccountStore`, `FavoritesStore`, `SetlistsStore`, `PreferencesStore`, `ScoreBookStore`, `SongEditsStore`

### SoundSystem
Singleton at `@/sounds` owns AudioContext via Tone.js. Lazy init after user gesture.

### SongListItem
Always use `SongListItem` from `@/components/ui` when displaying songs in lists.

## Database

### Neon (Primary)
- HTTP driver — no transactions
- Use `db.batch()` for multiple updates

### Turso (LRCLIB Search Index)
- ~4.2M songs, FTS5 search
- **Spotify enrichment**: popularity, tempo, album art URLs (~80% match rate)
- **Always use MATCH queries**, never LIKE
- Turso-first search with popularity ranking

## Best Practices

1. Memoize effects
2. Use `for...of` not `forEach`
3. Test on mobile (primary use case)
4. Use `@/` imports
5. Enforce input limits via `src/constants/limits.ts`
6. ARIA labels for accessibility
