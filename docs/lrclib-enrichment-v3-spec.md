# LRCLIB-Spotify Enrichment v3 Specification

> Canonical Spotify metadata for display, LRCLIB for lyrics matching

**Status:** Draft (Enhanced)
**Date:** January 16, 2026

---

## Overview

v3 changes the enriched output to use **Spotify's canonical names** for display (track title, artist, album) while preserving LRCLIB metadata for lyrics matching. This fixes data quality issues like "Queen Of The Stone Age" (typo in LRCLIB) displaying instead of Spotify's correct "Queens of the Stone Age".

### Design Principle

| Data Source | Purpose |
|-------------|---------|
| **Spotify** | Canonical display names (title, artist, album) |
| **LRCLIB** | Lyrics content, normalized keys for matching |

### Key Invariants

1. **Matched tracks** (`spotify_id IS NOT NULL`):
   - `title`, `artist`, `album` = Spotify canonical values
   - `lrclib_title`, `lrclib_artist`, `lrclib_album` = original LRCLIB values (never NULL for title/artist)
   - `artist` = display string derived from `spotify_artists_json`

2. **Unmatched tracks** (`spotify_id IS NULL`):
   - `title = lrclib_title`, `artist = lrclib_artist`, `album = lrclib_album`
   - `spotify_artists_json` = NULL

---

## Problem Statement

### Current Behavior (v2)

The enriched database stores LRCLIB's `title`, `artist`, `album` for display:

```sql
SELECT title, artist FROM tracks WHERE spotify_id = '6y20BV5L33R8YXM0YuI38N';
-- Result: "No One Knows" | "Queen Of The Stone Age"  (typo!)
```

Despite matching to the correct Spotify track, the UI shows LRCLIB's error-prone metadata.

### Root Cause

1. LRCLIB is user-submitted data with inconsistent quality
2. Enrichment matches correctly to Spotify but only stores `spotify_id`
3. Spotify's canonical track/artist/album names are available during matching but **not persisted**

### Examples of LRCLIB Data Quality Issues

| LRCLIB Artist | Spotify Artist (Correct) |
|---------------|--------------------------|
| Queen Of The Stone Age | Queens of the Stone Age |
| Beatles, The | The Beatles |
| Guns 'N Roses | Guns N' Roses |
| AC DC | AC/DC |

---

## v3 Solution

### Schema Changes

Add columns to store both canonical Spotify names and original LRCLIB names:

```sql
CREATE TABLE tracks (
    -- Identifiers
    id INTEGER PRIMARY KEY,           -- LRCLIB track ID
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,         -- Normalized for matching
    artist_norm TEXT NOT NULL,        -- Normalized for matching
    quality INTEGER NOT NULL,         -- LRCLIB quality score

    -- Display names (Spotify canonical when matched, LRCLIB fallback)
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,

    -- Source LRCLIB names (preserved for auditing/debugging)
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,

    -- Spotify enrichment
    spotify_id TEXT,
    spotify_artists_json TEXT,        -- JSON array: ["Artist1", "Artist2"] (robust to commas in names)
    popularity INTEGER,
    tempo REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    isrc TEXT,
    album_image_url TEXT
);

CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);
```

**Note:** `spotify_artists_json` uses JSON array format instead of comma-separated to handle artist names containing commas (rare but possible). The `artist` column is derived as `artists.join(", ")` for display.

### Display Logic

```
IF spotify_id IS NOT NULL:
    title  = Spotify track name
    artist = Spotify artists (comma-joined)
    album  = Spotify album name
ELSE:
    title  = LRCLIB title (fallback)
    artist = LRCLIB artist (fallback)
    album  = LRCLIB album (fallback)
```

### Multi-Artist Format

All credited Spotify artists stored as JSON array, displayed as comma-joined:

