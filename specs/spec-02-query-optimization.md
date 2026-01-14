# Spec 02: Query Optimization

## Overview

Eliminate correlated subqueries and implement batched lookups to reduce extraction time from ~45 min to ~25-30 min.

## Current State

### LRCLIB Read (Suboptimal)
```sql
SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
FROM tracks t
WHERE t.last_lyrics_id IN (SELECT id FROM lyrics WHERE has_synced_lyrics = 1)
  AND t.duration > 45 AND t.duration < 600
```
EXPLAIN: `SEARCH t + LIST SUBQUERY` (subquery executed per row)

### Spotify Streaming (Very Slow)
```sql
SELECT t.id, t.name, a.name, ...
FROM tracks t
JOIN artists a ON a.rowid = (
    SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
)
WHERE t.popularity >= ?
```
EXPLAIN: `CORRELATED SCALAR SUBQUERY` — executes 50M times!

### Audio Features (Inefficient)
Streams ALL 40M rows, filters in Rust.

### Album Images (Inefficient)
Scans entire table, filters in Rust.

## Changes Required

### 1. Optimize LRCLIB Query

```rust
fn read_lrclib_tracks(conn: &Connection) -> Result<Vec<Track>> {
    let sql = r#"
        SELECT t.id, t.name, t.artist_name, t.album_name, t.duration
        FROM lyrics l
        JOIN tracks t ON t.last_lyrics_id = l.id
        WHERE l.has_synced_lyrics = 1
          AND t.duration > 45 AND t.duration < 600
    "#;
    // ... rest unchanged
}
```

### 2. Two-Phase Spotify Streaming

**Phase A: Stream tracks only**
```rust
fn stream_spotify_tracks(
    conn: &Connection,
    min_popularity: i32,
) -> Result<Vec<SpotifyTrackPartial>> {
    let sql = r#"
        SELECT rowid, id, name, duration_ms, popularity, external_id_isrc, album_rowid
        FROM tracks
        WHERE popularity >= ?
    "#;
    // Stream and collect candidates that match title_norm
}
```

**Phase B: Batch-fetch artists**
```rust
fn batch_fetch_primary_artists(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, String>> {
    for chunk in rowids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
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
        // Execute and collect
    }
}
```

### 3. Batched Audio Features

```rust
fn load_audio_features_batched(
    conn: &Connection,
    spotify_ids: &[String],
) -> Result<FxHashMap<String, AudioFeatures>> {
    for chunk in spotify_ids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "SELECT track_id, tempo, key, mode, time_signature
             FROM track_audio_features
             WHERE track_id IN ({})",
            placeholders
        );
        // Execute and collect
    }
}
```

### 4. Batched Album Images

```rust
fn load_album_images_batched(
    conn: &Connection,
    album_rowids: &[i64],
) -> Result<FxHashMap<i64, String>> {
    for chunk in album_rowids.chunks(999) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(r#"
            SELECT album_rowid, url, height
            FROM album_images
            WHERE album_rowid IN ({})
              AND height BETWEEN 250 AND 350
            ORDER BY ABS(height - 300)
        "#, placeholders);
        // Execute, keep first per album
    }
}
```

## Data Structures

```rust
/// Partial Spotify track (before artist lookup)
struct SpotifyTrackPartial {
    rowid: i64,
    id: String,
    name: String,
    duration_ms: i64,
    popularity: i32,
    isrc: Option<String>,
    album_rowid: i64,
}

/// Full Spotify track (after artist lookup)
struct SpotifyTrack {
    // ... existing fields
    artist: String,  // Filled in Phase B
}
```

## Performance Notes

- Batch size 999 (SQLite parameter limit is 999-32766 depending on version)
- Use FxHashMap for fast lookups (no crypto overhead)
- Title-only index for initial filtering reduces artist lookups to ~10-20% of tracks

## Validation

```bash
cd scripts/lrclib-extract && cargo build --release
# Time full extraction and compare to baseline (~45 min -> ~25-30 min target)
```

## Done When

- [ ] LRCLIB query uses JOIN instead of subquery
- [ ] Spotify uses 2-phase approach (tracks, then batch artists)
- [ ] Audio features use batched IN queries
- [ ] Album images use batched IN queries
- [ ] Extraction time reduced by ~40%
