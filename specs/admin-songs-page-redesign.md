# Spec: Admin Songs Page Redesign

## Overview

Redesign `/admin/songs` from Turso-first to Neon-first with integrated search.

## Why

Current page queries 4.2M Turso tracks (20+ second load). New design shows catalog tracks with usage metrics (fast) and provides search for finding new tracks.

## UI Design

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Admin                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Track Catalog                                               │
│  1,234 tracks in catalog                                     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔍 Search tracks or enter LRCLIB/Spotify ID...      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [All] [Missing BPM ⚠️] [Missing Enhancement] [No Spotify]   │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🎵 Song Title          │ Plays │ Users │ Last │ BPM │ E ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ⚠️ Track without BPM   │  150  │  42   │ 2h   │  -  │ ✓ ││
│  │    Artist Name         │       │       │      │     │   ││
│  ├─────────────────────────────────────────────────────────┤│
│  │    Track with BPM      │  120  │  38   │ 1d   │ 128 │ ✓ ││
│  │    Another Artist      │       │       │      │     │   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ← Prev  Page 1 of 25  Next →                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Modes

**Dashboard Mode** (default):
- Shows catalog tracks from Neon
- Sorted by total plays
- Filter chips for quick filtering
- Rows expandable for details

**Search Mode** (on typing):
- Activated when user types in search bar
- Shows Turso search results
- Results include "Add to catalog" action
- Returns to dashboard when search cleared

### Missing BPM Highlight

Tracks without BPM should visually stand out:
- Warning icon (⚠️) before title
- Subtle warning background color
- Filter chip shows count: "Missing BPM (42)"

### Row Expansion

When row clicked/expanded:
- Show full track details
- Show enhancement status
- Actions: View lyrics, Fetch BPM, Edit

### Search Input Behavior

1. User types in search bar
2. Debounce 300ms
3. Auto-detect query type:
   - `123456` → "Searching LRCLIB ID..."
   - `spotify:track:xxx` → "Searching Spotify..."
   - `song name` → "Searching..."
4. Show results below (replaces catalog list)
5. On result click → Add to catalog + show expanded
6. Clear search → Return to dashboard

## Implementation

### File

`src/app/admin/songs/page.tsx`

### State

```typescript
// Mode
const [mode, setMode] = useState<"dashboard" | "search">("dashboard")

// Search
const [searchInput, setSearchInput] = useState("")
const debouncedSearch = useDebounce(searchInput, 300)

// Catalog
const [filter, setFilter] = useState<CatalogFilter>("all")
const [offset, setOffset] = useState(0)

// Data
const catalogData = useAdminCatalog({ filter, offset })
const searchData = useAdminTrackSearch(debouncedSearch)

// Derived
const isSearchMode = searchInput.length > 0
```

### Components to Create

1. **CatalogTrackRow** - Row for catalog tracks
2. **SearchResultRow** - Row for search results
3. **CatalogFilters** - Filter chip bar with counts

### Columns

| Column | Width | Content |
|--------|-------|---------|
| Art | 48px | Album art (lazy loaded) |
| Title/Artist | flex | Title (bold), Artist (muted) |
| Plays | 80px | Total play count |
| Users | 60px | Unique users |
| Last | 80px | Relative time (2h, 1d) |
| BPM | 60px | BPM or "-" |
| E | 40px | Enhancement indicator |

## Dependencies

- `useAdminCatalog` hook
- `useAdminTrackSearch` hook (update existing)
- `useDebounce` hook (existing)
- Filter components (can reuse/adapt TracksFilterBar)

## Acceptance Criteria

- [ ] Dashboard loads in < 1 second
- [ ] Missing BPM tracks highlighted
- [ ] Filters work with counts
- [ ] Search activates on typing
- [ ] Search detects ID types
- [ ] Results can be added to catalog
- [ ] Clear search returns to dashboard
- [ ] Pagination works
- [ ] Mobile responsive
