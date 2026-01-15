# lrclib-extract

Rust CLI tool for extracting a deduplicated LRCLIB search index with optional Spotify enrichment.

## Features

- Parallel processing with rayon
- Progress bars with ETA (or `--log-only` for background runs)
- FTS5 full-text search index
- Quality scoring to select best version of each song
- Spotify enrichment: BPM, popularity, album art, musical key
- Pre-normalized Spotify index for fast matching (~20 min for 4M tracks)

## Build

```bash
cd /Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract
cargo build --release
```

## Binaries

### lrclib-extract

Main extraction tool.

```bash
./target/release/lrclib-extract <source.sqlite3> <output.sqlite3> [OPTIONS]
```

### normalize-spotify

Pre-normalizes Spotify database for faster extraction (creates indexed lookup table).

```bash
./target/release/normalize-spotify [--log-only] <spotify_clean.sqlite3> [output.sqlite3]
```

## Options

| Option | Description |
|--------|-------------|
| `--spotify PATH` | Path to spotify_clean.sqlite3 for enrichment |
| `--spotify-normalized PATH` | Pre-normalized Spotify index (much faster) |
| `--audio-features PATH` | Path to spotify_clean_audio_features.sqlite3 |
| `--min-popularity N` | Minimum Spotify popularity (default: 1) |
| `--workers N` | Number of parallel workers (default: all CPUs) |
| `--artists LIST` | Filter by artist names (comma-separated) |
| `--log-only` | Disable progress bars, use log output only |
| `--test QUERY` | Run a test search after extraction |

## Examples

```bash
# Basic extraction (no Spotify)
./target/release/lrclib-extract lrclib-dump.sqlite3 output.sqlite3

# Full extraction with Spotify enrichment (recommended)
./target/release/lrclib-extract \
  lrclib-dump.sqlite3 \
  output.sqlite3 \
  --spotify spotify_clean.sqlite3 \
  --spotify-normalized spotify_normalized.sqlite3 \
  --audio-features spotify_clean_audio_features.sqlite3

# Background run with log output
./target/release/lrclib-extract \
  lrclib-dump.sqlite3 output.sqlite3 \
  --spotify spotify_clean.sqlite3 \
  --spotify-normalized spotify_normalized.sqlite3 \
  --log-only \
  > extraction.log 2>&1 &
tail -f extraction.log
```

## Pre-normalization (Recommended)

For faster extraction, pre-normalize the Spotify database once:

```bash
./target/release/normalize-spotify \
  spotify_clean.sqlite3 \
  spotify_normalized.sqlite3
```

This creates a ~5GB indexed lookup table with 54M unique (title, artist) keys.
Extraction with pre-normalized DB: ~20 minutes (vs ~90 minutes without).

## Output Schema

```sql
CREATE TABLE tracks (
    -- LRCLIB (source of truth, always present)
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL,

    -- Spotify enrichment (nullable, NULL = no match)
    spotify_id TEXT,
    popularity INTEGER,
    tempo REAL,
    musical_key INTEGER,
    mode INTEGER,
    time_signature INTEGER,
    isrc TEXT,
    album_image_url TEXT
);

CREATE TABLE match_failures (
    -- For post-hoc analysis of unmatched tracks
    id INTEGER PRIMARY KEY,
    lrclib_id INTEGER NOT NULL,
    lrclib_title TEXT NOT NULL,
    lrclib_artist TEXT NOT NULL,
    failure_reason TEXT NOT NULL,  -- 'no_candidates', 'all_rejected', 'low_confidence'
    spotify_candidates TEXT,       -- JSON array of top 5 candidates
    ...
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```

## Processing Pipeline

1. **Read** — Load LRCLIB tracks with synced lyrics (45s < duration < 600s)
2. **Filter** — Remove garbage albums (karaoke, tribute, etc.)
3. **Normalize** — Strip remaster/live/feat suffixes, "The " prefix from artists
4. **Group** — Deduplicate by normalized (title, artist) with parallel processing
5. **Match** — Query pre-normalized Spotify index (exact + primary-artist fallback)
6. **Rescue** — Title-first rescue for unmatched groups (different artist spellings)
7. **Fuzzy** — Levenshtein similarity matching (≥0.85) for remaining groups
8. **POP0** — Search 284M popularity=0 tracks for obscure matches
9. **Score** — Combined scoring: duration, artist similarity, quality, popularity
10. **Enrich** — Load audio features (BPM, key) and album images
11. **Write** — Output with FTS5 index and failure logs

