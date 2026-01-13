# BPM Analytics Admin Implementation Plan

## Overview

Implement BPM fetch logging, admin dashboard for analytics, and a comprehensive tracks browser for manual enrichment.

## Validation Command

```bash
bun run check
```

This runs: `biome check . && bun run typecheck && bun run test`

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [bpm-analytics-schema](specs/bpm-analytics-schema.md) | Database schema and types | Pending |
| [bpm-logging-helper](specs/bpm-logging-helper.md) | Fire-and-forget logging function | Pending |
| [bpm-instrumentation](specs/bpm-instrumentation.md) | Instrument Turso and provider cascade | Pending |
| [bpm-admin-dashboard](specs/bpm-admin-dashboard.md) | Admin page with analytics | Pending |
| [bpm-retention-cleanup](specs/bpm-retention-cleanup.md) | 90-day log retention cron | Pending |
| [bpm-admin-tracks-browser](specs/bpm-admin-tracks-browser.md) | Full LRCLIB tracks browser with enrichment | Pending |

---

## Phase 1: Foundation (P0)

### Task 1.1: Database Schema

**Spec**: `specs/bpm-analytics-schema.md`
**Files**:
- `src/lib/db/schema.ts` - Add `bpmFetchLog` table
- `drizzle/migrations/NNNN_bpm_fetch_log.sql` - Create migration

**Steps**:
1. Add `bpmFetchLog` table definition to schema.ts
2. Add index definitions
3. Export `BpmFetchLog` and `NewBpmFetchLog` types
4. Create migration SQL file
5. Run `bun run db:push` to apply

**Acceptance Criteria**:
- [ ] `bpmFetchLog` table added to schema
- [ ] Migration file created
- [ ] Types exported
- [ ] `bun run typecheck` passes

---

### Task 1.2: Logging Types and Helper

**Spec**: `specs/bpm-logging-helper.md`
**Files**:
- `src/lib/bpm/bpm-log.ts` - Create new file

**Steps**:
1. Create `src/lib/bpm/bpm-log.ts`
2. Add type exports: `BpmProvider`, `BpmStage`, `BpmErrorReason`
3. Add `BpmLogEntry` interface
4. Implement `logBpmAttempt()` fire-and-forget function
5. Implement `mapErrorToReason()` helper

**Acceptance Criteria**:
- [ ] Types compile
- [ ] Function can be imported
- [ ] Fire-and-forget pattern works

---

## Phase 2: Instrumentation (P1)

### Task 2.1: Update Cascade Signature

**Spec**: `specs/bpm-instrumentation.md` (Part 1)
**Files**:
- `src/services/song-loader.ts` - Update function signature

**Steps**:
1. Update `fireAndForgetBpmFetch` signature to include `lrclibId`
2. Find all call sites and update with `lrclibId` parameter
3. Ensure `lrclibId` is available at call site

**Acceptance Criteria**:
- [ ] Signature updated
- [ ] Call sites updated
- [ ] `bun run typecheck` passes

---

### Task 2.2: Instrument Turso Lookup

**Spec**: `specs/bpm-instrumentation.md` (Part 2)
**Files**:
- `src/services/song-loader.ts` - Add logging around tempo check

**Steps**:
1. Import `logBpmAttempt` from `@/lib/bpm/bpm-log`
2. Add timing measurement around embedded tempo check
3. Log success case with BPM value
4. Log failure case with "not_found" reason

**Acceptance Criteria**:
- [ ] Turso lookup logs success/failure
- [ ] Latency captured
- [ ] Non-blocking

---

### Task 2.3: Instrument Provider Cascade

**Spec**: `specs/bpm-instrumentation.md` (Part 3)
**Files**:
- `src/services/bpm-providers.ts` - Wrap providers with logging

**Steps**:
1. Import logging types and functions
2. Create `wrapProviderWithLogging` function
3. Update cascade to wrap each provider category
4. Pass logging context through cascade

**Acceptance Criteria**:
- [ ] Each provider attempt logged
- [ ] Stages correctly tagged
- [ ] Errors captured

---

