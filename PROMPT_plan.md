# Planning Mode Prompt

You are implementing features based on specs in the `specs/` directory.

## Your Task

1. Read `IMPLEMENTATION_PLAN.md` to understand the overall plan
2. Find the next incomplete spec (Status: "Not Started" or "In Progress")
3. Read that spec file from `specs/`
4. Create a detailed implementation plan for JUST that spec
5. Update the spec status in `IMPLEMENTATION_PLAN.md` to "In Progress"
6. Write your plan to `CURRENT_PLAN.md`

## Planning Guidelines

- Break the spec into small, atomic tasks
- Each task should be independently testable
- Include file paths and line numbers where changes are needed
- Reference existing code patterns in the codebase
- Include validation steps after each task

## Directories to Explore

- `scripts/lrclib-extract/src/` - Rust source code
- `scripts/lrclib-extract/Cargo.toml` - Rust dependencies
- `docs/lrclib-enrichment-v2-spec.md` - Full specification

## Output Format

Write your plan to `CURRENT_PLAN.md` with this structure:

```markdown
# Current Plan: [Spec Name]

## Spec Reference
[Link to spec file]

## Tasks

### Task 1: [Name]
- File: [path]
- Changes: [description]
- Validation: [how to test]

### Task 2: [Name]
...

## Validation Command
[Command to validate all changes]
```

## Important

- Do NOT write code in planning mode
- Do NOT modify source files
- Only read files and create the plan
- Focus on ONE spec at a time
