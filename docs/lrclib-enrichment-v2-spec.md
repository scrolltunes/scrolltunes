# LRCLIB-Spotify Enrichment v2 Specification

> Comprehensive implementation plan for improving Spotify match rate from 46% to 65-72%

**Last Updated:** January 2026  
**Status:** Ready for Implementation  
**Estimated Effort:** 2-3 days  

---

## Executive Summary

The current LRCLIB-Spotify enrichment achieves 46.4% match rate (1.9M/4.1M tracks). This specification details improvements to reach 65-72% globally and 80-90% for mainstream catalogs.

### Key Changes

1. **Improved normalization** — Strip track numbers, artist prefixes, fold diacritics
2. **Delayed canonical selection** — Select canonical AFTER Spotify matching, not before
3. **Graduated duration scoring** — Replace ±10s hard cutoff with scoring
4. **Query optimization** — Eliminate correlated subqueries, use batched lookups
5. **Optional fuzzy matching** — Levenshtein for typos within groups

### Expected Results

| Metric | Current | Target |
|--------|---------|--------|
| Global match rate | 46.4% | 65-72% |
| Mainstream catalogs | ~80% | 85-95% |
| Extraction time | ~45 min | ~25-30 min |
| Peak memory | ~2 GB | ~2.5 GB |

---

## Part 1: Problem Analysis

### 1.1 Root Cause: "Love You to Death" Case Study

| LRCLIB ID | Title | Duration | title_norm | Issue |
|-----------|-------|----------|------------|-------|
| 22573993 | Love You To Death | 414s | `love you to death` | Clean title, wrong duration (15s off) |
| 16913662 | 03 - Love you to Death | 429s | `03 - love you to death` | Track number prefix, correct duration |
| 24510426 | Love You To Deatth | 429s | `love you to deatth` | Typo |
| 17642702 | Type O Negative - Love You To | 428s | `type o negative - love you to` | Artist in title, truncated |

**Spotify:** "Love You to Death" at 428.8s (429s), popularity 64, ISRC `NLA329680043`

**Why no match?**
- Entry 22573993 has clean title but duration 15s off (outside ±10s tolerance)
- Entry 16913662 has correct duration but `title_norm` contains `"03 - "` prefix
- Current flow selects canonical BEFORE matching, picking the wrong entry

### 1.2 Quantified Data Quality Issues

From analysis of `lrclib-spotify-db.sqlite3`:

| Metric | Count | % of Total |
|--------|-------|------------|
| Total canonical tracks | 4,145,124 | 100% |
| Spotify matched | 1,923,424 | 46.4% |
| **Unmatched** | 2,221,700 | 53.6% |
| Track number prefixes in title_norm | 52,775 | 1.3% |
| Artist name in title (estimated) | ~200,000 | ~5% |

### 1.3 Normalization Gaps

Current `normalize_title()` does NOT strip:

| Pattern | Example | Impact |
|---------|---------|--------|
| Track number prefixes | `03 - Love You To Death` | 52,775+ tracks |
| Artist name prefixes | `Type O Negative - Song` | ~5% of tracks |
| Diacritics | `Beyoncé` vs `Beyonce` | Unicode mismatches |
| Mojibake | `Song Title�` | Encoding corruption |
| Curly quotes | `don't` vs `don't` | Punctuation variants |

---

## Part 2: Database Schemas

### 2.1 LRCLIB Source (77GB)

```sql
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  name_lower TEXT,                    -- Pre-lowercased (unused by us)
  artist_name TEXT,
  artist_name_lower TEXT,
  album_name TEXT,
  album_name_lower TEXT,
  duration FLOAT,                     -- ⚠️ FLOAT (seconds with decimals)
  last_lyrics_id INTEGER,
  created_at DATETIME,
  updated_at DATETIME
);

-- Key indexes:
-- idx_tracks_last_lyrics_id (last_lyrics_id) ← Used for lyrics JOIN
-- idx_tracks_duration (duration)

CREATE TABLE lyrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plain_lyrics TEXT,
  synced_lyrics TEXT,
  track_id INTEGER,
  has_plain_lyrics BOOLEAN,           -- 0/1
  has_synced_lyrics BOOLEAN,          -- 0/1 ← Filter condition
  instrumental BOOLEAN,
  source TEXT
);

-- Key indexes:
-- idx_lyrics_has_synced_lyrics (has_synced_lyrics) ← Covering index
-- idx_lyrics_track_id (track_id)
```

### 2.2 Spotify Clean (125GB)

```sql
CREATE TABLE tracks (
  rowid INTEGER PRIMARY KEY NOT NULL,
  id TEXT NOT NULL,                   -- Spotify ID (22-char base62)
  name TEXT NOT NULL,
  album_rowid INTEGER NOT NULL,
  track_number INTEGER NOT NULL,
  external_id_isrc TEXT,              -- ISRC (186M unique values)
  popularity INTEGER NOT NULL,        -- 0-100
  duration_ms INTEGER NOT NULL,       -- ⚠️ INTEGER (milliseconds)
  explicit INTEGER NOT NULL
);

-- Key indexes:
-- tracks_id_unique (id)
-- tracks_popularity (popularity) ← Used in WHERE clause
-- tracks_album (album_rowid)
-- tracks_isrc (external_id_isrc)

CREATE TABLE artists (
  rowid INTEGER PRIMARY KEY NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  followers_total INTEGER NOT NULL,
  popularity INTEGER NOT NULL
);

-- Key indexes:
-- artists_id_unique (id)
-- artists_name (name)

CREATE TABLE track_artists (
  track_rowid INTEGER NOT NULL,
  artist_rowid INTEGER NOT NULL
);

-- Key indexes:
-- track_artists_track_id (track_rowid) ← Critical for JOIN
-- track_artists_artist_id (artist_rowid)

CREATE TABLE album_images (
  album_rowid INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  url TEXT NOT NULL
);

-- Key indexes:
-- album_images_album_id (album_rowid)
```

### 2.3 Spotify Audio Features (41GB)