| spotify_artists_json | artist (display) |
|----------------------|------------------|
| `["Stephen Sanchez", "Laufey"]` | "Stephen Sanchez, Laufey" |
| `["Queens of the Stone Age"]` | "Queens of the Stone Age" |
| `["Post Malone", "Morgan Wallen"]` | "Post Malone, Morgan Wallen" |

**Artist Ordering:** Artists must be fetched in Spotify's credited order (not `MIN(artist_rowid)`). Use `ORDER BY ta.rowid` or a position column if available.

---

## Data Flow

### Current (v2)

```
LRCLIB track
    ↓ normalize
    ↓ match to Spotify (get spotify_id)
    ↓ fetch audio features
OUTPUT: LRCLIB title/artist/album + spotify_id + audio features
```

### Proposed (v3)

```
LRCLIB track
    ↓ normalize
    ↓ match to Spotify (get spotify_id)
    ↓ fetch Spotify canonical names (title, artists, album)
    ↓ fetch audio features
OUTPUT: Spotify title/artist/album + lrclib_* + spotify_id + audio features
```

---

## Implementation Details

### 1. Fetch Album Name from Spotify

**Current query** (batch_fetch_track_details):
```sql
SELECT t.rowid, t.id, t.name, a.name as artist_name,
       t.duration_ms, t.popularity, t.external_id_isrc,
       t.album_rowid, al.album_type
FROM tracks t
JOIN artists a ON a.rowid = (
    SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
)
LEFT JOIN albums al ON al.rowid = t.album_rowid
WHERE t.rowid IN (...)
```

**v3 query** (add album name, fix artist ordering):
```sql
SELECT t.rowid, t.id, t.name,
       t.duration_ms, t.popularity, t.external_id_isrc,
       t.album_rowid, al.album_type,
       al.name as album_name  -- NEW: Spotify canonical album name
FROM tracks t
LEFT JOIN albums al ON al.rowid = t.album_rowid
WHERE t.rowid IN (...)
```

**Separate query for ordered artists** (all credited artists in correct order):
```sql
SELECT ta.track_rowid, a.name
FROM track_artists ta
JOIN artists a ON a.rowid = ta.artist_rowid
WHERE ta.track_rowid IN (...)
ORDER BY ta.track_rowid, ta.rowid  -- Preserves Spotify credited order
```

This fetches all artists per track in credited order, avoiding `MIN(artist_rowid)` which doesn't guarantee correct ordering.

### 2. SpotifyTrack Struct

```rust
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,              // Track name (canonical)
    pub artist: String,            // Primary artist (canonical)
    pub artists: Vec<String>,      // All credited artists
    pub album_name: Option<String>,// Album name (canonical) -- NEW
    pub duration_ms: i64,
    pub popularity: i32,
    pub isrc: Option<String>,
    pub album_rowid: i64,
    pub album_type: SpotifyAlbumType,
}
```

### 3. EnrichedTrack Struct

```rust
struct EnrichedTrack {
    // Identifiers
    lrclib_id: i64,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,

    // Display names (Spotify canonical or LRCLIB fallback)
    // NOTE: These are "display_*" semantically, keeping DB column names for compatibility
    title: String,        // Spotify track name when matched, else lrclib_title
    artist: String,       // Spotify artists.join(", ") when matched, else lrclib_artist
    album: Option<String>,// Spotify album name when matched, else lrclib_album

    // Source LRCLIB (preserved for auditing/debugging/lyrics matching)
    lrclib_title: String,
    lrclib_artist: String,
    lrclib_album: Option<String>,

    // Spotify enrichment
    spotify_id: Option<String>,
    spotify_artists_json: Option<String>, // JSON array: ["Artist1", "Artist2"]
    popularity: Option<i32>,
    tempo: Option<f64>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>,
}
```

**Semantic Note:** The `title`, `artist`, `album` fields are conceptually "display" fields. In Rust code, consider aliasing or documenting that these are NOT the LRCLIB source-of-truth (which are `lrclib_*` fields).

### 4. Selection Logic

In `select_canonical_and_enrich()`:

