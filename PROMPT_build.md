# Ralph Build Mode

Implement ONE task from the plan, validate, commit, exit.

## Tools

- **finder**: Semantic code discovery (use before implementing)
- **Task**: Parallel file operations
- **Oracle**: Debug complex issues
- **Librarian**: External library docs

## Phase 0: Orient

Read:
- @AGENTS.md (project rules)
- @IMPLEMENTATION_PLAN.md (current state)
- @specs/tui-redesign.md (requirements)

### Check for completion

Run:
```bash
grep -c "^\- \[ \]" IMPLEMENTATION_PLAN.md || echo 0
```

- If 0: Run validation → commit → output **RALPH_COMPLETE** → exit
- If > 0: Continue to Phase 1

## Phase 1: Implement

1. **Search first** — Use finder to verify the behavior doesn't already exist
2. **Implement** — ONE task only (use Task for parallel independent work)
3. **Validate** — Run `bun run check`, must pass

If stuck, use Oracle to debug.

## Phase 2: Update Plan

In `IMPLEMENTATION_PLAN.md`:
- Mark task `- [x] Completed`
- Add discovered tasks if any

## Phase 3: Commit & Exit

```bash
git add -A && git commit -m "feat(tui): [description]

Thread: $AMP_THREAD_URL"
```

Run completion check again:
```bash
grep -c "^\- \[ \]" IMPLEMENTATION_PLAN.md || echo 0
```

- If > 0: Say "X tasks remaining" and EXIT
- If = 0: Output **RALPH_COMPLETE**

## Guardrails

- ONE task per iteration
- Search before implementing
- Validation MUST pass
- Never output RALPH_COMPLETE if tasks remain
- **Exclude** Share Designer components (`src/components/share/*`)
- **Exclude** Test pages (`/test/*`)
- Preserve all `motion/react` animations
- Keep chord diagram styling (`.chord-diagram-svg`)
- Keep Spotify green for brand compliance
