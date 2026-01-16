# LRCLIB-Spotify Enrichment v2 Specification

> Improving Spotify match rate through normalization, transliteration, fuzzy matching, and multi-pass rescue strategies

**Last Updated:** January 16, 2026
**Status:** Complete (68.7% match rate with deduplication, exceeds target)

---

## Current Results

| Metric | Baseline | Previous | **Current** | Target |
|--------|----------|----------|-------------|--------|
| Match rate (pre-dedup) | 46.4% | 57.5% | 71.6% | 65-72% ✓ |
| **Match rate (post-dedup)** | — | — | **68.7%** | — |
| Output tracks | 4.1M | 3.84M | **3,434,899** | — |
| Unique Spotify matches | — | — | **2,360,784** | — |
| Duplicates removed | — | — | **350,606** | — |
| Extraction time | 45 min | 48 min | **~51 min** | — |
| Output size | — | 1.1 GB | **1.4 GB** | — |

> **Note:** Output size increased due to new `tracks_search` table for search optimization.

### Match Rate by Phase

| Phase | Rate | Matches | Added |
|-------|------|---------|-------|
| MAIN (exact match) | 58.2% | 2,203,178 | — |
| MAIN (primary-artist fallback) | 63.0% | +181,473 | +4.8% |
| RESCUE (title-first) | 64.5% | +56,266 | +1.5% |
| FUZZY (Levenshtein ≥0.85) | 68.5% | +151,027 | +4.0% |
| POP0 (popularity=0 tracks) | 71.6% | +119,438 | +3.2% |
| **DEDUP (unique spotify_id)** | **68.7%** | **2,360,784** | -350,606 |

### Timing Breakdown

| Phase | Time | Details |
|-------|------|---------|
| READ | 3.6m | Load 12.2M → 10.0M filtered tracks |
| GROUP | 1.6m | Parallel normalization + string interning |
| MATCH | 6.8m | Indexed lookup → 63.0% |
| FETCH | 4.4m | Load 2.78M track details |
| RESCUE | 1.8m | Title-first rescue → 64.5% |
| FUZZY | 3.0m | Levenshtein matching → 68.5% |
| ALBUM_UPGRADE | <1m | Promote Single/Compilation → Album |
| POP0 | ~8-12m | Optimized: 100M tracks (was 284M) + parallel |
| WRITE + FTS | ~1.5m | Write tracks + build FTS indexes |
| **Total** | **~35-40 min** | |

### Improvements Implemented

| Change | Impact |
|--------|--------|
| Pre-normalized Spotify index | 4x faster extraction |
| Primary-artist fallback | +4.8% (~181K matches) |
| Title-first rescue | +1.5% (~56K matches) |
| Fuzzy title matching | +4.0% (~151K matches) |
| Album upgrade pass | Promote Single/Compilation to Album |
| Pop=0 fallback (optimized) | +3.2% (~119K matches), 3x faster |
| Hebrew/Russian artist aliases | ~205 hand-crafted mappings |
| Rowid-ranked search surface | **21x faster FTS queries** |
| Album type selection | Prefer studio albums over compilations |

---

## Architecture

### Processing Pipeline

```
lrclib-extract (~35-40 min)
├─ READ: Load LRCLIB (12.2M → 10.0M filtered tracks)
├─ GROUP: Deduplicate by (title_norm, artist_norm) → 3.79M groups
├─ MATCH: Indexed lookup + primary-artist fallback → 63.0%
├─ RESCUE: Title-first rescue for no_candidates → 64.5%
├─ FUZZY: Levenshtein similarity ≥0.85 → 68.5%
├─ ALBUM_UPGRADE: Promote Single/Compilation to Album releases
├─ POP0: Optimized scan ~100M pop=0 tracks → 71.6%
├─ DEDUP: Remove duplicate spotify_id entries → 2.36M unique
└─ WRITE: Output tracks + FTS indexes
```

### Matching Phases