```rust
// When Spotify match exists:
EnrichedTrack {
    // Display names = Spotify canonical
    title: spotify.name.clone(),
    artist: spotify.artists.join(", "),
    album: spotify.album_name.clone(),

    // Preserve LRCLIB originals
    lrclib_title: lrclib_variant.track.title.clone(),
    lrclib_artist: lrclib_variant.track.artist.clone(),
    lrclib_album: lrclib_variant.track.album.clone(),

    // Store artists as JSON for robust storage
    spotify_artists_json: Some(serde_json::to_string(&spotify.artists).unwrap()),
    // ... other fields
}

// When NO Spotify match:
EnrichedTrack {
    // Display names = LRCLIB (fallback)
    title: lrclib_variant.track.title.clone(),
    artist: lrclib_variant.track.artist.clone(),
    album: lrclib_variant.track.album.clone(),
    
    // Invariant: lrclib_* fields equal display fields when unmatched
    lrclib_title: lrclib_variant.track.title.clone(),
    lrclib_artist: lrclib_variant.track.artist.clone(),
    lrclib_album: lrclib_variant.track.album.clone(),
    
    spotify_id: None,
    spotify_artists_json: None,
    // ... other Spotify fields as None
}
```

---

## Output Schema (v3)

```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL,

    -- Display (Spotify canonical or LRCLIB fallback)
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,

    -- LRCLIB source (preserved for auditing/debugging)
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,

    -- Spotify enrichment
    spotify_id TEXT,
    spotify_artists_json TEXT,  -- JSON array: ["Artist1", "Artist2"]
    popularity INTEGER,
    tempo REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    isrc TEXT,
    album_image_url TEXT
);

CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);
CREATE INDEX idx_tracks_popularity ON tracks(popularity DESC) WHERE popularity IS NOT NULL;

-- FTS indexes remain unchanged (use title, artist columns - now with canonical names!)
CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist, content='tracks', content_rowid='id', tokenize='porter'
);

-- Search surface remains unchanged (uses title, artist columns)
CREATE TABLE tracks_search (...);
CREATE VIRTUAL TABLE tracks_search_fts USING fts5(...);
```

---

## Migration Strategy

### Option A: Full Re-extraction (Recommended)

1. Update Rust code with schema changes
2. `cargo build --release`
3. Run extraction: `./target/release/lrclib-extract run --log-only`
4. Verify output
5. Deploy to Turso

**Pros:** Clean, consistent output
**Cons:** ~40-50 min extraction time

### Option B: Post-processing Update

1. Keep existing enriched DB
2. Write script to:
   - For each row with `spotify_id`, lookup Spotify canonical names
   - Add `lrclib_*` columns with current `title`/`artist`/`album`
   - Update `title`/`artist`/`album` with Spotify names

**Pros:** Faster if only updating names
**Cons:** More complex, requires additional queries

**Recommendation:** Option A (full re-extraction)

---

## Verification Checklist

### 1. Schema Verification
```sql
.schema tracks
-- Verify: lrclib_title, lrclib_artist, lrclib_album, spotify_artists_json columns exist
```

### 2. Typo Fix Verification (QOTSA)
```sql
SELECT title, artist, lrclib_title, lrclib_artist, spotify_id
FROM tracks
WHERE lrclib_artist = 'Queen Of The Stone Age';
```
**Expected:**
| title | artist | lrclib_artist | spotify_id |
|-------|--------|---------------|------------|
| No One Knows | Queens of the Stone Age | Queen Of The Stone Age | 6y20... |

### 3. Fallback Verification (unmatched tracks)
```sql
SELECT title, lrclib_title, (title = lrclib_title) as uses_fallback
FROM tracks
WHERE spotify_id IS NULL
LIMIT 10;
```
**Expected:** All rows have `uses_fallback = 1`

