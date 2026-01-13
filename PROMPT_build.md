# BPM Analytics Admin - Build Mode

You are in BUILDING mode. Implement ONE task from the plan, validate, commit, exit.

## Phase 0: Orient

### 0a. Study context
Read `CLAUDE.md` for project rules:
- Use bun exclusively (not npm/node)
- Effect.ts for async operations
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
   - Commit with message: `feat: complete BPM analytics admin dashboard`
5. Output the completion signal: **RALPH_COMPLETE**
6. Exit immediately

### 0d. Select task
If tasks remain, choose the next incomplete task in dependency order.

## Phase 1: Implement

### 1a. Read specs first
Read the relevant spec file for the current task from `specs/`.

### 1b. Study existing code
Read the source files that need modification:
- `src/lib/db/schema.ts` - Drizzle schema
- `src/services/song-loader.ts` - Song loading
- `src/services/bpm-providers.ts` - BPM providers
- `src/services/turso.ts` - Turso service
- `src/app/admin/page.tsx` - Admin patterns
- `src/app/admin/songs/page.tsx` - Existing songs page (for Phase 5)
- `src/app/api/admin/stats/route.ts` - API patterns

### 1c. Implement
Make the code changes for this ONE task. Follow project patterns:

For Database:
- Use Drizzle's pgTable for schema
- Follow existing index patterns
- Export types with $inferSelect

For Logging:
- Fire-and-forget (don't await)
- Catch errors and log to console
- Truncate long strings

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
- Note any discoveries or deviations

## Phase 3: Commit

Create atomic commit with conventional commit format:
```
feat(bpm-analytics): short description

Details if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Guardrails

999. ONE task per iteration - do not batch
1000. Read specs and source files before modifying
1001. Validation MUST pass before commit
1002. Handle NULL values gracefully
1003. Maintain backwards compatibility

## Exit Conditions

**All Complete**: All tasks done, validation passes → Output `RALPH_COMPLETE` → Exit

**Success**: Task complete, tests pass, committed → Exit

**Blocked**: Document blocker in plan, commit plan update → Exit

## Context Files

- @CLAUDE.md
- @IMPLEMENTATION_PLAN.md
- @specs/*
- @docs/bpm-analytics-admin.md