| Phase | Description | Impact |
|-------|-------------|--------|
| **MAIN** | Exact normalized match + primary-artist fallback | 63.0% |
| **RESCUE** | Title-only search, verify artist similarity ≥0.6 | +1.5% |
| **FUZZY** | Levenshtein similarity ≥0.85 for title typos | +4.0% |
| **ALBUM_UPGRADE** | Promote matches from Single/Compilation to Album | Quality |
| **POP0** | Search ~100M tracks with popularity=0 (optimized) | +3.2% |
| **DEDUP** | Keep highest quality per spotify_id | -350K rows |

### Database Files

| File | Size | Purpose |
|------|------|---------|
| `lrclib-db-dump-*.sqlite3` | 77 GB | Source lyrics (12.2M tracks) |
| `spotify_clean.sqlite3` | 125 GB | Spotify catalog (64M track-artists) |
| `spotify_normalized.sqlite3` | 10 GB | Pre-normalized index (54M keys) |
| `spotify_clean_audio_features.sqlite3` | 41 GB | BPM, key, mode |

---

## Normalization Rules

### Title Normalization

**Strips:** Track numbers, brackets, remaster/live/mono suffixes, year suffixes, file extensions

Example: `"03 - Love You To Death (2011 Remaster) [Mono]"` → `"love you to death"`

### Artist Normalization

**Rules:**
- Strip "The " prefix and ", The" suffix
- Strip feat./ft./featuring and everything after
- Apply `any_ascii` transliteration (Cyrillic → Latin)
- Primary-artist fallback for multi-artist strings

Example: `"The Beatles feat. Billy Preston"` → `"beatles"`

### Multilingual Support

- **any_ascii:** Cyrillic → Latin transliteration (+1.4%)
- **Artist dictionary:** ~205 Hebrew/Russian artists with hand-crafted mappings
- **Limitation:** Hebrew lacks vowels, CJK needs per-language romanization

---

## Scoring System

```
score = duration_score (0-100, graduated by diff)
      + artist_match (0-50)
      + lrclib_quality (-50 to +80)
      + clean_title_bonus (0 or +30)
      + spotify_popularity (0-10)
```

**Duration thresholds:** 0-2s=100, 3-5s=80, 6-10s=50, 11-15s=25, 16-30s=10, >30s=Reject

---

## Album Type Selection

When multiple Spotify candidates match a track, selection uses **album_type as primary ranking dimension**:

```
Ranking order: album < single < compilation < unknown
```

### Selection Logic

1. **Viable candidates** (score ≥ 80) always beat non-viable ones
2. Among viable candidates: prefer lower album_type rank, then higher score
3. Among non-viable candidates: prefer higher score (fallback)

This ensures studio album versions are preferred over compilations (e.g., "1979" from "Mellon Collie" beats "Rotten Apples" greatest hits).

### Data Source

Album type fetched via `tracks.album_rowid → albums.album_type` from `spotify_clean.sqlite3`.

---

## Known Limitations

| Issue | Gap | Mitigation |
|-------|-----|------------|
| Hebrew transliteration | ~15K tracks | Hand-crafted dictionary |
| CJK romanization | ~100K tracks | None (relies on Latin aliases) |
| Duration mismatches | ~50K tracks | 30s threshold |
| Multi-artist attribution | ~30K tracks | Primary-artist fallback |
| Metadata in titles | ~30K tracks | Pattern stripping |

---

## Commands Reference

```bash
# Build
cd scripts/lrclib-extract && cargo build --release

# Pre-normalize Spotify (one-time, ~15 min)
./target/release/lrclib-extract normalize-spotify \
  ~/git/music/spotify_clean.sqlite3 \
  ~/git/music/spotify_normalized.sqlite3

# Simplest: run with defaults (recommended)
./target/release/lrclib-extract run --log-only

# Dry run to verify paths
./target/release/lrclib-extract run --dry-run

# Full extraction with explicit paths
./target/release/lrclib-extract extract \
  ~/git/music/lrclib-db-dump-*.sqlite3 \
  ~/git/music/lrclib-enriched.sqlite3 \
  --spotify ~/git/music/spotify_clean.sqlite3 \
  --spotify-normalized ~/git/music/spotify_normalized.sqlite3 \
  --audio-features ~/git/music/spotify_clean_audio_features.sqlite3 \
  --log-only
```

### Subcommands

