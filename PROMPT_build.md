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
**IMPORTANT**: Check if ALL tasks in the plan are marked `[x]` (completed).

If ALL tasks are complete:
1. Run validation: `bun run check`
2. If validation fails, fix issues and retry
3. Check for uncommitted changes: `git status --porcelain`
4. If there are uncommitted changes:
   - Stage all changes: `git add -A`
   - Commit with message: `chore: final cleanup after completing all tasks`
5. Output the completion signal: **RALPH_COMPLETE**
6. Exit immediately

### 0d. Select task
If tasks remain, choose the highest priority incomplete task (first `[ ] Not started`).

## Phase 1: Implement

### 1a. Search first
**CRITICAL**: Search codebase to verify functionality doesn't already exist. Use up to 500 parallel subagents for searches and reads.

Key searches before implementing:
- Existing component with similar name
- Related functionality in adjacent files
- Store patterns in `src/core/`
- UI patterns in `src/components/ui/`
- Animation patterns in `src/animations.ts`

### 1b. Implement
Write the code for this ONE task. Follow project patterns:

```typescript
// Store pattern (useSyncExternalStore)
class SomeStore {
  private state: State = initialState
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  private notify() {
    for (const listener of this.listeners) listener()
  }
}

// Tagged events (Effect.ts)
export class SomeEvent extends Data.TaggedClass("SomeEvent")<{
  readonly value: string
}> {}

// Hook pattern
export function useSomeState(): State {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => DEFAULT_STATE,
  )
}
```

### 1c. Validate
Run validation command: `bun run check`

This runs: `biome lint . && bun run typecheck && bun run test`

Must pass before proceeding. If it fails, fix and retry.

## Phase 2: Update Plan

Mark the task complete in `IMPLEMENTATION_PLAN.md`:
- Change `[ ]` to `[x]`
- Move to Completed Tasks section with brief note
- Add any discovered tasks to Discovered Tasks section
- Note any relevant findings

## Phase 3: Commit

Create atomic commit:
```
feat(display): short description

Details if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
```

Scope suggestions: `display`, `core`, `hooks`, `settings`

## Guardrails

999. ONE task per iteration - do not batch
1000. Search before implementing - don't duplicate existing code
1001. Validation MUST pass before commit
1002. Only use 1 subagent for build/tests (bottleneck = backpressure)
1003. Up to 500 subagents for searches and reads

## Exit Conditions

**All Complete**: All tasks done, validation passes → Output `RALPH_COMPLETE` → Exit

**Success**: Task complete, tests pass, committed → Exit

**Blocked**: Document blocker in plan, commit plan update → Exit

## Context Files

- @CLAUDE.md
- @IMPLEMENTATION_PLAN.md
- @specs/*
