# Build Mode Prompt

You are in BUILDING mode. Implement ONE task from the plan, validate, commit, exit.

## Phase 0: Orient

### 0a. Study context
Read `CLAUDE.md` for project rules.

### 0b. Study the plan
Read `IMPLEMENTATION_PLAN_V3.md` and `CURRENT_PLAN.md` to understand current state.

### 0c. Check for completion
**IMPORTANT**: Check if ALL tasks in the plan are marked complete.

If ALL tasks are complete:
1. Run validation: `cd scripts/lrclib-extract && cargo test`
2. If validation fails, fix issues and retry
3. Check for uncommitted changes: `git status --porcelain`
4. If there are uncommitted changes:
   - Stage all changes: `git add -A`
   - Commit with message: `feat(lrclib-extract): complete enrichment v3 improvements`
5. Output the completion signal: **RALPH_COMPLETE**
6. Exit immediately

### 0d. Select task
If tasks remain, choose the next incomplete task in dependency order.

## Phase 1: Implement

### 1a. Read specs first
Read the relevant spec file for the current task from `specs/`:
- `spec-01-normalization-unification.md` - Single-source normalization
- `spec-02-topk-candidates.md` - Top-K candidates per key
- `spec-03-multi-artist-verification.md` - Multi-artist scoring
- `spec-04-pop0-fallback-fix.md` - Pop=0 fallback fix
- `spec-05-adaptive-duration.md` - Adaptive duration tolerance
- `spec-06-title-first-rescue.md` - Title-first rescue pass
- `spec-07-instrumentation.md` - Instrumentation & evaluation

### 1b. Study existing code
Read the source files relevant to the task:
- `scripts/lrclib-extract/src/main.rs` - Main extraction logic
- `scripts/lrclib-extract/src/bin/normalize-spotify.rs` - Normalization binary
- `scripts/lrclib-extract/Cargo.toml` - Dependencies
- `docs/lrclib-extraction-technical-report.md` - Current methodology

### 1c. Implement
Make the code changes for this ONE task. Follow Rust patterns:

For Rust code:
- Use `anyhow::Result` for error handling
- Use `FxHashMap`/`FxHashSet` for fast lookups
- Use `Lazy<Regex>` for static regex patterns
- Follow existing naming conventions
- Add `#[cfg(test)]` unit tests

### 1d. Validate
Run validation command: `cd scripts/lrclib-extract && cargo test`

Must pass before proceeding. If it fails, fix and retry.

## Phase 2: Update Plan

Mark the task complete in `IMPLEMENTATION_PLAN_V3.md`:
- Check the checkbox: `- [x]`
- Update status in tables
- Note any discoveries or deviations

## Phase 3: Commit

Create atomic commit with conventional commit format:
```
feat(lrclib-extract): short description

Details if needed.

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Guardrails

1. ONE task per iteration - do not batch
2. Read specs and source files before modifying
3. Validation MUST pass before commit
4. Keep existing functionality working
5. Add tests for new functions

## Exit Conditions

**All Complete**: All tasks done, validation passes → Output `RALPH_COMPLETE` → Exit

**Success**: Task complete, tests pass, committed → Exit

**Blocked**: Document blocker in plan, commit plan update → Exit

## Context Files

- @CLAUDE.md
- @IMPLEMENTATION_PLAN_V3.md
- @CURRENT_PLAN.md
- @specs/spec-01-normalization-unification.md
- @specs/spec-02-topk-candidates.md
- @specs/spec-03-multi-artist-verification.md
- @specs/spec-04-pop0-fallback-fix.md
- @specs/spec-05-adaptive-duration.md
- @specs/spec-06-title-first-rescue.md
- @specs/spec-07-instrumentation.md
- @docs/lrclib-extraction-technical-report.md