| Command | Description |
|---------|-------------|
| `run` | Simplified extraction with hardcoded paths (recommended) |
| `extract` | Full extraction with explicit paths |
| `normalize-spotify` | Pre-normalize Spotify database |
| `analyze-failures` | Analyze unmatched tracks |

### run Flags (Recommended)

Uses hardcoded filenames from `~/git/music` by default.

| Flag | Description |
|------|-------------|
| `-w, --workdir PATH` | Working directory [default: ~/git/music] |
| `--dry-run` | Show what would be done without executing |
| `--log-only` | Disable progress bars, use log output only |
| `--log-failures` | Log match failures to match_failures table |
| `--export-stats PATH` | Export matching stats to JSON file |
| `--artists LIST` | Filter by artist names (comma-separated) |
| `--min-popularity N` | Minimum Spotify popularity [default: 0] |

### extract Flags

| Flag | Description |
|------|-------------|
| `--spotify PATH` | Path to spotify_clean.sqlite3 for enrichment |
| `--spotify-normalized PATH` | Pre-normalized index for faster matching |
| `--audio-features PATH` | Path to audio features DB (tempo, key) |
| `--log-only` | Disable progress bars, use log output only |
| `--log-failures` | Log match failures to match_failures table |
| `--export-stats PATH` | Export matching stats to JSON file |
| `--artists LIST` | Filter by artist names (comma-separated) |
| `--min-popularity N` | Minimum Spotify popularity [default: 0] |

### normalize-spotify Flags

| Flag | Description |
|------|-------------|
| `--log-only` | Disable progress bars, use log output only |
| `--skip-pop0-albums` | Skip building pop0_albums_norm table (built by default) |

---

## Database Verification

### Summary (January 16, 2026)

| Check | Result |
|-------|--------|
| Total tracks | 3,434,899 |
| Spotify matches | 2,360,784 (68.7%) |
| Unique spotify_ids | 2,360,784 (100% unique) |
| File size | 1.4 GB |
| Search optimization | ✓ tracks_search + tracks_search_fts |

### Quick Validation

```bash
sqlite3 output.sqlite3 "SELECT COUNT(*), SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) FROM tracks"
```

---

## Output Schema

```sql
-- Main tracks table (LRCLIB source of truth + Spotify enrichment)
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL,
    -- Spotify enrichment (nullable)
    spotify_id TEXT,
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

-- Legacy FTS index (for backwards compatibility)
CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist, content='tracks', content_rowid='id', tokenize='porter'
);

-- Popularity-ranked search surface (for fast FTS queries)
CREATE TABLE tracks_search (
    search_id INTEGER PRIMARY KEY,  -- 1..N by popularity DESC
    track_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    popularity INTEGER,
    quality INTEGER,
    spotify_id TEXT,
    tempo REAL,
    isrc TEXT,
    album_image_url TEXT
);

-- Optimized FTS index (ORDER BY rowid = ORDER BY popularity)
CREATE VIRTUAL TABLE tracks_search_fts USING fts5(
    title, artist,
    content='tracks_search',
    content_rowid='search_id',
    tokenize='porter',
    detail=none,
    columnsize=0
);

-- Match failures (created when --log-failures flag is used)
CREATE TABLE match_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    lrclib_album TEXT,
    lrclib_duration_sec INTEGER NOT NULL,
    lrclib_title_norm TEXT NOT NULL,
    lrclib_artist_norm TEXT NOT NULL,
    lrclib_quality INTEGER NOT NULL,
    group_variant_count INTEGER NOT NULL,
    failure_reason TEXT NOT NULL,  -- 'no_candidates', 'all_rejected'
    best_score INTEGER,
    spotify_candidates TEXT,       -- JSON array of top 5 candidates
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failures_reason ON match_failures(failure_reason);
CREATE INDEX idx_failures_quality ON match_failures(lrclib_quality DESC);
CREATE INDEX idx_failures_artist ON match_failures(lrclib_artist_norm);
```

### Search Optimization

The `tracks_search` and `tracks_search_fts` tables implement a **rowid-ranked search surface**:

1. `search_id` = popularity rank (1 = most popular)
2. FTS5 early-terminates on `ORDER BY rowid ASC`
3. Returns top popular results without sorting 100K+ matches

