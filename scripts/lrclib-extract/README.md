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
4. **Group** — Deduplicate by normalized (title, artist)
5. **Match** — Query pre-normalized Spotify index for each group
6. **Score** — Combined scoring: duration, artist similarity, quality, popularity
7. **Enrich** — Load audio features (BPM, key) and album images
8. **Write** — Output with FTS5 index and failure logs

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
- Strip feat./ft./featuring
- Fold diacritics
- Transliterate Cyrillic/Hebrew artists

## Performance

| Metric | Value |
|--------|-------|
| LRCLIB tracks | ~10M |
| Unique groups | ~4M |
| Spotify match rate | ~49% |
| Extraction time | ~20 min (with pre-normalized Spotify) |
| Output size | ~1.2 GB |