```sql
CREATE TABLE track_audio_features (
  rowid INTEGER PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL,             -- Spotify ID (joins tracks.id, NOT rowid!)
  null_response INTEGER NOT NULL,     -- 1 if no features
  duration_ms INTEGER,
  time_signature INTEGER,             -- 3-7
  tempo INTEGER,                      -- ⚠️ INTEGER (not REAL despite API docs)
  key INTEGER,                        -- -1 to 11
  mode INTEGER,                       -- 0=minor, 1=major
  danceability REAL,
  energy REAL,
  loudness REAL,
  -- ... other features
);

-- Key index:
-- track_audio_features_track_id_unique (track_id) ← Unique, fast lookup
```

### 2.4 Rust Type Mapping

| Field | SQLite Type | Rust Type |
|-------|-------------|-----------|
| LRCLIB `duration` | FLOAT | `f64` → round to `i64` |
| Spotify `duration_ms` | INTEGER | `i64` |
| Spotify `tempo` | INTEGER | `Option<i32>` (not f64!) |
| Spotify `popularity` | INTEGER | `i32` |
| Spotify `key` | INTEGER | `Option<i32>` |
| Spotify `mode` | INTEGER | `Option<i32>` |

---

## Part 3: Architecture

### 3.1 Current Flow (Suboptimal)

```
LRCLIB (12.3M with synced lyrics)
    │
    ▼ Normalize title/artist
    │
    ▼ Group by (title_norm, artist_norm)
    │
    ▼ Select ONE canonical entry per group (quality-based)  ← PROBLEM
    │
    ▼ Stream Spotify, match by key + duration ±10s
    │
    ▼ Output: 4.1M tracks, 46% with Spotify
```

**Problem:** Canonical selection happens BEFORE Spotify matching. We might select an LRCLIB entry with clean metadata but wrong duration, losing the match.

### 3.2 New Flow (LRCLIB-Anchored with Delayed Canonical)

```
LRCLIB (12.3M with synced lyrics)
    │
    ▼ Improved normalization (strip track numbers, artist prefixes, fold diacritics)
    │
    ▼ Group by (title_norm, artist_norm) — keep ALL variants per group
    │
    ▼ Build index: (title_norm, artist_norm) → Vec<group_idx>
    │
    ▼ Stream Spotify tracks (pop ≥ 1)
    │   ├── Normalize title/artist (same function)
    │   ├── Lookup LRCLIB groups by key
    │   └── For each group: score ALL (LRCLIB variant, Spotify) pairs
    │
    ▼ Per group: select best (LRCLIB, Spotify) pair by combined score
    │   └── Fallback: if no Spotify match, use quality-only canonical
    │
    ▼ Batch-fetch audio features for matched Spotify IDs
    │
    ▼ Batch-fetch album images for matched album rowids
    │
    ▼ Output: 4.1M canonical tracks, 65-72% with Spotify enrichment
```

**Why this works:**
- Entry 16913662 ("03 - Love you to Death", 429s) stays in the candidate pool
- When Spotify streams "Love You to Death" (429s), it matches this entry
- Combined scoring prefers duration match (100pts) + Spotify popularity (12pts)
- Even with garbage title penalty (-30pts), it still wins over clean-but-wrong-duration

---

## Part 4: Query Optimization

### 4.1 LRCLIB Read

**Current (suboptimal):**
```sql
SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
FROM tracks t
WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
  AND t.duration > 45 AND t.duration < 600
```

**EXPLAIN:** `SEARCH t + LIST SUBQUERY` (subquery executed per row)

**Optimized:**
```sql
SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
FROM lyrics l
JOIN tracks t ON t.last_lyrics_id = l.id
WHERE l.has_synced_lyrics = 1
  AND t.duration > 45 AND t.duration < 600
```

**EXPLAIN:** `SEARCH l USING COVERING INDEX + SEARCH t USING INDEX`

### 4.2 Spotify Streaming

**Current (very slow):**
```sql
SELECT t.id, t.name, a.name, t.duration_ms, t.popularity, t.external_id_isrc, t.album_rowid
FROM tracks t
JOIN artists a ON a.rowid = (
    SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
)
WHERE t.popularity >= ?
```

**EXPLAIN:** `CORRELATED SCALAR SUBQUERY` — executes 50M times!

**Optimized (2-phase):**

**Phase A: Stream tracks only (no artist join)**
```sql
SELECT rowid, id, name, duration_ms, popularity, external_id_isrc, album_rowid
FROM tracks
WHERE popularity >= ?
```

**Phase B: Batch-fetch artists for matched tracks**
```sql
-- After matching, we know which track_rowids matched
SELECT ta.track_rowid, a.name
FROM track_artists ta
JOIN artists a ON a.rowid = ta.artist_rowid
WHERE ta.track_rowid IN (?, ?, ?, ...)  -- batched, ~1000 at a time
ORDER BY ta.track_rowid, ta.artist_rowid
```

### 4.3 Audio Features

**Current (inefficient):**
```sql
SELECT track_id, tempo, key, mode, time_signature FROM track_audio_features
-- Streams ALL 40M rows, filters in Rust!
```

**Optimized:**
```sql
SELECT track_id, tempo, key, mode, time_signature
FROM track_audio_features
WHERE track_id IN (?, ?, ?, ...)  -- batched by 999
```

Uses `track_audio_features_track_id_unique` index.

### 4.4 Album Images

**Current (inefficient):**
```sql
SELECT album_rowid, url FROM album_images
WHERE height BETWEEN 250 AND 350
ORDER BY album_rowid, ABS(height - 300)
-- Scans entire table, filters in Rust
```

**Optimized:**
```sql
SELECT album_rowid, url, height
FROM album_images
WHERE album_rowid IN (?, ?, ?, ...)  -- batched
  AND height BETWEEN 250 AND 350
ORDER BY ABS(height - 300)
```

Uses `album_images_album_id` index.

### 4.5 PRAGMA Settings

```sql
-- Read-only optimizations (already good)
PRAGMA mmap_size = 8589934592;        -- 8GB mmap
PRAGMA cache_size = -1000000;         -- ~1GB page cache
PRAGMA temp_store = MEMORY;
PRAGMA query_only = 1;
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA locking_mode = EXCLUSIVE;

-- Additional (SQLite 3.44+)
PRAGMA threads = 4;                   -- Multi-threaded reads
PRAGMA read_uncommitted = 1;          -- Skip locks
```

---

## Part 5: Normalization

### 5.1 Track Number Stripping