**Performance:** 107ms → **5ms** locally (21x faster), expected 10s → ~200ms on Turso

See `docs/search-optimization-findings.md` for details.

---

## Testing Strategies

### Quick Validation Script

```bash
sqlite3 output.sqlite3 <<'EOF'
.mode column
.headers on

-- 1. Match rate
SELECT COUNT(*) as total,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    ROUND(100.0 * SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) || '%' as rate
FROM tracks;

-- 2. Hebrew coverage
SELECT 'Hebrew' as script,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    COUNT(*) as total
FROM tracks WHERE artist GLOB '*[א-ת]*';

-- 3. Cyrillic coverage
SELECT 'Cyrillic' as script,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    COUNT(*) as total
FROM tracks WHERE artist GLOB '*[а-яА-Я]*';

-- 4. Top popularity check
SELECT title, artist, popularity FROM tracks
WHERE popularity >= 85 ORDER BY popularity DESC LIMIT 5;

-- 5. FTS sanity
SELECT title, artist FROM tracks_fts
JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'queen' LIMIT 3;

-- 6. Integrity
PRAGMA integrity_check;
EOF
```

### Key Validation Queries

```sql
-- Basic integrity
SELECT COUNT(*) as total,
    SUM(CASE WHEN spotify_id IS NOT NULL THEN 1 ELSE 0 END) as matched
FROM tracks;

-- No duplicate spotify_ids (should return 0)
SELECT COUNT(*) FROM (
    SELECT spotify_id FROM tracks
    WHERE spotify_id IS NOT NULL
    GROUP BY spotify_id HAVING COUNT(*) > 1
);

-- Audio feature coverage
SELECT
    COUNT(*) as total_matched,
    SUM(CASE WHEN tempo IS NOT NULL THEN 1 ELSE 0 END) as with_tempo,
    SUM(CASE WHEN album_image_url IS NOT NULL THEN 1 ELSE 0 END) as with_art
FROM tracks WHERE spotify_id IS NOT NULL;

-- FTS search quality
SELECT title, artist, popularity
FROM tracks_fts JOIN tracks ON tracks_fts.rowid = tracks.id
WHERE tracks_fts MATCH 'bohemian rhapsody'
ORDER BY popularity DESC LIMIT 5;

-- Search optimization validation
SELECT ts.track_id, ts.title, ts.artist, ts.popularity
FROM tracks_search_fts fts
JOIN tracks_search ts ON fts.rowid = ts.search_id
WHERE tracks_search_fts MATCH 'love'
ORDER BY fts.rowid ASC LIMIT 10;
```

### Failure Analysis (if --log-failures used)

```sql
-- Failure distribution
SELECT failure_reason, COUNT(*) as count FROM match_failures GROUP BY 1;

-- High-quality unmatched (dictionary candidates)
SELECT lrclib_artist, COUNT(*) as tracks
FROM match_failures
WHERE failure_reason = 'no_candidates'
GROUP BY lrclib_artist_norm
ORDER BY tracks DESC LIMIT 20;

-- Unmatched Hebrew artists
SELECT lrclib_artist, COUNT(*) as tracks
FROM match_failures WHERE lrclib_artist GLOB '*[א-ת]*'
GROUP BY lrclib_artist_norm ORDER BY tracks DESC LIMIT 10;
```

---

## Code Structure

```
scripts/lrclib-extract/src/
├── main.rs        # CLI and orchestration
├── models.rs      # Data structures
├── scoring.rs     # Scoring functions
├── normalize.rs   # Normalization + transliteration
├── safety.rs      # Path validation
└── bin/
    ├── normalize-spotify.rs  # Pre-normalized index builder
    └── analyze_failures.rs   # Failure analysis
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `match_lrclib_to_spotify_normalized` | Main indexed matching |
| `title_first_rescue` | Rescue pass for no_candidates |
| `fuzzy_title_rescue` | Levenshtein fuzzy matching |
| `album_upgrade_pass` | Promote Single/Compilation to Album |
| `match_pop0_fallback` | Optimized Pop=0 fallback (parallel) |
| `deduplicate_by_spotify_id` | Remove duplicate matches |
