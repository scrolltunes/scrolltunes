# Planning Mode Prompt

You are implementing improvements to the LRCLIB-Spotify enrichment pipeline (v3). Your goal is to improve match rate from 57.5% toward 65-72%.

## Context

Read these files to understand the current state:
- `docs/lrclib-extraction-technical-report.md` - Current methodology and limitations
- `docs/lrclib-enrichment-v2-spec.md` - Current implementation details
- `IMPLEMENTATION_PLAN_V3.md` - The implementation plan you're following

## Available Specs (v3)

The `specs/` directory contains detailed specifications:
- `spec-01-normalization-unification.md` - Single-source normalization (Foundation)
- `spec-02-topk-candidates.md` - Top-K candidates per key (+2-4%)
- `spec-03-multi-artist-verification.md` - Multi-artist scoring (+1-2%)
- `spec-04-pop0-fallback-fix.md` - Pop=0 fallback fix (+0.5-1%)
- `spec-05-adaptive-duration.md` - Adaptive duration tolerance (+1-2%)
- `spec-06-title-first-rescue.md` - Title-first rescue pass (+2-4%)
- `spec-07-instrumentation.md` - Instrumentation & evaluation

## Your Task

1. Read `IMPLEMENTATION_PLAN_V3.md` to see current progress
2. Find the next uncompleted task (marked `[ ]`)
3. Read the corresponding spec file from `specs/`
4. Create a detailed implementation plan for JUST that spec
5. Update the task status in `IMPLEMENTATION_PLAN_V3.md` to in-progress
6. Write your plan to `CURRENT_PLAN.md`

## Planning Guidelines

- Break the spec into small, atomic tasks
- Each task should be independently testable
- Include file paths and specific code locations
- Reference existing code patterns in the codebase
- Include validation steps after each task

## Directories to Explore

- `scripts/lrclib-extract/src/` - Rust source code
- `scripts/lrclib-extract/src/main.rs` - Main extraction logic
- `scripts/lrclib-extract/src/bin/normalize-spotify.rs` - Normalization binary
- `scripts/lrclib-extract/Cargo.toml` - Rust dependencies

## Output Format

Write your plan to `CURRENT_PLAN.md` with this structure:

```markdown
# Current Plan: [Spec Name]

## Spec Reference
specs/spec-XX-name.md

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