### 4. Invariant Check: Matched rows have lrclib_* populated
```sql
SELECT COUNT(*) as violations
FROM tracks
WHERE spotify_id IS NOT NULL
  AND (lrclib_title IS NULL OR lrclib_artist IS NULL);
```
**Expected:** `violations = 0`

### 5. Invariant Check: Unmatched rows have display = lrclib
```sql
SELECT COUNT(*) as violations
FROM tracks
WHERE spotify_id IS NULL
  AND (title != lrclib_title OR artist != lrclib_artist);
```
**Expected:** `violations = 0`

### 6. Multi-Artist Verification (JSON format)
```sql
SELECT title, artist, spotify_artists_json
FROM tracks
WHERE json_array_length(spotify_artists_json) > 1
ORDER BY popularity DESC
LIMIT 10;
```
**Expected:** `spotify_artists_json` contains JSON array, `artist` is comma-joined display string

### 7. Multi-Artist Ordering Verification
Pick a known multi-artist track and verify credited order matches Spotify:
```sql
SELECT title, artist, spotify_artists_json
FROM tracks
WHERE spotify_id = '3KkXRkHbMCARz0aVfEt68P';  -- Example: a known collab
```
**Expected:** Artists in correct Spotify credited order

### 8. FTS Search Quality
```sql
SELECT title, artist, popularity
FROM tracks_search_fts fts
JOIN tracks_search ts ON fts.rowid = ts.search_id
WHERE tracks_search_fts MATCH 'queens stone age'
ORDER BY fts.rowid ASC
LIMIT 5;
```
**Expected:** Results show correct "Queens of the Stone Age"

### 9. Album Name Verification
```sql
SELECT title, artist, album, lrclib_album
FROM tracks
WHERE spotify_id IS NOT NULL AND album IS NOT NULL
ORDER BY popularity DESC
LIMIT 10;
```
**Expected:** Album names are Spotify canonical

---

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/lrclib-extract/src/main.rs` | SpotifyTrack, EnrichedTrack, SQL queries, CREATE TABLE, INSERT |
| `docs/lrclib-enrichment-v2-spec.md` | Archive or update with v3 reference |

---

## Compatibility Notes

### Breaking Changes
- New columns: `lrclib_title`, `lrclib_artist`, `lrclib_album`, `spotify_artists_json`
- Column semantics changed: `title`, `artist`, `album` now contain Spotify data when matched
- `spotify_artists_json` is JSON array format (not comma-separated)

### Non-Breaking
- Existing queries reading `title`, `artist`, `album` will get **better** data
- FTS indexes automatically use canonical names
- `spotify_id` column unchanged

### Frontend Impact
- `TursoSearchResult` interface may optionally add `lrclibTitle`, `lrclibArtist` fields
- No required changes - existing `title`/`artist`/`album` fields work as before

---

## Pop0 Optimization (v3 Performance Fix)

### Problem Statement

The pop0 fallback matching phase takes 60+ minutes due to expensive cross-DB queries for artist data.

**Root causes:**

| Issue | Current State | Impact |
|-------|---------------|--------|
| Artist fetch bottleneck | 13M+ separate lookups | 30+ min just for artist data |
| Cross-DB queries | spotify_clean.sqlite3 accessed per-candidate | I/O bound |
| Join amplification | Stores track-artist rows | 180M vs 131M tracks |

**Key numbers:**
- Total Spotify tracks: 256M
- Pop>=1 tracks: 45M (in `track_norm`, 56M rows after join)
- Pop=0 tracks: ~100M
- Unmatched LRCLIB groups: ~1.1M (31% of 3.6M)
- Pop0 matches found: ~95K (0.26% yield on 13M candidates)

### Solution: Pre-Joined Pop0 Table

The key insight: **pre-join all artist and album data during normalization** so extraction doesn't need cross-DB queries.

#### Architecture

```
normalize-spotify (one-time, per Spotify update):
    Build pop0_tracks with ALL data pre-joined:
    - artists (as JSON array)
    - album name and type
    - track ID and ISRC