**Add to `normalize_title()`:**
```rust
static TRACK_NUMBER_PREFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"(?i)^(?:track\s*)?\d{1,4}\s*[-–—._]\s*").unwrap()
);
```

Examples:
- `03 - Love You To Death` → `Love You To Death`
- `Track 5 - Song Name` → `Song Name`
- `0958 - Artist - Title` → `Artist - Title` (then artist strip)

### 5.2 Artist Name Stripping

**New 2-arg function:**
```rust
fn normalize_title_with_artist(title: &str, artist: &str) -> String {
    let mut result = title.to_string();
    
    // Strip track number first
    result = TRACK_NUMBER_PREFIX.replace(&result, "").to_string();
    
    // Strip artist prefix: "Artist - Song" → "Song"
    let artist_norm = normalize_artist(artist);
    if artist_norm.len() >= 3 {  // Avoid false positives for short names
        let escaped = regex::escape(&artist_norm);
        let prefix_re = Regex::new(&format!(r"(?i)^\s*{}\s*[-–—:]\s*", escaped)).unwrap();
        result = prefix_re.replace(&result, "").to_string();
    }
    
    // Apply existing TITLE_PATTERNS (remaster, live, feat, etc.)
    for pattern in TITLE_PATTERNS.iter() {
        result = pattern.replace_all(&result, "").to_string();
    }
    
    // Final cleanup
    fold_to_ascii(&result).trim().to_string()
}
```

### 5.3 Unicode Normalization (Diacritic Folding)

```rust
use unicode_normalization::UnicodeNormalization;

fn fold_to_ascii(s: &str) -> String {
    s.nfkd()
        .filter(|c| !unicode_general_category::GeneralCategory::of(*c).is_mark())
        .collect::<String>()
        .to_lowercase()
}
```

Simpler version (without extra crate):
```rust
fn fold_to_ascii(s: &str) -> String {
    use unicode_normalization::UnicodeNormalization;
    s.nfkd()
        .filter(|c| !c.is_combining_mark())  // Filter combining marks
        .collect::<String>()
        .to_lowercase()
}

trait CharExt {
    fn is_combining_mark(&self) -> bool;
}

impl CharExt for char {
    fn is_combining_mark(&self) -> bool {
        matches!(*self as u32, 0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0xFE20..=0xFE2F)
    }
}
```

### 5.4 Mojibake Cleanup

```rust
static MOJIBAKE_SUFFIX: Lazy<Regex> = Lazy::new(||
    Regex::new(r"[\uFFFD�]+$").unwrap()
);

// Apply in normalize_title:
result = MOJIBAKE_SUFFIX.replace(&result, "").to_string();
```

### 5.5 Punctuation Normalization

```rust
fn normalize_punctuation(s: &str) -> String {
    s.replace(''', "'")
     .replace(''', "'")
     .replace('"', "\"")
     .replace('"', "\"")
     .replace('´', "'")
     .replace('`', "'")
     .replace(" & ", " and ")
}
```

---

## Part 6: Scoring System

### 6.1 Duration Score

```rust
fn duration_score(lrclib_sec: i64, spotify_ms: i64) -> i32 {
    let diff = (lrclib_sec - spotify_ms / 1000).abs();
    match diff {
        0..=2   => 100,  // Near-perfect
        3..=5   => 80,   // Excellent
        6..=10  => 50,   // Good
        11..=15 => 25,   // Acceptable (currently rejected!)
        16..=30 => 10,   // Poor but possible
        _       => -1000, // Hard reject
    }
}
```

### 6.2 LRCLIB Quality Score (Existing)

```rust
fn compute_quality_score(track: &Track, median_duration: Option<i64>) -> i32 {
    let mut score: i32 = 0;

    // Album type bonus
    match classify_album(&track.album) {
        AlbumType::Studio => score += 40,
        AlbumType::Remaster => score += 25,
        AlbumType::Deluxe => score += 15,
        AlbumType::Compilation => score += 5,
        AlbumType::Soundtrack => score -= 10,
        AlbumType::Live => score -= 20,
    }

    // Live/remix penalty
    if has_live_remix_pattern(&track.title) || has_live_remix_pattern(&track.album) {
        score -= 30;
    }

    // Garbage title penalty
    if has_garbage_title_pattern(&track.title) {
        score -= 50;
    }
    
    // Artist in title penalty
    if title_contains_artist(&track.title, &track.artist) {
        score -= 40;
    }

    // Duration proximity to median
    if let Some(median) = median_duration {
        let diff = (track.duration_sec - median).abs();
        match diff {
            0..=2 => score += 30,
            3..=5 => score += 20,
            6..=10 => score += 10,
            _ => {}
        }
    }

    // Good album bonus
    if !is_garbage_album(&track.album) {
        score += 10;
    }

    score  // Typical range: -50 to +80
}
```

### 6.3 Combined Score (New)

```rust
/// Combined scoring with guardrails against false positives
fn combined_score(
    lrclib: &Track, 
    lrclib_quality: i32, 
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    let spotify_duration_sec = spotify.duration_ms / 1000;
    let duration_diff = (lrclib.duration_sec - spotify_duration_sec).abs();
    
    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 1: Hard duration rejection
    // Reject if diff > 30s OR diff > 25% of song length (whichever is larger)
    // ═══════════════════════════════════════════════════════════════════════
    let max_allowed_diff = 30.max((spotify_duration_sec as f64 * 0.25) as i64);
    if duration_diff > max_allowed_diff {
        return -1000;  // Hard reject
    }
    
    // Duration score (graduated)
    let dur_score = match duration_diff {
        0..=2   => 100,
        3..=5   => 80,
        6..=10  => 50,
        11..=15 => 25,
        16..=30 => 10,
        _       => 0,
    };
    
    let mut score = dur_score;
    
    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 2: Artist verification
    // Even though we matched on (title_norm, artist_norm), double-check
    // ═══════════════════════════════════════════════════════════════════════
    let spotify_artist_norm = normalize_artist(&spotify.artist);
    let artist_match = if spotify_artist_norm == group_artist_norm {
        50  // Exact match
    } else {
        let sim = compute_artist_similarity(&spotify_artist_norm, group_artist_norm);
        if sim < 0.3 {
            return -500;  // Artist mismatch - reject
        }
        (sim * 30.0) as i32  // Partial credit
    };
    score += artist_match;
    
    // LRCLIB quality score (existing logic, typically -50 to +80)
    score += lrclib_quality;
    
    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // GUARDRAIL 3: Popularity as tiebreaker only
    // Keep influence bounded (0-10 points, not 0-20)
    // ═══════════════════════════════════════════════════════════════════════
    score += spotify.popularity / 10;
    
    score  // Typical range: 80-250 for good matches
}
```

### 6.4 Score Thresholds

```rust
const ACCEPT_THRESHOLD: i32 = 80;        // Minimum score to accept a match
const LOW_CONFIDENCE_THRESHOLD: i32 = 120; // Below this, log as low-confidence

