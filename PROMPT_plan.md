# Planning Mode

You are in PLANNING mode. Analyze specifications against existing code and generate a prioritized implementation plan.

## Phase 0: Orient

### 0a. Study specifications
Read all files in `specs/` directory using parallel subagents:
- `specs/score-book-display.md`

### 0b. Study existing implementation
Use parallel subagents to analyze relevant source directories:
- `src/core/` - State management stores (LyricsPlayer, PreferencesStore patterns)
- `src/components/display/` - Current LyricsDisplay and LyricLine implementations
- `src/hooks/` - Existing hook patterns (useSwipe*, useDynamic*)
- `src/animations.ts` - Animation presets
- `src/app/song/[artistSlug]/[trackSlugWithId]/` - Song page integration point

### 0c. Study the current plan
Read `IMPLEMENTATION_PLAN.md` if it exists.

### 0d. Study project rules
Read `CLAUDE.md` for project conventions:
- Effect.ts for async
- useSyncExternalStore for state
- `@/` import alias
- `bun run check` for validation

## Phase 1: Gap Analysis

Compare specs against implementation:
- What's already implemented?
- What's missing?
- What's partially done?

**CRITICAL**: Don't assume something isn't implemented. Search the codebase first. This is Ralph's Achilles' heel.

Key things to search for:
- Existing ScoreBookStore or similar pagination store
- Display mode preferences in PreferencesStore
- Page-based display components
- Swipe gesture hooks
- Dynamic pagination logic

## Phase 2: Generate Plan

Update `IMPLEMENTATION_PLAN.md` with:
- Tasks sorted by priority (P0 → P1 → P2)
- Clear descriptions with file locations
- Dependencies noted where relevant
- Discoveries from gap analysis

Capture the WHY, not just the WHAT.

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