## Phase 3: BPM Analytics Dashboard (P2)

### Task 3.1: BPM Stats API Endpoints

**Spec**: `specs/bpm-admin-dashboard.md`
**Files**:
- `src/app/api/admin/bpm-stats/route.ts` - Create API route

**Steps**:
1. Create route file with auth check
2. Implement summary query
3. Implement provider breakdown query
4. Implement time-series query
5. Implement failures query
6. Implement missing songs queries
7. Implement error breakdown query

**Acceptance Criteria**:
- [ ] Route created with auth
- [ ] All queries return data
- [ ] Pagination works

---

### Task 3.2: Summary Cards Component

**Files**: `src/components/admin/BpmStatsCards.tsx`

**Acceptance Criteria**:
- [ ] 4 stat cards render
- [ ] Loading skeleton
- [ ] Styled with design tokens

---

### Task 3.3: Provider Table Component

**Files**: `src/components/admin/BpmProviderTable.tsx`

**Acceptance Criteria**:
- [ ] Table renders provider breakdown
- [ ] Sorted by attempts
- [ ] Shows success rate

---

### Task 3.4: Time-Series Chart Component

**Files**: `src/components/admin/BpmTimeSeriesChart.tsx`

**Acceptance Criteria**:
- [ ] Chart renders 30 days
- [ ] Stacked by provider
- [ ] Responsive

---

### Task 3.5: Failures List Component

**Files**: `src/components/admin/BpmFailuresList.tsx`

**Acceptance Criteria**:
- [ ] List renders recent failures
- [ ] Pagination works
- [ ] Empty state

---

### Task 3.6: Missing Songs Component

**Files**: `src/components/admin/BpmMissingSongs.tsx`

**Acceptance Criteria**:
- [ ] 3 tabs working
- [ ] Pagination per tab
- [ ] Click for detail

---

### Task 3.7: Error Breakdown Component

**Files**: `src/components/admin/BpmErrorBreakdown.tsx`

**Acceptance Criteria**:
- [ ] Pivot table renders
- [ ] Grouped by provider

---

### Task 3.8: Song Detail Drill-Down

**Files**: `src/components/admin/BpmSongDetail.tsx`

**Acceptance Criteria**:
- [ ] Modal opens on click
- [ ] Shows all attempts
- [ ] Close button works

---

### Task 3.9: Dashboard Page

**Files**: `src/app/admin/bpm-stats/page.tsx`

**Steps**:
1. Create page with auth check
2. Layout: header, cards, sections
3. Compose all components
4. Add navigation from main admin
5. Responsive layout

**Acceptance Criteria**:
- [ ] Page renders at /admin/bpm-stats
- [ ] All sections visible
- [ ] Mobile responsive

---

## Phase 4: Maintenance (P3)

### Task 4.1: Retention Cleanup Cron

**Spec**: `specs/bpm-retention-cleanup.md`
**Files**:
- `src/app/api/cron/cleanup-bpm-log/route.ts`
- `vercel.json`

**Steps**:
1. Create cron endpoint
2. Add CRON_SECRET auth check
3. Implement 90-day deletion
4. Add to vercel.json crons

**Acceptance Criteria**:
- [ ] Endpoint created
- [ ] Auth works
- [ ] Deletes old records
- [ ] Cron configured

---

## Phase 5: Admin Tracks Browser (P2)

**Spec**: `specs/bpm-admin-tracks-browser.md`

Replaces existing `/admin/songs` page with a comprehensive Turso tracks browser.

### Task 5.1: Tracks List API Endpoint

**Files**: `src/app/api/admin/tracks/route.ts`

**Steps**:
1. Create route with admin auth check
2. Query Turso tracks with FTS5 search
3. Apply filters: missing_spotify, has_spotify, in_catalog, missing_bpm
4. Join with Neon for catalog status
5. Implement pagination (50 per page)
6. Return `TrackWithEnrichment[]`

**Acceptance Criteria**:
- [ ] Returns paginated Turso tracks
- [ ] FTS5 search works
- [ ] Filters work correctly
- [ ] Includes Neon enrichment status

