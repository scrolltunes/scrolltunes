# Planning Mode

You are in PLANNING mode. Your job is to create a detailed implementation plan for the Spotify metadata enrichment feature.

## Phase 0: Orient

### 0a. Study specifications
Read all files in `specs/` directory using parallel subagents:
- `specs/001-rust-extraction-tool-enhancement.md`
- `specs/002-turso-schema-migration.md`
- `specs/003-search-api-turso-first.md`
- `specs/004-album-art-optimization.md`
- `specs/005-bpm-provider-refactor.md`
- `specs/006-documentation-cleanup.md`

### 0b. Study existing implementation
Use parallel subagents to analyze relevant source directories:
- `scripts/lrclib-extract/src/main.rs` - Rust extraction tool
- `src/services/turso.ts` - Turso service layer
- `src/app/api/search/route.ts` - Search API
- `src/lib/bpm/` - BPM providers
- `src/lib/deezer-client.ts` - Deezer integration

### 0c. Study the current plan
Read `IMPLEMENTATION_PLAN.md` for the overall structure.

### 0d. Study the original design doc
Read `docs/spotify-enrichment-plan.md` for complete context.

### 0e. Study project rules
Read `CLAUDE.md` for project conventions:
- Use bun exclusively (not npm/node)
- Effect.ts for async operations
- useSyncExternalStore with class-based stores
- `@/` import alias
- `bun run check` for validation

## Phase 1: Gap Analysis

Compare specs against current implementation:
- What changes are needed in the Rust extraction tool?
- What TypeScript interfaces need updating?
- What API routes need modification?
- What new files need to be created?

**CRITICAL**: Verify all assumptions by reading actual source files.

## Phase 2: Generate Plan

Update `IMPLEMENTATION_PLAN.md` with:
- Refined task breakdown for each phase
- Exact file paths and line numbers
- Code snippets for complex changes
- Dependencies between tasks
- Clear acceptance criteria

Priority guidelines:
- Phase 1 (Rust): Foundation, must complete first
- Phase 2 (Turso): Blocks all TypeScript work
- Phases 3-5: Can partially parallelize
- Phase 6 (Docs): Final cleanup

## Guardrails

999. NEVER implement code in planning mode
1000. Use up to 10 parallel subagents for analysis
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
- @docs/spotify-enrichment-plan.md
