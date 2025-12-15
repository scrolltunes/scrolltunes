# ScrollTunes

Live lyrics teleprompter for musicians. Detects singing voice and syncs scrolling lyrics.

## Commands (use bun, not npm)

- `bun install` — install deps
- `bun run dev` — start Next.js dev server
- `bun run build` — production build
- `bun run typecheck` — TypeScript check
- `bun run lint` — Biome lint
- `bun run test` — run all tests
- `bun run test src/path/file.test.ts` — run single test file
- `bun run check` — lint + typecheck + test

## Documentation

- **docs/architecture.md** — Tech stack, project structure, design patterns, config files, API design
- **docs/design.md** — Features backlog, TODOs, product requirements, open questions

## Code Style

- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Biome for lint/format: 2-space indent, double quotes, no semicolons, trailing commas
- Path alias: `@/*` → `src/*`
- State: use `useSyncExternalStore` with class-based state, no Redux/Zustand
- Components: memoize effects, test on mobile, use ARIA labels
- Copy: imperative mood ("Detect voice"), no ending punctuation