fn is_acceptable_match(score: i32) -> bool {
    score >= ACCEPT_THRESHOLD
}

fn is_low_confidence(score: i32) -> bool {
    score >= ACCEPT_THRESHOLD && score < LOW_CONFIDENCE_THRESHOLD
}
```

### 6.5 Scoring Examples

Spotify: "Love You to Death" by Type O Negative, 429s, popularity 64

| LRCLIB Entry | Duration | Artist | Quality | Clean | Pop | **Total** |
|--------------|----------|--------|---------|-------|-----|-----------|
| "Love You To Death" (414s) | 25 | +50 | +40 | +30 | +6 | **151** |
| "03 - Love you to Death" (429s) | 100 | +50 | -10 | 0 | +6 | **146** |
| "Love You To Deatth" (429s) | 100 | +50 | +40 | +30 | +6 | **226** ← Best if fuzzy |

With the new logic:
- Entry with 414s (15s off) gets duration score 25, still acceptable (score 151 > threshold 80)
- Entry with 429s and garbage title still competitive due to perfect duration match
- If fuzzy matching enabled, typo variant "Deatth" would win with highest score

Without fuzzy matching, first entry (clean title, 15s off) wins at 151.

---

## Part 7: Data Structures

### 7.1 Core Types

```rust
use compact_str::CompactString;
use rustc_hash::{FxHashMap, FxHashSet};

/// Raw track from LRCLIB
#[derive(Clone, Debug)]
struct Track {
    id: i64,
    title: String,           // Original for display
    artist: String,
    album: Option<String>,
    duration_sec: i64,
}

/// Track with quality score (normalized keys stored in group, not here)
#[derive(Clone, Debug)]
struct ScoredTrack {
    track: Track,
    quality: i32,            // LRCLIB quality score
    // NOTE: title_norm and artist_norm are NOT stored here
    // They're stored ONCE per group in LrclibGroup.key to save memory
}

/// Spotify track (minimal, for matching)
#[derive(Clone, Debug)]
struct SpotifyTrack {
    id: String,              // Spotify ID (22-char)
    rowid: i64,              // For artist lookup
    name: String,            // Original title
    duration_ms: i64,
    popularity: i32,
    isrc: Option<String>,
    album_rowid: i64,
}

/// Audio features (from separate DB)
#[derive(Clone, Debug)]
struct AudioFeatures {
    tempo: Option<i32>,      // BPM (INTEGER in schema)
    key: Option<i32>,        // -1 to 11
    mode: Option<i32>,       // 0=minor, 1=major
    time_signature: Option<i32>,
}

/// Final enriched track
#[derive(Clone, Debug)]
struct EnrichedTrack {
    // LRCLIB (always present)
    lrclib_id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,

    // Spotify (nullable)
    spotify_id: Option<String>,
    popularity: Option<i32>,
    tempo: Option<i32>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>,
}

/// Group of LRCLIB tracks sharing (title_norm, artist_norm)
struct LrclibGroup {
    key: (String, String),   // (title_norm, artist_norm)
    tracks: Vec<ScoredTrack>,
    best_match: Option<(usize, SpotifyTrack, i32)>,  // (track_idx, spotify, score)
}
```

### 7.2 Index Structure

```rust
// Index: normalized key → group index
type LrclibIndex = FxHashMap<(String, String), usize>;

// All groups
type LrclibGroups = Vec<LrclibGroup>;
```

### 7.3 Memory Estimates

| Data | Count | Size per Item | Total |
|------|-------|---------------|-------|
| LRCLIB groups | 4.1M | ~200 bytes | ~800 MB |
| LRCLIB tracks (all variants) | 12.3M | ~150 bytes | ~1.8 GB |
| LrclibIndex | 4.1M keys | ~80 bytes | ~330 MB |
| Best matches (in groups) | 4.1M | ~100 bytes | ~400 MB |
| Audio features (filtered) | 2.8M | ~20 bytes | ~56 MB |
| Album images (filtered) | 2.8M | ~100 bytes | ~280 MB |
| **Peak total** | | | **~2.5 GB** |

---

## Part 8: Implementation

### 8.1 Updated Cargo.toml

```toml
[package]
name = "lrclib-extract"
version = "0.2.0"
edition = "2021"

[dependencies]
rusqlite = { version = "0.32", features = ["bundled"] }
rayon = "1.10"
indicatif = "0.17"
regex = "1.11"
clap = { version = "4.5", features = ["derive"] }
anyhow = "1.0"
rustc-hash = "2.1"
unicode-normalization = "0.1"
# Optional for Phase 4:
# rapidfuzz = "0.6"
# compact_str = "0.8"