---

### Task 5.2: Copy Enrichment API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts`

**Steps**:
1. Create POST route with auth
2. Fetch track from Turso
3. If not in Neon, create new songs entry
4. Create songLrclibIds mapping
5. Copy: spotifyId, bpm (from tempo), musicalKey, albumArtUrl
6. Set bpmSource = "Turso"

**Acceptance Criteria**:
- [ ] Creates Neon entry if needed
- [ ] Copies all enrichment fields
- [ ] Returns songId

---

### Task 5.3: Spotify Search API Endpoint

**Files**: `src/app/api/admin/spotify/search/route.ts`

**Steps**:
1. Create GET route with auth
2. Accept query parameter
3. Call Spotify Search API
4. Return top 5 results with: id, name, artist, album, albumArt, duration, popularity

**Acceptance Criteria**:
- [ ] Searches Spotify API
- [ ] Returns formatted results
- [ ] Handles rate limits

---

### Task 5.4: Link Spotify API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/link-spotify/route.ts`

**Steps**:
1. Create POST route with auth
2. Accept spotifyId in body
3. Fetch audio features from Spotify
4. Create/update Neon song entry
5. Save: spotifyId, bpm, musicalKey, albumArtUrl
6. Set bpmSource = "Spotify"

**Acceptance Criteria**:
- [ ] Fetches Spotify audio features
- [ ] Creates Neon entry if needed
- [ ] Saves enrichment data

---

### Task 5.5: Fetch BPM API Endpoint

**Files**: `src/app/api/admin/tracks/[lrclibId]/fetch-bpm/route.ts`

**Steps**:
1. Create POST route with auth
2. Trigger BPM provider cascade synchronously
3. Return result with attempts array
4. If successful, save to Neon

**Acceptance Criteria**:
- [ ] Triggers provider cascade
- [ ] Returns attempts with success/failure
- [ ] Saves successful result

---

### Task 5.6: TracksFilterBar Component

**Files**: `src/components/admin/TracksFilterBar.tsx`

**Steps**:
1. Create filter chips: All, Missing Spotify, Has Spotify, In Catalog, Missing BPM
2. Active state styling
3. Emit filter change callback

**Acceptance Criteria**:
- [ ] Chips render and are clickable
- [ ] Active state visible
- [ ] Filter callback works

---

### Task 5.7: TracksList Component

**Files**: `src/components/admin/TracksList.tsx`

**Steps**:
1. Paginated table/list layout
2. Columns: Art, Title/Artist, Duration, BPM, Popularity, Status, Actions
3. Row expansion state management
4. Pagination controls

**Acceptance Criteria**:
- [ ] List renders with pagination
- [ ] Columns display correctly
- [ ] Expansion toggles work

---

### Task 5.8: TrackDetail Component

**Files**: `src/components/admin/TrackDetail.tsx`

**Steps**:
1. Inline expansion panel layout
2. Display Turso enrichment status
3. Display Neon enrichment status
4. Action buttons row

**Acceptance Criteria**:
- [ ] Shows all enrichment fields
- [ ] Status indicators (checkmarks/crosses)
- [ ] Actions visible

---

### Task 5.9: SpotifySearchModal Component

**Files**: `src/components/admin/SpotifySearchModal.tsx`

**Steps**:
1. Modal with search input (pre-filled)
2. Search results list
3. Match confidence indicator
4. Select action

**Acceptance Criteria**:
- [ ] Modal opens/closes
- [ ] Search calls API
- [ ] Results selectable
- [ ] Selection triggers link action

---

### Task 5.10: Enrichment Action Buttons

**Files**: `src/components/admin/EnrichmentActions.tsx`

**Steps**:
1. CopyFromTurso button (disabled if no Turso enrichment)
2. FindSpotifyId button (opens modal)
3. FetchBpm button (with loading state)
4. ManualBpm button (opens existing modal)

**Acceptance Criteria**:
- [ ] Buttons conditionally enabled
- [ ] Loading states
- [ ] Success/error feedback

---

### Task 5.11: Admin Tracks Page