extraction (runs frequently):
    Query pop0_tracks directly → all data available
    No cross-DB lookups needed
```

#### Two-Path Implementation

The extraction code auto-detects which table exists:

```rust
fn match_pop0_indexed(...) {
    if has_table("pop0_tracks") {
        // Fast path: pre-joined data
        return match_pop0_enriched(...);
    }
    // Legacy fallback: separate artist fetches
    return match_pop0_legacy(...);
}
```

---

### Fast Path: `pop0_tracks` Table (Pre-Joined)

#### Schema

```sql
CREATE TABLE pop0_tracks (
    track_rowid INTEGER PRIMARY KEY,
    title_norm TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    track_name TEXT NOT NULL,
    track_id TEXT NOT NULL,           -- Spotify external ID
    isrc TEXT,                         -- ISRC code
    artists_json TEXT NOT NULL,        -- JSON array: ["Artist1", "Artist2"]
    album_rowid INTEGER NOT NULL,
    album_name TEXT,
    album_type INTEGER NOT NULL        -- 0=album, 1=single, 2=compilation, 3=unknown
);

-- Compound index for efficient lookups
CREATE INDEX idx_pop0_title_duration ON pop0_tracks(title_norm, duration_ms);
```

**Key features:**
- All data needed for matching is in one table
- `artists_json` preserves Spotify credited order
- `album_type` stored as integer (rank value) for efficiency
- Compound index enables range queries on duration

#### Build Process (normalize-spotify)

Uses **SQL aggregation** instead of in-memory caching to avoid OOM with 100M+ tracks:

```sql
-- Single streaming query that aggregates artists via group_concat + json_quote
-- Subquery ensures artist ordering before aggregation (works on all SQLite versions)
SELECT
    sub.track_rowid, sub.track_name, sub.duration_ms, sub.album_rowid,
    sub.track_id, sub.isrc, sub.album_name, sub.album_type_int,
    '[' || group_concat(sub.artist_quoted, ',') || ']' AS artists_json
FROM (
    SELECT
        t.rowid AS track_rowid, t.name AS track_name, t.duration_ms,
        t.album_rowid, t.id AS track_id, t.external_id_isrc AS isrc,
        al.name AS album_name,
        CASE al.album_type
            WHEN 'album' THEN 0 WHEN 'single' THEN 1
            WHEN 'compilation' THEN 2 ELSE 3
        END AS album_type_int,
        json_quote(a.name) AS artist_quoted
    FROM tracks t
    JOIN track_artists ta ON ta.track_rowid = t.rowid
    JOIN artists a ON a.rowid = ta.artist_rowid
    LEFT JOIN albums al ON al.rowid = t.album_rowid
    WHERE t.popularity = 0
    ORDER BY t.rowid, ta.rowid  -- Preserves Spotify credited order
) sub
GROUP BY sub.track_rowid
```

```rust
pub fn build_pop0_enriched(src_conn: &Connection, out_conn: &mut Connection) {
    // Step 1: Execute streaming SQL query (aggregates artists in SQL, not memory)
    // Step 2: For each row, normalize title in Rust: title_norm = normalize_title(track_name)
    // Step 3: Batch insert to pop0_tracks (3000 rows per batch)
    // Step 4: Create indexes AFTER all inserts (faster)
    CREATE INDEX idx_pop0_title_duration ON pop0_tracks(title_norm, duration_ms);
    CREATE UNIQUE INDEX idx_pop0_track_rowid ON pop0_tracks(track_rowid);
}
```

**Memory usage:** Constant regardless of dataset size (batch buffer + SQLite row buffer only).

#### Extraction Query

```sql
SELECT track_rowid, duration_ms, track_name, track_id, isrc,
       artists_json, album_rowid, album_name, album_type
