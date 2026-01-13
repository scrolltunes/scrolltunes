# BPM Admin Dashboard Spec

## Overview

Create an admin dashboard at `/admin/bpm-stats` showing BPM fetch analytics with summary cards, provider breakdown, time-series chart, and failure lists.

## Architectural Requirements

**This module MUST follow Effect.ts patterns as defined in `docs/architecture.md`.**

- API routes MUST use `Effect.runPromiseExit()` with pattern matching on exit
- Tagged error classes for all error types (auth, database, validation)
- Do NOT use `try/catch` with raw `await`
- Import shared errors from `@/lib/errors` (`AuthError`, `UnauthorizedError`, `DatabaseError`)
- Use `Effect.gen` for composing database queries

## Route

`/admin/bpm-stats`

## Authentication

- Require authenticated session via `auth()`
- Check `isAdmin` flag from `appUserProfiles` table
- Return 403 if not admin

## Dashboard Sections

### 1. Summary Cards

Four stat cards showing:

| Metric | Description |
|--------|-------------|
| Total Attempts (24h) | Count of all fetch attempts in last 24 hours |
| Success Rate | Percentage of successful attempts overall |
| Songs Without BPM | Count of songs in catalog with null BPM |
| Avg Latency | Average response time across all providers |

### 2. Provider Breakdown Table

Columns:
- Provider name
- Attempt count
- Success count
- Success rate (%)
- Avg latency (ms)

Sorted by attempt count descending.

### 3. Time-Series Chart

- X-axis: Date (last 30 days)
- Y-axis: Attempt count
- Stacked bars by provider
- Optional: success rate overlay line

Use `recharts` library (already in project).

### 4. Recent Failures List

Paginated list of last 50 failed attempts:
- Title + Artist
- Provider
- Error reason
- Timestamp

### 5. Songs Missing BPM

Tab options:
1. **Never had BPM**: Songs with null BPM in catalog
2. **All attempts failed**: Songs where every provider attempt failed
3. **Most problematic**: Songs with highest failed attempt count

Each shows: lrclibId, title, artist, failed attempts count

### 6. Error Reason Breakdown

Group by provider and error reason:
- Provider
- Error reason
- Count

## API Endpoints

Location: `src/app/api/admin/bpm-stats/route.ts`

### GET /api/admin/bpm-stats

Query params:
- `section`: `summary` | `providers` | `timeseries` | `failures` | `missing` | `errors`
- `period`: `24h` | `7d` | `30d` (default: `24h` for summary, `30d` for timeseries)
- `offset`: number (for pagination)
- `limit`: number (default: 50)
- `missingType`: `never` | `failed` | `problematic` (for missing section)

Response: JSON with requested data

## Components

Location: `src/components/admin/`

| Component | Purpose |
|-----------|---------|
| `BpmStatsCards.tsx` | Summary stat cards |
| `BpmProviderTable.tsx` | Provider breakdown table |
| `BpmTimeSeriesChart.tsx` | Recharts stacked bar chart |
| `BpmFailuresList.tsx` | Recent failures with pagination |
| `BpmMissingSongs.tsx` | Missing BPM songs with tabs |
| `BpmErrorBreakdown.tsx` | Error reason pivot table |
| `BpmSongDetail.tsx` | Modal for per-song drill-down |

## Styling

Follow existing admin patterns:
- CSS variables: `--color-surface1`, `--color-text`, `--color-accent`, etc.
- Motion animations with `springs.default`
- Responsive: mobile tabs, desktop sidebar
- Phosphor icons from `@phosphor-icons/react`

## Acceptance Criteria

- [ ] `/admin/bpm-stats` route created with admin auth check
- [ ] API route uses `Effect.runPromiseExit()` pattern
- [ ] Tagged error classes for auth/database errors
- [ ] Summary cards show 24h metrics
- [ ] Provider table shows breakdown with success rates
- [ ] Time-series chart renders 30 days of data
- [ ] Recent failures list with pagination
- [ ] Songs missing BPM with three view options
- [ ] Error breakdown by provider
- [ ] Click song to see all attempts (drill-down modal)
- [ ] Responsive design for mobile
- [ ] Loading skeletons during data fetch
- [ ] `bun run typecheck` passes
