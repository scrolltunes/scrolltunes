# lrclib-extract

Rust CLI tool for extracting a deduplicated LRCLIB search index from a SQLite dump.

## Features

- Parallel processing with rayon
- Progress bars with ETA
- FTS5 full-text search index
- Quality scoring to select best version of each song

## Build

```bash
cd /Users/hmemcpy/git/scrolltunes/scripts/lrclib-extract
cargo build --release
```

## Usage

```bash
./target/release/lrclib-extract <source.sqlite3> <output.sqlite3> [OPTIONS]
```

### Options

- `--workers N` — Number of parallel workers (default: all CPUs)
- `--test QUERY` — Run a test search after extraction

### Examples

```bash
# Basic extraction
./target/release/lrclib-extract lrclib-dump.sqlite3 lrclib-index.sqlite3

# With test search
./target/release/lrclib-extract lrclib-dump.sqlite3 lrclib-index.sqlite3 --test "bohemian rhapsody"

# Limit to 4 workers
./target/release/lrclib-extract lrclib-dump.sqlite3 lrclib-index.sqlite3 --workers 4
```

## Output Schema

The output database contains:

```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```

## Processing Pipeline

1. **Read** — Load tracks with synced lyrics (45s < duration < 600s)
2. **Filter** — Remove garbage albums (karaoke, tribute, etc.)
3. **Normalize** — Strip remaster/live/feat suffixes from titles/artists
4. **Group** — Deduplicate by normalized (title, artist)
5. **Score** — Rank versions by album type, duration proximity, quality indicators
6. **Write** — Output with FTS5 index for fast searching