[profile.release]
lto = true
codegen-units = 1
opt-level = 3
```

### 8.2 Main Function Outline

```rust
fn main() -> Result<()> {
    let args = Args::parse();
    let start = Instant::now();

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Read LRCLIB tracks
    // ═══════════════════════════════════════════════════════════════
    let source_conn = open_with_pragmas(&args.source)?;
    let tracks = read_lrclib_tracks(&source_conn)?;  // 12.3M
    drop(source_conn);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Normalize and group (keep ALL variants)
    // ═══════════════════════════════════════════════════════════════
    let (groups, index) = build_groups_and_index(tracks)?;
    // groups: Vec<LrclibGroup> with all variants per group
    // index: FxHashMap<(title_norm, artist_norm), group_idx>

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Stream Spotify and match
    // ═══════════════════════════════════════════════════════════════
    if let Some(ref spotify_path) = args.spotify {
        let spotify_conn = open_with_pragmas(spotify_path)?;
        
        stream_and_match_spotify(
            &spotify_conn,
            args.min_popularity,
            &mut groups,
            &index,
        )?;
        
        // ═══════════════════════════════════════════════════════════
        // PHASE 4: Batch-fetch audio features and images
        // ═══════════════════════════════════════════════════════════
        let matched_spotify_ids = collect_matched_spotify_ids(&groups);
        let matched_album_rowids = collect_matched_album_rowids(&groups);
        
        let audio_lookup = if let Some(ref af_path) = args.audio_features {
            let af_conn = open_with_pragmas(af_path)?;
            load_audio_features_batched(&af_conn, &matched_spotify_ids)?
        } else {
            FxHashMap::default()
        };
        
        let image_lookup = load_album_images_batched(&spotify_conn, &matched_album_rowids)?;
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: Select canonical and enrich
    // ═══════════════════════════════════════════════════════════════
    let enriched = select_canonical_and_enrich(groups, &audio_lookup, &image_lookup)?;

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: Write output
    // ═══════════════════════════════════════════════════════════════
    let mut output_conn = Connection::open(&args.output)?;
    write_output(&mut output_conn, &enriched)?;
    build_fts_index(&output_conn)?;
    optimize_database(&output_conn)?;

    print_stats(&enriched, start.elapsed());
    Ok(())
}
```

### 8.3 Key Functions

#### Read LRCLIB (Optimized Query)

```rust
fn read_lrclib_tracks(conn: &Connection) -> Result<Vec<Track>> {
    // NOTE: We do NOT load lyrics content - only track metadata
    // This keeps memory usage manageable (~1.5GB vs ~10GB+ with lyrics)
    let sql = r#"
        SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
        FROM lyrics l
        JOIN tracks t ON t.last_lyrics_id = l.id
        WHERE l.has_synced_lyrics = 1
          AND t.duration > 45 AND t.duration < 600
    "#;
    
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut tracks = Vec::with_capacity(13_000_000);
    
    while let Some(row) = rows.next()? {
        let duration_float: f64 = row.get(4)?;
        let track = Track {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            duration_sec: duration_float.round() as i64,
        };
        
        if !is_garbage_album(&track.album) && !should_skip_title(&track.title) {
            tracks.push(track);
        }
    }
    
    Ok(tracks)
}
```

#### Build Groups and Index

```rust
/// Memory optimization: Don't store title_norm/artist_norm in ScoredTrack
/// They're already stored once in the group key
fn build_groups_and_index(tracks: Vec<Track>) -> Result<(Vec<LrclibGroup>, LrclibIndex)> {
    let mut temp_groups: FxHashMap<(String, String), Vec<ScoredTrack>> = FxHashMap::default();
    
    for track in tracks {
        let title_norm = normalize_title_with_artist(&track.title, &track.artist);
        let artist_norm = normalize_artist(&track.artist);
        let quality = compute_quality_score(&track, None);
        
        // NOTE: We don't clone title_norm/artist_norm into ScoredTrack
        // The group key already has them - saves ~24 bytes × 12M = 288MB
        let scored = ScoredTrack {
            track,
            quality,
        };
        
        temp_groups.entry((title_norm, artist_norm)).or_default().push(scored);
    }
    
    let mut groups: Vec<LrclibGroup> = Vec::with_capacity(temp_groups.len());
    let mut index: LrclibIndex = FxHashMap::default();
    
    for (key, tracks) in temp_groups {
        let group_idx = groups.len();
        index.insert(key.clone(), group_idx);
        groups.push(LrclibGroup {
            key,  // (title_norm, artist_norm) stored ONCE per group
            tracks,
            best_match: None,
        });
    }
    
    Ok((groups, index))
}
```

#### Stream and Match Spotify (2-Phase with Artist Lookup)

**CRITICAL FIX:** The index is keyed by `(title_norm, artist_norm)`. We MUST normalize
the Spotify artist to look up correctly. This requires a 2-phase approach:

```rust
/// Phase A: Stream Spotify tracks and collect candidates that need artist lookup
/// Phase B: Batch-fetch artists for candidates and complete matching
fn stream_and_match_spotify(
    conn: &Connection,
    min_popularity: i32,
    groups: &mut [LrclibGroup],
    index: &LrclibIndex,
) -> Result<()> {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE A: Stream tracks, normalize title, collect rowids that might match
    // ═══════════════════════════════════════════════════════════════════════
    
    // First pass: collect Spotify tracks where title_norm matches ANY LRCLIB group
    // We'll resolve artist in phase B
    let sql = r#"
        SELECT rowid, id, name, duration_ms, popularity, external_id_isrc, album_rowid
        FROM tracks
        WHERE popularity >= ?
    "#;
    
    // Build a title-only index for fast initial filtering
    let title_only_index: FxHashMap<String, Vec<usize>> = {
        let mut idx = FxHashMap::default();
        for (group_idx, group) in groups.iter().enumerate() {
            let title_norm = &group.key.0;
            idx.entry(title_norm.clone()).or_insert_with(Vec::new).push(group_idx);
        }
        idx
    };
    
    // Collect potential matches: (spotify_track, candidate_group_indices)
    let mut candidates: Vec<(SpotifyTrack, Vec<usize>)> = Vec::new();
    let mut matched_rowids: Vec<i64> = Vec::new();
    
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;
    
    while let Some(row) = rows.next()? {
        let spotify = SpotifyTrack {
            rowid: row.get(0)?,
            id: row.get(1)?,
            name: row.get(2)?,
            duration_ms: row.get(3)?,
            popularity: row.get(4)?,
            isrc: row.get(5)?,
            album_rowid: row.get(6)?,
            artist: String::new(),  // Will be filled in Phase B
        };
        
        let title_norm = normalize_title(&spotify.name);
        
        // Check if ANY LRCLIB group has this title
        if let Some(group_indices) = title_only_index.get(&title_norm) {
            matched_rowids.push(spotify.rowid);
            candidates.push((spotify, group_indices.clone()));
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE B: Batch-fetch primary artists for candidate tracks
    // ═══════════════════════════════════════════════════════════════════════
    
    // Build rowid → artist_name lookup
    let artist_lookup = batch_fetch_primary_artists(conn, &matched_rowids)?;
    
    // Now complete matching with artist information
    for (mut spotify, group_indices) in candidates {
        // Get artist name from lookup
        let artist_name = artist_lookup.get(&spotify.rowid).cloned().unwrap_or_default();
        spotify.artist = artist_name.clone();
        let artist_norm = normalize_artist(&artist_name);
        let title_norm = normalize_title(&spotify.name);
        
        // Find the exact group with matching (title_norm, artist_norm)
        if let Some(&group_idx) = index.get(&(title_norm, artist_norm.clone())) {
            let group = &mut groups[group_idx];
            
            // Score against all variants in group
            for (track_idx, lrclib) in group.tracks.iter().enumerate() {
                let score = combined_score(&lrclib.track, lrclib.quality, &spotify, &group.key.1);
                
                if score > group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN) {
                    group.best_match = Some((track_idx, spotify.clone(), score));
                }
            }
        }
        // If no exact (title, artist) match, try artist similarity scoring
        // for candidate groups (handles "feat." variations, etc.)
        else {
            for &group_idx in &group_indices {
                let group = &mut groups[group_idx];
                let group_artist_norm = &group.key.1;
                
                // Compute artist similarity
                let artist_sim = compute_artist_similarity(&artist_norm, group_artist_norm);
                if artist_sim < 0.5 {
                    continue;  // Skip if artists are too different
                }
                
                for (track_idx, lrclib) in group.tracks.iter().enumerate() {
                    let mut score = combined_score(&lrclib.track, lrclib.quality, &spotify, group_artist_norm);
                    // Penalize non-exact artist match
                    score -= ((1.0 - artist_sim) * 50.0) as i32;
                    
                    if score > group.best_match.as_ref().map(|(_, _, s)| *s).unwrap_or(i32::MIN) {
                        group.best_match = Some((track_idx, spotify.clone(), score));
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Batch-fetch primary artist names for a list of track rowids
fn batch_fetch_primary_artists(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, String>> {
    let mut lookup: FxHashMap<i64, String> = FxHashMap::default();
    
    for chunk in rowids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        
        // Get primary artist (MIN artist_rowid) for each track
        let sql = format!(r#"
            SELECT ta.track_rowid, a.name
            FROM track_artists ta
            JOIN artists a ON a.rowid = ta.artist_rowid
            WHERE ta.track_rowid IN ({})
              AND ta.artist_rowid = (
                  SELECT MIN(artist_rowid) 
                  FROM track_artists 
                  WHERE track_rowid = ta.track_rowid
              )
        "#, placeholders);
        
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = 
            chunk.iter().map(|r| r as &dyn rusqlite::ToSql).collect();
        
        let mut rows = stmt.query(params.as_slice())?;
        while let Some(row) = rows.next()? {
            let track_rowid: i64 = row.get(0)?;
            let artist_name: String = row.get(1)?;
            lookup.insert(track_rowid, artist_name);
        }
    }
    
    Ok(lookup)
}

/// Compute similarity between two normalized artist names (0.0 to 1.0)
fn compute_artist_similarity(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    
    // Tokenize and compute Jaccard similarity
    let tokens_a: FxHashSet<&str> = a.split_whitespace().collect();
    let tokens_b: FxHashSet<&str> = b.split_whitespace().collect();
    
    if tokens_a.is_empty() || tokens_b.is_empty() {
        return 0.0;
    }
    
    let intersection = tokens_a.intersection(&tokens_b).count();
    let union = tokens_a.union(&tokens_b).count();
    
    intersection as f64 / union as f64
}
```

#### Batch Load Audio Features

```rust
fn load_audio_features_batched(
    conn: &Connection,
    spotify_ids: &[String],
) -> Result<FxHashMap<String, AudioFeatures>> {
    let mut lookup = FxHashMap::default();
    
    for chunk in spotify_ids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "SELECT track_id, tempo, key, mode, time_signature
             FROM track_audio_features
             WHERE track_id IN ({})",
            placeholders
        );
        
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = 
            chunk.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        
        let mut rows = stmt.query(params.as_slice())?;
        while let Some(row) = rows.next()? {
            let track_id: String = row.get(0)?;
            let features = AudioFeatures {
                tempo: row.get(1)?,
                key: row.get(2)?,
                mode: row.get(3)?,
                time_signature: row.get(4)?,
            };
            lookup.insert(track_id, features);
        }
    }
    
    Ok(lookup)
}
```

---

## Part 9: Testing

### 9.1 Validation Queries

```sql
-- After extraction, verify Type O Negative case is fixed
SELECT id, title, title_norm, duration_sec, spotify_id, popularity
FROM tracks
WHERE artist_norm = 'type o negative'
  AND title_norm = 'love you to death';
-- Should show spotify_id = '58RDwkonFMOkoytBtIQetc', popularity = 64

-- Count track number prefixes (should be 0 after fix)
SELECT COUNT(*) FROM tracks WHERE title_norm GLOB '[0-9]* - *';

-- Match rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
  ROUND(100.0 * SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as pct
FROM tracks;
```

### 9.2 Sample Artists to Verify

| Artist | Known Issues | Expected After Fix |
|--------|--------------|-------------------|
| Type O Negative | Track prefixes, artist in title | ✓ Match "Love You to Death" |
| Metallica | Many remasters | ✓ Prefer studio versions |
| Beyoncé | Diacritics | ✓ Match "Beyonce" |
| AC/DC | Punctuation | ✓ Match "AC DC" |
| The Beatles | "The" prefix | ✓ Match |

---

## Part 10: Timeline

| Phase | Task | Effort | Impact |
|-------|------|--------|--------|
| **1** | Normalization improvements | 4 hours | +8-14% match rate |
| **2** | Query optimization (LRCLIB, batch loads) | 3 hours | ~40% faster |
| **3** | Delayed canonical selection | 4 hours | +5-7% match rate |
| **4** | Spotify 2-phase streaming | 4 hours | ~40% faster |
| **5** | Integration & testing | 4 hours | Validation |
| **Total** | | **~20 hours** | **65-72% match, 25-30 min runtime** |

### Optional Phase 6: Fuzzy Matching (+2-3%)

```rust
// Add rapidfuzz = "0.6" to Cargo.toml
use rapidfuzz::distance::levenshtein;

fn fuzzy_title_match(title1: &str, title2: &str) -> bool {
    let dist = levenshtein::distance(title1.chars(), title2.chars());
    dist <= 2
}
```

Only apply within same `artist_norm` group and similar duration.

---

## Part 11: Match Failure Logging

### 11.1 Purpose

Log "near-miss" candidates that look like they should match but don't. This enables:
- Post-hoc analysis of matching failures
- Iterative improvement of normalization rules
- Manual verification of edge cases

### 11.2 What to Log

#### Case 1: LRCLIB group with no Spotify candidates
A popular LRCLIB track (high quality score) found no Spotify matches at all.

#### Case 2: LRCLIB group with Spotify candidates but all rejected
Spotify candidates existed but all scored below threshold (e.g., duration too far off).

#### Case 3: Low-confidence match accepted
Match was accepted but score was marginal (e.g., 50-80 range).

### 11.3 Log Entry Structure

```rust
#[derive(Debug, Clone)]
struct MatchFailureLog {
    // LRCLIB side
    lrclib_id: i64,
    lrclib_title: String,
    lrclib_artist: String,
    lrclib_album: Option<String>,
    lrclib_duration_sec: i64,
    lrclib_title_norm: String,
    lrclib_artist_norm: String,
    lrclib_quality: i32,
    group_variant_count: usize,        // How many LRCLIB variants in this group
    
    // Spotify candidates (up to 5 best)
    spotify_candidates: Vec<SpotifyCandidate>,
    
    // Failure reason
    failure_reason: FailureReason,
    best_score: Option<i32>,           // Highest score achieved (if any)
}

#[derive(Debug, Clone)]
struct SpotifyCandidate {
    spotify_id: String,
    spotify_name: String,
    spotify_artist: String,            // Primary artist name
    spotify_duration_ms: i64,
    spotify_popularity: i32,
    duration_diff_sec: i64,            // Difference from LRCLIB
    score: i32,                        // Combined score
    reject_reason: Option<String>,     // Why rejected (if applicable)
}

#[derive(Debug, Clone)]
enum FailureReason {
    NoSpotifyCandidates,               // Key not found in Spotify
    AllCandidatesRejected {            // Found candidates but all failed
        candidate_count: usize,
        best_score: i32,
        primary_reject_reason: String, // e.g., "duration >30s off"
    },
    LowConfidenceMatch {               // Match accepted but marginal
        accepted_score: i32,
        threshold: i32,
    },
}
```

### 11.4 Output Format

Write to a separate SQLite table in the output database:

```sql
CREATE TABLE match_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- LRCLIB entry
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,
    lrclib_duration_sec INTEGER NOT NULL,
    lrclib_title_norm TEXT NOT NULL,
    lrclib_artist_norm TEXT NOT NULL,
    lrclib_quality INTEGER NOT NULL,
    group_variant_count INTEGER NOT NULL,
    
    -- Failure info
    failure_reason TEXT NOT NULL,      -- 'no_candidates', 'all_rejected', 'low_confidence'
    best_score INTEGER,
    
    -- Spotify candidates (JSON array)
    spotify_candidates TEXT,           -- JSON: [{id, name, artist, duration_ms, popularity, diff, score, reason}, ...]
    
    -- For querying
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failures_reason ON match_failures(failure_reason);
CREATE INDEX idx_failures_quality ON match_failures(lrclib_quality DESC);
CREATE INDEX idx_failures_artist ON match_failures(lrclib_artist_norm);
```

### 11.5 Logging Criteria

Only log entries worth investigating:

```rust
fn should_log_failure(group: &LrclibGroup, best_score: Option<i32>) -> bool {
    // Get the best LRCLIB variant in this group
    let best_lrclib = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
    
    // Log if:
    // 1. High-quality LRCLIB track (likely a real song, not garbage)
    let is_high_quality = best_lrclib.quality >= 30;
    
    // 2. Title looks reasonable (not full of garbage patterns)
    let has_clean_title = !has_garbage_title_pattern(&best_lrclib.track.title);
    
    // 3. Either no match, or low-confidence match
    let is_failure_or_marginal = match best_score {
        None => true,                          // No match at all
        Some(s) if s < 80 => true,            // Low confidence
        _ => false,                            // Good match, don't log
    };
    
    is_high_quality && has_clean_title && is_failure_or_marginal
}
```

### 11.6 Implementation

```rust
fn log_match_failure(
    conn: &Connection,
    group: &LrclibGroup,
    spotify_candidates: &[SpotifyCandidate],
    failure_reason: FailureReason,
    best_score: Option<i32>,
) -> Result<()> {
    let best_lrclib = group.tracks.iter().max_by_key(|t| t.quality).unwrap();
    
    // Serialize candidates to JSON (keep top 5)
    let candidates_json = serde_json::to_string(
        &spotify_candidates.iter().take(5).collect::<Vec<_>>()
    )?;
    
    let reason_str = match &failure_reason {
        FailureReason::NoSpotifyCandidates => "no_candidates",
        FailureReason::AllCandidatesRejected { .. } => "all_rejected",
        FailureReason::LowConfidenceMatch { .. } => "low_confidence",
    };
    
    conn.execute(
        "INSERT INTO match_failures (
            lrclib_id, lrclib_title, lrclib_artist, lrclib_album,
            lrclib_duration_sec, lrclib_title_norm, lrclib_artist_norm,
            lrclib_quality, group_variant_count,
            failure_reason, best_score, spotify_candidates
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            best_lrclib.track.id,
            best_lrclib.track.title,
            best_lrclib.track.artist,
            best_lrclib.track.album,
            best_lrclib.track.duration_sec,
            best_lrclib.title_norm,
            best_lrclib.artist_norm,
            best_lrclib.quality,
            group.tracks.len(),
            reason_str,
            best_score,
            candidates_json,
        ],
    )?;
    
    Ok(())
}
```

### 11.7 Analysis Queries

```sql
-- Top failure reasons
SELECT failure_reason, COUNT(*) as count
FROM match_failures
GROUP BY failure_reason
ORDER BY count DESC;

-- High-quality tracks with no Spotify candidates (normalization issue?)
SELECT lrclib_id, lrclib_title, lrclib_artist, lrclib_title_norm, lrclib_artist_norm
FROM match_failures
WHERE failure_reason = 'no_candidates'
  AND lrclib_quality >= 50
ORDER BY lrclib_quality DESC
LIMIT 100;

-- Tracks rejected due to duration (different versions?)
SELECT 
    lrclib_id, 
    lrclib_title, 
    lrclib_artist,
    lrclib_duration_sec,
    json_extract(spotify_candidates, '$[0].spotify_name') as spotify_name,
    json_extract(spotify_candidates, '$[0].duration_diff_sec') as duration_diff,
    json_extract(spotify_candidates, '$[0].spotify_popularity') as popularity
FROM match_failures
WHERE failure_reason = 'all_rejected'
  AND json_extract(spotify_candidates, '$[0].reject_reason') LIKE '%duration%'
ORDER BY json_extract(spotify_candidates, '$[0].spotify_popularity') DESC
LIMIT 100;

-- Low-confidence matches to review
SELECT 
    lrclib_id, lrclib_title, lrclib_artist, best_score,
    json_extract(spotify_candidates, '$[0].spotify_id') as matched_spotify_id,
    json_extract(spotify_candidates, '$[0].spotify_name') as matched_name
FROM match_failures
WHERE failure_reason = 'low_confidence'
ORDER BY best_score ASC
LIMIT 100;

-- Specific artist investigation
SELECT *
FROM match_failures
WHERE lrclib_artist_norm = 'type o negative'
ORDER BY lrclib_quality DESC;

-- Find patterns in unmatched titles
SELECT 
    CASE 
        WHEN lrclib_title_norm GLOB '[0-9]* - *' THEN 'track_number_prefix'
        WHEN lrclib_title LIKE '%�%' THEN 'mojibake'
        WHEN length(lrclib_title) > 100 THEN 'very_long_title'
        ELSE 'other'
    END as pattern,
    COUNT(*) as count
FROM match_failures
WHERE failure_reason = 'no_candidates'
GROUP BY pattern
ORDER BY count DESC;
```

### 11.8 Expected Volume

| Category | Estimated Count | Notes |
|----------|-----------------|-------|
| Total unmatched | ~1.2M | After improvements (28-35% of 4.1M) |
| Worth logging (high quality) | ~300K-500K | Quality ≥ 30, clean title |
| No candidates | ~200K | Normalization or not in Spotify |
| All rejected | ~100K | Duration mismatch primarily |
| Low confidence | ~50K | Marginal matches (score 50-80) |

Storage: ~50-100 MB for the `match_failures` table.

### 11.9 Iterative Improvement Workflow

1. **Run extraction** with failure logging enabled
2. **Query failures** to identify patterns:
   ```sql
   SELECT lrclib_title_norm, COUNT(*) 
   FROM match_failures 
   WHERE failure_reason = 'no_candidates'
   GROUP BY lrclib_title_norm 
   HAVING COUNT(*) > 5
   ORDER BY COUNT(*) DESC;
   ```
3. **Identify normalization gaps** (e.g., new patterns to strip)
4. **Update normalization rules**
5. **Re-run and compare** failure counts

---

## Part 12: Review Summary (Oracle Findings)

### Critical Fixes Applied

| Issue | Original Problem | Fix Applied |
|-------|------------------|-------------|
| **Index key mismatch** | Spotify lookup used `(title_norm, "")` but index keyed by `(title_norm, artist_norm)` | 2-phase approach: title-only filter → batch artist lookup → exact key match |
| **Memory duplication** | `title_norm`/`artist_norm` stored in both ScoredTrack and group key | Removed from ScoredTrack, stored only in `LrclibGroup.key` |
| **Duration guardrail** | Hard ±10s could still allow bad matches | Added `max(30s, 25% of song length)` guardrail |
| **Artist verification** | No double-check after index match | Added `compute_artist_similarity()` with 0.3 threshold |
| **Popularity overweight** | `pop/5` = 0-20 points could override other signals | Reduced to `pop/10` = 0-10 points |

### Edge Cases to Test

1. **Generic titles**: "Home", "Intro", "Interlude" — require strong artist match
2. **Compilation/remaster**: Same song on multiple albums — prefer studio version
3. **Multi-artist tracks**: "Artist feat. Other" — ensure consistent normalization
4. **Popularity 0**: Consciously excluded (pop ≥ 1 filter) — acceptable trade-off
5. **Severe mojibake**: Some titles unrecoverable — will appear in failure logs

### Validation Checklist

- [ ] Verify Type O Negative "Love You to Death" matches after extraction
- [ ] Confirm 0 tracks with `title_norm GLOB '[0-9]* - *'` in output
- [ ] Check match rate ≥ 65% globally
- [ ] Check match rate ≥ 85% for Spotify Top 10k
- [ ] Verify failure log size < 100 MB
- [ ] Confirm peak memory < 3 GB during extraction

### Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Silent matching failure | Add counters for Spotify tracks hitting LRCLIB groups |
| Cross-artist false positives | Artist similarity threshold (0.3) + artist score component |
| Memory overshoot | Don't load lyrics content, don't duplicate normalized strings |
| Log volume explosion | Only log high-quality tracks (quality ≥ 30), cap at 500K entries |

---

## Appendix A: File Locations

| File | Path | Size |
|------|------|------|
| LRCLIB dump | `/Users/hmemcpy/git/music/lrclib-db-dump-20251209T092057Z.sqlite3` | 77 GB |
| Spotify clean | `/Users/hmemcpy/git/music/spotify_clean.sqlite3` | 125 GB |
| Spotify audio features | `/Users/hmemcpy/git/music/spotify_clean_audio_features.sqlite3` | 41 GB |
| Current output | `/Users/hmemcpy/git/music/lrclib-spotify-db.sqlite3` | 941 MB |
| Extraction tool | `/Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract/` | — |

## Appendix B: Quick Reference

### Normalization Order

1. Strip track number prefix: `^\d{1,4}\s*[-–—._]\s*`
2. Strip artist prefix: `^{artist}\s*[-–—:]\s*`
3. Apply existing TITLE_PATTERNS (remaster, live, feat, etc.)
4. Strip mojibake: `[\uFFFD]+$`
5. Normalize punctuation: curly quotes → straight
6. NFKD decomposition + strip combining marks
7. Lowercase + trim

### Combined Scoring Formula

```
score = duration_score(±30s graduated)
      + lrclib_quality(-50 to +80)
      + clean_title_bonus(0 or +30)
      + spotify_popularity(0-20)
```

Accept if `score ≥ 50` (typical good match: 100-200).