FROM pop0_tracks
WHERE title_norm = ?
LIMIT 5000
```

One query per title, all data immediately available. No cross-DB lookups.

#### Extraction Algorithm

```rust
fn match_pop0_enriched(normalized_conn: &Connection, groups: &mut [LrclibGroup]) {
    // 1. Build title_info_map: title_norm -> (target_durations, matching_groups)
    for group in unmatched_groups {
        if common_titles.contains(&group.title_norm) { continue; }
        title_info_map[title_norm].durations.extend(group_durations);
        title_info_map[title_norm].groups.push((group_idx, artist_norm));
    }

    // 2. Query each title, filter by duration, score immediately
    for (title_norm, info) in title_info_map {
        let rows = query("SELECT ... FROM pop0_tracks WHERE title_norm = ?", [title_norm]);

        for row in rows {
            // Duration pre-filter (±3 seconds)
            if !info.durations.iter().any(|d| (row.duration_ms - d).abs() <= 3000) {
                continue;
            }

            // Parse artists and score
            let artists: Vec<String> = serde_json::from_str(&row.artists_json);
            for artist in &artists {
                let artist_norm = normalize_artist(artist);
                // Match against expected groups, score, update best_match
            }
        }
    }
}
```

**No cross-DB queries** - everything comes from `pop0_tracks`.

---

### Legacy Path: `pop0_tracks_norm` Table (Fallback)

Used when `pop0_tracks` doesn't exist (older normalized DBs).

#### Schema

```sql
CREATE TABLE pop0_tracks_norm (
    title_norm   TEXT NOT NULL,
    track_rowid  INTEGER NOT NULL,
    duration_ms  INTEGER NOT NULL,
    album_rowid  INTEGER NOT NULL
);
CREATE INDEX idx_pop0_title ON pop0_tracks_norm(title_norm);
```

#### Extraction Algorithm (Slower)

```rust
fn match_pop0_legacy(...) {
    // 1. Create temp table, bulk insert unmatched titles
    // 2. JOIN pop0_tracks_norm with temp table
    // 3. Duration pre-filter in Rust
    // 4. Batch fetch artists from spotify_clean.sqlite3 (SLOW!)
    // 5. Batch fetch album types/names (SLOW!)
    // 6. Score and match
}
```

**Bottleneck:** Steps 4-5 require millions of cross-DB lookups.

---

### Common-Title Guardrails

Titles like "intro", "home", "alive" have **massive** candidate sets.

**Threshold:** 500 (titles with >500 pop0 matches are skipped)

```sql
CREATE TABLE pop0_title_counts (
    title_norm TEXT PRIMARY KEY,
    cnt INTEGER NOT NULL
);

