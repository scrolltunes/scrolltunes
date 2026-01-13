# Admin Catalog Redesign - Build Mode

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
   - Commit with message: `feat: complete admin catalog redesign`
5. Output the completion signal: **RALPH_COMPLETE**
6. Exit immediately

### 0d. Select task
If tasks remain, choose the next incomplete task in dependency order.

## Phase 1: Implement

### 1a. Read specs first
Read the relevant spec file for the current task from `specs/`:
- `admin-catalog-api.md` - Catalog API
- `admin-track-search.md` - Search endpoint
- `admin-add-to-catalog.md` - Add to catalog
- `admin-catalog-hook.md` - Hooks
- `admin-songs-page-redesign.md` - UI

### 1b. Study existing code
Read the source files relevant to the task:
- `src/lib/db/schema.ts` - Database schema
- `src/services/turso.ts` - Turso service
- `src/app/api/admin/` - Admin API patterns
- `src/hooks/useAdminTracks.ts` - Existing hook pattern
- `src/app/admin/songs/page.tsx` - Current page

### 1c. Implement
Make the code changes for this ONE task. Follow project patterns:

For API Routes:
- Use Effect.ts for async operations
- Follow existing admin auth pattern
- Add Cache-Control headers
- Handle errors with tagged classes

For Hooks:
- Use SWR with proper cache keys
- Match existing hook patterns
- Export types

For Components:
- Use CSS variables for styling
- Use motion for animations
- Use Phosphor icons
- Follow existing admin component patterns

### 1d. Validate
Run validation command: `bun run check`

This runs: `biome check . && bun run typecheck && bun run test`

Must pass before proceeding. If it fails, fix and retry.

## Phase 2: Update Plan

Mark the task complete in `IMPLEMENTATION_PLAN.md`:
- Check the checkbox: `- [x]`
- Update status in tables
- Note any discoveries or deviations

## Phase 3: Commit

Create atomic commit with conventional commit format:
```
feat(admin-catalog): short description

Details if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
```

Component examples:
- `feat(admin-catalog)` - Catalog API/hooks
- `feat(admin-search)` - Search endpoints
- `feat(admin-ui)` - UI components
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
- @specs/admin-catalog-api.md
- @specs/admin-track-search.md
- @specs/admin-add-to-catalog.md
- @specs/admin-catalog-hook.md
- @specs/admin-songs-page-redesign.md
