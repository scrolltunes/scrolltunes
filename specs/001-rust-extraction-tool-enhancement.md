# Spec 001: Rust Extraction Tool Enhancement

## Overview

Enhance the `lrclib-extract` Rust tool to optionally enrich LRCLIB tracks with Spotify metadata from Anna's Archive dumps.

## Context

- **Source file**: `scripts/lrclib-extract/src/main.rs`
- **Current functionality**: Reads LRCLIB SQLite dump, deduplicates by normalized (title, artist), outputs FTS5-indexed SQLite
- **Current output**: ~4.2M canonical tracks with `id, title, artist, album, duration_sec, title_norm, artist_norm, quality`

## Requirements

### 1.1 CLI Arguments

Add new command-line arguments:

```rust
#[derive(Parser)]
struct Args {
    // ... existing args ...

    /// Path to spotify_clean.sqlite3 (optional, for enrichment)
    #[arg(long)]
    spotify: Option<PathBuf>,

    /// Path to spotify_clean_audio_features.sqlite3 (optional, requires --spotify)
    #[arg(long)]
    audio_features: Option<PathBuf>,

    /// Minimum Spotify popularity to include in lookup index (0-100)
    #[arg(long, default_value = "1")]
    min_popularity: i32,
}
```

### 1.2 Spotify Track Loading

Load Spotify tracks into a HashMap for O(1) lookup:

- **Key**: `(title_norm, artist_norm)` - same normalization as LRCLIB
- **Value**: `Vec<SpotifyTrack>` - multiple versions with same normalized name
- **Filter**: Only tracks with `popularity >= min_popularity` (default 1)
- **Expected size**: ~50M tracks at popularity >= 1

```rust
struct SpotifyTrack {
    rowid: i64,              // For joining with audio_features
    id: String,              // Spotify track ID
    name: String,            // Original title
    artist: String,          // Primary artist
    duration_ms: i64,
    popularity: i32,         // 0-100
    isrc: Option<String>,    // For Deezer album art lookup
    album_rowid: i64,        // For album_images lookup
}
```

**SQL for loading** (join tracks + track_artists + artists):
```sql
SELECT t.rowid, t.id, t.name, a.name as artist_name, t.duration_ms,
       t.popularity, t.isrc, t.album_rowid
FROM tracks t
JOIN track_artists ta ON ta.track_rowid = t.rowid AND ta.position = 0
JOIN artists a ON a.rowid = ta.artist_rowid
WHERE t.popularity >= ?
```

### 1.3 Audio Features Loading

Load audio features into HashMap by `track_rowid`:

```rust
struct AudioFeatures {
    tempo: Option<f64>,           // BPM
    key: Option<i32>,             // -1 to 11 (pitch class)
    mode: Option<i32>,            // 0=minor, 1=major
    time_signature: Option<i32>,  // 3-7
}
```

### 1.4 Album Images Loading

Load medium-size (~300px) album images by `album_rowid`:

```sql
SELECT album_rowid, url
FROM album_images
WHERE height BETWEEN 250 AND 350
ORDER BY album_rowid, ABS(height - 300)
```

Keep only first (closest to 300px) per album.

### 1.5 Matching Algorithm

For each canonical LRCLIB track:
1. Look up `(title_norm, artist_norm)` in Spotify HashMap
2. Filter candidates by duration proximity (±10 seconds)
3. Select highest popularity among matches
4. If no match, leave Spotify fields as `None`

```rust
fn match_to_spotify<'a>(
    lrclib: &ScoredTrack,
    spotify_lookup: &'a HashMap<(String, String), Vec<SpotifyTrack>>,
) -> Option<&'a SpotifyTrack> {
    let key = (lrclib.title_norm.clone(), lrclib.artist_norm.clone());
    let candidates = spotify_lookup.get(&key)?;

    candidates
        .iter()
        .filter(|s| {
            let spotify_duration_sec = s.duration_ms / 1000;
            (lrclib.track.duration_sec - spotify_duration_sec).abs() <= 10
        })
        .max_by_key(|s| s.popularity)
}
```

### 1.6 Enriched Track Struct

```rust
struct EnrichedTrack {
    // LRCLIB (source of truth, always present)
    lrclib_id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,

    // Spotify enrichment (all nullable)
    spotify_id: Option<String>,
    popularity: Option<i32>,      // NULL if no match (not 0)
    tempo: Option<f64>,           // BPM
    musical_key: Option<i32>,     // 0-11, -1=unknown
    mode: Option<i32>,            // 0=minor, 1=major
    time_signature: Option<i32>,  // 3-7
    isrc: Option<String>,
    album_image_url: Option<String>,
}
```

### 1.7 Output Schema Update

```sql
CREATE TABLE tracks (
    -- LRCLIB (source of truth)
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_sec INTEGER NOT NULL,
    title_norm TEXT NOT NULL,
    artist_norm TEXT NOT NULL,
    quality INTEGER NOT NULL,

    -- Spotify enrichment (all nullable)
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

CREATE VIRTUAL TABLE tracks_fts USING fts5(
    title, artist,
    content='tracks',
    content_rowid='id',
    tokenize='porter'
);
```

### 1.8 Test Mode

Support `--artists "metallica,foo fighters"` for quick iteration:
- Only process tracks matching specified artists
- Validates matching logic without full 4.2M extraction

## Acceptance Criteria

1. Running without `--spotify` produces identical output to current tool
2. Running with `--spotify` adds enrichment columns (nullable)
3. Match rate logged at end: "Enriched X tracks (Y% with Spotify match)"
4. Test search shows enrichment data: `[ID] Artist - Title (Album) [Xs] quality=Q tempo=T key=K`
5. Memory usage stays under 8GB for full extraction
6. Extraction completes in <20 minutes on modern hardware

## Files to Modify

- `scripts/lrclib-extract/src/main.rs` - Main implementation
- `scripts/lrclib-extract/Cargo.toml` - No new dependencies needed (rusqlite already included)

## Testing

```bash
# Test with limited artists
cd scripts/lrclib-extract && cargo build --release
./target/release/lrclib-extract \
  /path/to/lrclib.sqlite3 \
  /tmp/test-output.sqlite3 \
  --spotify /path/to/spotify_clean.sqlite3 \
  --audio-features /path/to/spotify_clean_audio_features.sqlite3 \
  --artists "metallica,foo fighters" \
  --test "everlong foo fighters"

# Verify enrichment columns
sqlite3 /tmp/test-output.sqlite3 "SELECT spotify_id, tempo, popularity FROM tracks LIMIT 5"
```
