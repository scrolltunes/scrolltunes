# Building Mode

You are in BUILDING mode. Implement ONE task from the plan, validate, commit, exit.

## Phase 0: Orient

### 0a. Study context
Read `CLAUDE.md` for project rules:
- Use bun exclusively (not npm/node)
- Effect.ts for async operations
- useSyncExternalStore with class-based stores
- No `any` types, no `@ts-ignore`
- Path alias: `@/*` → `src/*`

### 0b. Study the plan
Read `IMPLEMENTATION_PLAN.md` to understand current state.

### 0c. Check for completion
**IMPORTANT**: Check if ALL tasks in the plan are marked complete.

If ALL tasks are complete:
1. Run validation: `bun run check`
2. If validation fails, fix issues and retry
3. Check for uncommitted changes: `git status --porcelain`
4. If there are uncommitted changes:
   - Stage all changes: `git add -A`
   - Commit with message: `feat: complete Spotify metadata enrichment`
5. Output the completion signal: **RALPH_COMPLETE**
6. Exit immediately

### 0d. Select task
If tasks remain, choose the next incomplete task in dependency order.

## Phase 1: Implement

### 1a. Read specs first
Read the relevant spec file for the current task from `specs/`.

### 1b. Study existing code
Read the source files that need modification:

For Rust tasks:
- `scripts/lrclib-extract/src/main.rs`
- `scripts/lrclib-extract/Cargo.toml`

For TypeScript tasks:
- `src/services/turso.ts`
- `src/app/api/search/route.ts`
- `src/lib/search-api-types.ts`
- `src/lib/bpm/bpm-types.ts`
- `src/lib/deezer-client.ts`

### 1c. Implement
Make the code changes for this ONE task. Follow project patterns:

For Rust:
- Use `rusqlite` for SQLite operations
- Use `rayon` for parallel processing
- Use `HashMap` for lookups
- Follow existing normalization patterns

For TypeScript:
- Use Effect.ts for async operations
- Use proper null handling (nullable vs optional)
- Follow existing TursoService patterns
- Use `@/` import alias

### 1d. Validate
Run validation command: `bun run check`

This runs: `biome check . && bun run typecheck && bun run test`

For Rust changes, also run:
```bash
cd scripts/lrclib-extract && cargo build --release
```

Must pass before proceeding. If it fails, fix and retry.

## Phase 2: Update Plan

Mark the task complete in `IMPLEMENTATION_PLAN.md`:
- Update status in the specs table
- Note any discoveries or deviations

## Phase 3: Commit

Create atomic commit with conventional commit format:
```
feat(component): short description

Details if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
```

Component examples:
- `feat(extraction)` - Rust extraction tool
- `feat(turso)` - Turso schema/service
- `feat(search)` - Search API
- `feat(bpm)` - BPM resolution
- `docs` - Documentation updates

## Guardrails

999. ONE task per iteration - do not batch
1000. Read specs and source files before modifying
1001. Validation MUST pass before commit
1002. Handle NULL values gracefully
1003. Maintain backwards compatibility where possible

## Exit Conditions

**All Complete**: All tasks done, validation passes → Output `RALPH_COMPLETE` → Exit

**Success**: Task complete, tests pass, committed → Exit

**Blocked**: Document blocker in plan, commit plan update → Exit

## Context Files

- @CLAUDE.md
- @IMPLEMENTATION_PLAN.md
- @specs/*
- @docs/spotify-enrichment-plan.md