**Files**: `src/app/admin/songs/page.tsx` (replace existing)

**Steps**:
1. Replace existing page with new implementation
2. Header with search box and sort dropdown
3. TracksFilterBar
4. TracksList with data fetching
5. Responsive layout

**Acceptance Criteria**:
- [ ] Page loads at /admin/songs
- [ ] Search, filters, sort work
- [ ] Pagination works
- [ ] Row expansion works
- [ ] All enrichment actions work
- [ ] Mobile responsive

---

## Verification Checklist

After implementation:

- [ ] `bun run typecheck` - No type errors
- [ ] `bun run lint` - No lint errors
- [ ] `bun run build` - Production build succeeds
- [ ] Load a song - BPM logs appear in database
- [ ] Visit /admin/bpm-stats - Dashboard loads with data
- [ ] Visit /admin/songs - Tracks browser loads from Turso
- [ ] Test enrichment actions: Copy, Find Spotify, Fetch BPM, Manual
- [ ] Mobile responsive on all pages

---

## File Reference

### Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/bpm/bpm-log.ts` | 1 | Logging types and helper |
| `drizzle/migrations/NNNN_bpm_fetch_log.sql` | 1 | Database migration |
| `src/app/api/admin/bpm-stats/route.ts` | 3 | BPM stats dashboard API |
| `src/components/admin/BpmStatsCards.tsx` | 3 | Summary cards |
| `src/components/admin/BpmProviderTable.tsx` | 3 | Provider breakdown |
| `src/components/admin/BpmTimeSeriesChart.tsx` | 3 | Time-series chart |
| `src/components/admin/BpmFailuresList.tsx` | 3 | Failures list |
| `src/components/admin/BpmMissingSongs.tsx` | 3 | Missing songs |
| `src/components/admin/BpmErrorBreakdown.tsx` | 3 | Error breakdown |
| `src/components/admin/BpmSongDetail.tsx` | 3 | Song detail modal |
| `src/app/admin/bpm-stats/page.tsx` | 3 | Dashboard page |
| `src/app/api/cron/cleanup-bpm-log/route.ts` | 4 | Retention cron |
| `src/app/api/admin/tracks/route.ts` | 5 | Tracks list API |
| `src/app/api/admin/tracks/[lrclibId]/copy-enrichment/route.ts` | 5 | Copy enrichment API |
| `src/app/api/admin/spotify/search/route.ts` | 5 | Spotify search API |
| `src/app/api/admin/tracks/[lrclibId]/link-spotify/route.ts` | 5 | Link Spotify API |
| `src/app/api/admin/tracks/[lrclibId]/fetch-bpm/route.ts` | 5 | Fetch BPM API |
| `src/components/admin/TracksFilterBar.tsx` | 5 | Filter chips |
| `src/components/admin/TracksList.tsx` | 5 | Paginated tracks list |
| `src/components/admin/TrackDetail.tsx` | 5 | Inline detail panel |
| `src/components/admin/SpotifySearchModal.tsx` | 5 | Spotify search modal |
| `src/components/admin/EnrichmentActions.tsx` | 5 | Action buttons |

### Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/lib/db/schema.ts` | 1 | Add `bpmFetchLog` table |
| `src/services/song-loader.ts` | 2 | Add logging, update signature |
| `src/services/bpm-providers.ts` | 2 | Wrap providers with logging |
| `vercel.json` | 4 | Add cron configuration |
| `src/app/admin/songs/page.tsx` | 5 | Replace with tracks browser |

---

## Critical Path

```
Phase 1 (Schema + Logging)
        │
        ▼
Phase 2 (Instrumentation)
        │
        ├─────────────────────────────┐
        ▼                             ▼
Phase 3 (BPM Dashboard)      Phase 5 (Tracks Browser)
        │                             │
        ▼                             │
Phase 4 (Cron)                        │
        │                             │
        └─────────────────────────────┘
                    │
                    ▼
               Complete
```

**Parallelization**: Phase 3 (Dashboard) and Phase 5 (Tracks Browser) can be worked in parallel after Phase 2.
