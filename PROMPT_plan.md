# Planning Mode

You are in PLANNING mode. Analyze specifications against existing code and generate a prioritized implementation plan.

## Phase 0: Orient

### 0a. Study specifications
Read all files in `specs/` directory using parallel subagents:
- `specs/effect-ts-compliance.md`

### 0b. Study existing implementation
Use parallel subagents to analyze relevant source directories:
- `src/core/` - Core stores (SetlistsStore, AccountStore, PreferencesStore, etc.)
- `src/lib/` - Library code (user-api.ts, vad-log.ts, colors.ts, api-effect.ts, errors.ts)
- `app/api/user/` - User API routes
- `app/api/admin/` - Admin API routes

### 0c. Study the current plan
Read `IMPLEMENTATION_PLAN.md` if it exists.

### 0d. Study reference implementations
Read these files for Effect.ts patterns to follow:
- `src/core/SingingDetectionService.ts` - Service layer pattern
- `src/lib/spotify-client.ts` - Retry and error handling
- `app/api/admin/chords/enhance/route.ts` - API route pattern
- `src/core/LyricsPlayer.ts` - Tagged events pattern

### 0e. Study project rules
Read `CLAUDE.md` for project conventions:
- Effect.ts for async
- useSyncExternalStore for state
- `@/` import alias
- `bun run check` for validation

## Phase 1: Gap Analysis

Compare specs against implementation:
- What's already implemented correctly with Effect.ts?
- What uses raw async/await that should use Effect?
- What has fire-and-forget `.catch(() => {})` patterns?
- What API routes use try/catch instead of Effect?

**CRITICAL**: Don't assume something isn't implemented. Search the codebase first. This is Ralph's Achilles' heel.

Use these search patterns:
- `Effect.gen` - Find files already using Effect
- `async function` - Find files using raw async
- `.catch(() =>` - Find fire-and-forget anti-patterns
- `try {` - Find try/catch blocks in API routes
- `Data.TaggedClass` - Find proper error definitions
- `Effect.runPromiseExit` - Find compliant API routes

## Phase 2: Generate Plan

Update `IMPLEMENTATION_PLAN.md` with:
- Tasks sorted by priority (P0 → P1 → P2)
- Clear descriptions with file locations and line numbers
- Dependencies noted where relevant
- Discoveries from gap analysis

Capture the WHY, not just the WHAT.

Priority guidelines:
- P0: Fire-and-forget fixes, centralized errors, critical store migrations
- P1: API route migrations
- P2: Documentation, cleanup, polish

## Guardrails

999. NEVER implement code in planning mode
1000. Use up to 10 parallel subagents for analysis
1001. Each task must be completable in ONE loop iteration
1002. Ultrathink before finalizing priorities

## Exit

When plan is complete:
1. Commit updated `IMPLEMENTATION_PLAN.md`
2. Exit

## Context Files

- @CLAUDE.md
- @specs/*
- @IMPLEMENTATION_PLAN.md
- @docs/architecture.md