## Normalization Rules

**Titles:**
- Strip track number prefixes: "03 - Song" → "Song"
- Strip bracket suffixes: "Song [Mono]" → "Song"
- Strip year suffixes: "Song (1964)" → "Song"
- Strip remaster/live/remix tags
- Strip file extensions: "Song.mp3" → "Song"
- Fold diacritics: "Beyoncé" → "beyonce"

**Artists:**
- Strip "The " prefix: "The Beatles" → "beatles"
- Strip ", The" suffix: "Scorpions, The" → "scorpions"
- Strip feat./ft./featuring
- Fold diacritics + `any_ascii` transliteration
- Cyrillic → Latin: "Кино" → "kino"

## Performance (2025-01-15 run)

| Metric | Value |
|--------|-------|
| LRCLIB input | 12.2M tracks |
| After filtering | 10.0M tracks |
| Unique groups | 3.79M |
| Spotify match rate | **71.6%** (2.71M matches) |
| Extraction time | ~48 min |
| Output size | 1.08 GB |

### Timing Breakdown

| Phase | Time | Details |
|-------|------|---------|
| READ | 1.9m | Load 12.2M → 10.0M filtered tracks |
| GROUP | 1.6m | Parallel normalization (1.5m) + interning (4.8s) |
| MATCH | 5.1m | Indexed lookup → 63.0% (2.46M candidates) |
| FETCH | 2.6m | Load 2.78M track details |
| RESCUE | 1.8m | Title-first rescue → 64.5% (+56K) |
| FUZZY | 3.1m | Streaming (1.9m) + Levenshtein (55s) → 68.5% (+151K) |
| POP0 | 29.1m | Stream 284M pop=0 rows → 68.3% (+119K) |
| AUDIO/IMAGES | ~1m | Load BPM, key, album art |
| WRITE | 1.0m | Write 3.79M tracks + failures |
| FTS | 8.5s | Build full-text search index |
| OPTIMIZE | 4.1s | SQLite ANALYZE |
| **Total** | **47.6m** | |

### Match Rate by Phase

| Phase | Rate | Matches | Added |
|-------|------|---------|-------|
| MAIN (exact) | 58.2% | 2,203,178 | - |
| MAIN (primary-artist fallback) | 63.0% | +181,473 | +4.8% |
| RESCUE (title-first) | 64.5% | +56,266 | +1.5% |
| FUZZY (Levenshtein ≥0.85) | 68.5% | +151,027 | +4.0% |
| POP0 (pop=0 tracks) | 68.3%* | +119,438 | +3.2% |
| **Final (after scoring)** | **71.6%** | **2,711,382** | |

*POP0 shows 68.3% but final includes additional matches from multi-duration scoring.

## Match Rate Improvements

| Change | Impact |
|--------|--------|
| Pre-normalized Spotify index | 4x faster matching |
| Primary-artist fallback | +4.8% (splits "Artist1, Artist2") |
| Title-first rescue | +1.5% (finds different artist spellings) |
| Fuzzy title matching | +4.0% (Levenshtein ≥0.85 similarity) |
| POP0 fallback | +3.2% (searches 284M unpopular tracks) |
| Track number stripping | +1-2% |
| "The" prefix/suffix handling | +0.4% |
| `any_ascii` transliteration | +1.4% (Cyrillic → Latin) |

## Optimizations Applied

### FUZZY Phase
- **Streaming approach**: Reads 54M normalized pairs once, filters in memory
- **Parallel Levenshtein**: Uses rayon for similarity computation
- Original batch IN queries were slower due to SQLite optimizer limitations

### POP0 Phase
- **Title-only pre-filter**: HashSet of 859K unique titles
- Skips `normalize_artist()` for rows where title doesn't match
- Reduces artist normalization calls by ~75%

### GROUP Phase
- **Parallel normalization**: Uses rayon `par_iter` for 10M tracks
- **String interning**: `Arc<str>` deduplication saves ~8.6M allocations

### normalize-spotify Binary
- **Batch size**: 6000 rows per INSERT (near SQLite's 32766 param limit)
- **Pre-built SQL**: Single statement reused for all batches
- **Sorted writes**: Sequential B-tree inserts
- **INSERT OR IGNORE**: SQLite handles duplicates
- Result: ~15 min (was ~90 min)