INSERT INTO pop0_title_counts
SELECT title_norm, COUNT(*) as cnt
FROM pop0_tracks_norm
GROUP BY title_norm
HAVING cnt > 500;
```

**Actual stats (from latest run):**
- 26,812 common titles skipped
- 153,588 groups affected by common-title skip

---

### Performance: Actual Run Statistics

From extraction run on January 16, 2026:

#### Legacy Path (pop0_tracks_norm)

| Metric | Value |
|--------|-------|
| Unmatched groups eligible | 1,143,765 |
| Unique titles to search | 813,455 |
| Titles skipped (common) | 153,588 |
| Candidates after title match | 13,443,808 |
| **Artist fetch time** | **~30 minutes** |
| Matches found | 94,571 |
| **Yield** | **0.7%** |
| **Total pop0 phase time** | **33.5 minutes** |

#### Expected with Fast Path (pop0_tracks)

| Metric | Expected |
|--------|----------|
| Artist fetch | **Eliminated** |
| Album fetch | **Eliminated** |
| Cross-DB queries | **Zero** |
| Estimated pop0 phase time | **2-5 minutes** |

#### Overall Extraction Stats

| Phase | Time |
|-------|------|
| Read LRCLIB | 1.9m |
| Grouping | 1.4m |
| Main matching | 5.9m |
| Rescue | 1.5m |
| Fuzzy | 2.8m |
| **Pop0 (legacy)** | **33.5m** |
| Write + FTS | 1.7m |
| **Total** | **52.4m** |

With fast path, pop0 drops from 33.5m to ~3m, saving ~30 minutes per run.

#### Final Match Rate

| Stage | Matches | Rate |
|-------|---------|------|
| Main | 2,388,400 | 63.9% |
| + Rescue | 2,441,619 | 65.3% |
| + Fuzzy | 2,593,878 | 69.4% |
| + Pop0 | 2,562,583 | 68.6% |
| **Final** | **2,337,981** | **69.0%** |

(Final is lower due to deduplication of spotify_id)

### Size Estimates

| Table | Rows | Estimated Size |
|-------|------|----------------|
| `track_norm` | 56M | ~9GB |
| `pop0_tracks_norm` | ~100M | ~10GB |
| `pop0_tracks` (enriched) | ~100M | ~15-20GB |
| `pop0_title_counts` | ~27K | <1MB |

**Note:** `pop0_tracks` is larger than `pop0_tracks_norm` due to pre-joined data (artists_json, album_name, track_name, track_id, isrc).

---

### Regeneration Conditions

The `pop0_tracks` table only needs regeneration when:

| Condition | Regenerate? |
|-----------|-------------|
| New Spotify database dump | **Yes** |
| Normalization logic changes | **Yes** |
| Schema changes to pop0_tracks | **Yes** |
| New LRCLIB dump | No |
| Threshold/scoring changes | No |
| Bug fixes in extraction | No |

**Workflow:**
```bash
# 1. Rebuild normalized DB (only when Spotify data changes)
./target/release/lrclib-extract normalize-spotify \
  --spotify-db ~/git/music/spotify_clean.sqlite3 \
  --output-db ~/git/music/spotify_normalized.sqlite3 \
  --log-only

# 2. Run extraction (reuses normalized data)
./target/release/lrclib-extract run --workdir ~/git/music --log-only
```

---

### Verification

```sql
-- Verify pop0_tracks table exists and has data
SELECT COUNT(*) FROM pop0_tracks;
-- Expected: ~100M rows

-- Verify compound index exists
SELECT name FROM sqlite_master
WHERE type='index' AND tbl_name='pop0_tracks';
-- Expected: idx_pop0_title_duration

-- Verify indexed lookup works
EXPLAIN QUERY PLAN
SELECT * FROM pop0_tracks WHERE title_norm = 'no one knows';
-- Should show: SEARCH pop0_tracks USING INDEX idx_pop0_title_duration

-- Sample query to verify data
SELECT title_norm, track_name, artists_json, album_name, album_type
FROM pop0_tracks
WHERE title_norm = 'no one knows'
LIMIT 5;
```

---

### Code Changes Summary (v3)

| File | Changes |
|------|---------|
| `normalize_spotify.rs` | Add `build_pop0_enriched()` function, create `pop0_tracks` table with pre-joined artists/album data |
| `main.rs` | Add `match_pop0_enriched()` fast path, auto-detect table, `SpotifyAlbumType::from_int()` |
| `main.rs` | Keep `match_pop0_legacy()` as fallback for older normalized DBs |

#### Key Functions

**normalize_spotify.rs:**
```rust
/// Build pop0_tracks table with pre-joined artists and album data.
/// This eliminates the expensive artist fetch step during extraction.
pub fn build_pop0_enriched(
    src_conn: &Connection,
    out_conn: &mut Connection,
    log_only: bool,
) -> Result<()>
```

**main.rs:**
```rust
/// Uses pre-joined pop0_tracks table for fast matching.
/// Falls back to old pop0_tracks_norm approach if pop0_tracks doesn't exist.
fn match_pop0_indexed(...) -> Result<u64> {
    if has_table("pop0_tracks") {
        return match_pop0_enriched(...);  // Fast path
    }
    return match_pop0_legacy(...);        // Fallback
}
```
