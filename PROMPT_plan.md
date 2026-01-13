# BPM Analytics Admin - Planning Mode

You are in PLANNING mode for the BPM Analytics Admin feature.

## Phase 0: Orient

### 0a. Study specifications
Read all files in `specs/` directory:
- `specs/bpm-analytics-schema.md`
- `specs/bpm-logging-helper.md`
- `specs/bpm-instrumentation.md`
- `specs/bpm-admin-dashboard.md`
- `specs/bpm-retention-cleanup.md`
- `specs/bpm-admin-tracks-browser.md`

### 0b. Study existing implementation
Analyze relevant source files:
- `src/lib/db/schema.ts` - Drizzle schema patterns
- `src/services/song-loader.ts` - Song loading and BPM fetch flow
- `src/services/bpm-providers.ts` - Current BPM provider structure
- `src/app/admin/page.tsx` - Admin auth pattern
- `src/app/api/admin/stats/route.ts` - Effect.ts API route pattern

### 0c. Study the current plan
Read `IMPLEMENTATION_PLAN.md` for the overall structure.

### 0d. Study the original design doc
Read `docs/bpm-analytics-admin.md` for complete context.

### 0e. Study project rules
Read `CLAUDE.md` for project conventions:
- Use bun exclusively (not npm/node)
- Effect.ts for async operations
- useSyncExternalStore with class-based stores
- `@/` import alias
- `bun run check` for validation

## Phase 1: Gap Analysis

Compare specs against current implementation:
- What changes are needed in the database schema?
- What TypeScript interfaces need creating?
- Where exactly should logging be added?
- What admin components need to be built?
- How should the tracks browser integrate with existing admin songs page?
- What API endpoints are needed for enrichment actions?

**CRITICAL**: Verify all assumptions by reading actual source files.

## Phase 2: Generate Plan

Update `IMPLEMENTATION_PLAN.md` with:
- Refined task breakdown for each phase
- Exact file paths and line numbers
- Code snippets for complex changes
- Dependencies between tasks
- Clear acceptance criteria

## Guardrails

999. NEVER implement code in planning mode
1000. Use parallel subagents for analysis
1001. Each task must be completable in ONE loop iteration
1002. Verify all file paths exist before referencing

## Exit

When plan is complete:
1. Commit updated `IMPLEMENTATION_PLAN.md`
2. Exit

## Context Files

- @CLAUDE.md
- @specs/*
- @IMPLEMENTATION_PLAN.md
- @docs/bpm-analytics-admin.md
