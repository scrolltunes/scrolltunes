# Admin Catalog Redesign - Plan Mode

You are in PLANNING mode. Research and update the implementation plan.

## Phase 0: Orient

### 0a. Study context
Read `CLAUDE.md` for project rules:
- Use bun exclusively (not npm/node)
- Effect.ts for async operations
- No `any` types, no `@ts-ignore`
- Path alias: `@/*` → `src/*`

### 0b. Study the plan
Read `IMPLEMENTATION_PLAN.md` to understand current state.

### 0c. Study specs
Read specs in `specs/` for detailed requirements:
- `admin-catalog-api.md`
- `admin-track-search.md`
- `admin-add-to-catalog.md`
- `admin-catalog-hook.md`
- `admin-songs-page-redesign.md`

## Phase 1: Research

### 1a. Understand existing code
Study these directories and files:
- `src/app/api/admin/` - Existing admin API patterns
- `src/app/admin/songs/` - Current page implementation
- `src/lib/db/schema.ts` - Database schema (songs, song_lrclib_ids, user_song_items)
- `src/services/turso.ts` - Turso service patterns
- `src/hooks/` - Existing hook patterns

### 1b. Identify dependencies
For each task, identify:
- What tables/columns are needed
- What services are required
- What existing code can be reused

### 1c. Flag blockers
If you discover issues:
- Missing database columns
- Schema changes needed
- Unclear requirements

Document blockers in the plan and ask user for clarification.

## Phase 2: Update Plan

### 2a. Refine tasks
For each task in `IMPLEMENTATION_PLAN.md`:
- Add specific file paths
- Add code snippets where helpful
- Add acceptance criteria details
- Note any dependencies between tasks

### 2b. Mark discoveries
If you find:
- Existing code that can be reused → note it
- Schema changes needed → add as prerequisite task
- Edge cases → add to acceptance criteria

### 2c. Save changes
Update `IMPLEMENTATION_PLAN.md` with your findings.

## Exit Conditions

**Success**: Plan is refined, blockers documented → Exit

**Blocked**: Need user input → Document question and exit

## Context Files

- @CLAUDE.md
- @IMPLEMENTATION_PLAN.md
- @specs/admin-catalog-api.md
- @specs/admin-track-search.md
- @specs/admin-add-to-catalog.md
- @specs/admin-catalog-hook.md
- @specs/admin-songs-page-redesign.md
