# Spec 03: Multi-Artist Verification

> Score LRCLIB artist against all credited Spotify artists, not just one

## Problem Statement

Current artist verification compares LRCLIB `artist_norm` against a single Spotify artist string. This causes false rejects when:

1. Spotify track has multiple credited artists
2. The indexed artist differs from the one selected in detail fetch
3. Artist order differs between LRCLIB and Spotify

**Example:**
- LRCLIB: "Dua Lipa" (artist), "Cold Heart" (title)
- Spotify: "Elton John, Dua Lipa" (multiple artists)
- Current: Fetches "Elton John" as primary, rejects because "dua lipa" != "elton john"

## Requirements

### R3.1: Fetch All Artists Per Track

Extend `batch_fetch_track_details()` to return all credited artists:

```rust
struct TrackDetails {
    track_id: String,
    title: String,
    duration_ms: i32,
    popularity: i32,
    album_rowid: Option<i64>,
    isrc: Option<String>,
    // NEW: all credited artists
    artists: Vec<ArtistInfo>,
}

struct ArtistInfo {
    artist_id: String,
    artist_name: String,
    // Optional: role if available from track_files
    role: Option<String>,  // "main", "featured", "remixer"
}
```

### R3.2: Multi-Artist Scoring

Replace single-artist comparison with max-over-artists:

```rust
// OLD
fn artist_score(lrclib_artist_norm: &str, spotify_artist: &str) -> i32 {
    let spotify_norm = normalize_artist(spotify_artist);
    if lrclib_artist_norm == spotify_norm { 50 } else { 0 }
}

// NEW
fn artist_score(lrclib_artist_norm: &str, artists: &[ArtistInfo]) -> i32 {
    artists.iter()
        .map(|a| {
            let norm = normalize_artist(&a.artist_name);
            let base_score = if lrclib_artist_norm == norm { 50 } else { 0 };
            // Optional: weight by role
            let role_weight = match a.role.as_deref() {
                Some("main") => 1.0,
                Some("featured") => 0.8,
                Some("remixer") => 0.5,
                _ => 1.0,
            };
            (base_score as f32 * role_weight) as i32
        })
        .max()
        .unwrap_or(0)
}
```

### R3.3: Batch Query for Artists

Efficiently fetch all artists for a batch of tracks:

```sql
SELECT ta.track_id, ta.artist_id, a.name as artist_name
FROM track_artists ta
JOIN artists a ON ta.artist_id = a.id
WHERE ta.track_id IN (?, ?, ?, ...)
ORDER BY ta.track_id, ta.artist_order
```

### R3.4: Primary Artist Fallback Enhancement

When LRCLIB has multi-artist string, try matching against any Spotify artist:

```rust
fn matches_any_artist(lrclib_artists: &str, spotify_artists: &[ArtistInfo]) -> bool {
    // Extract all artists from LRCLIB string
    let lrclib_parts = split_artists(lrclib_artists);  // "A & B" -> ["a", "b"]

    // Check if any LRCLIB artist matches any Spotify artist
    for lrclib_norm in lrclib_parts {
        for spotify in spotify_artists {
            if lrclib_norm == normalize_artist(&spotify.artist_name) {
                return true;
            }
        }
    }
    false
}
```

## Implementation Notes

### SQL Query for Artist Fetch

```sql
-- Batch fetch all artists for multiple tracks
SELECT
    ta.track_id,
    a.name as artist_name,
    ta.artist_order
FROM track_artists ta
JOIN artists a ON ta.artist_id = a.id
WHERE ta.track_id IN (SELECT value FROM json_each(?))
ORDER BY ta.track_id, ta.artist_order
```

### Data Structure Changes

```rust
// In main.rs, modify TrackCandidate
struct TrackCandidate {
    track_rowid: i64,
    track_id: String,
    title: String,
    duration_ms: i32,
    popularity: i32,
    album_rowid: Option<i64>,
    isrc: Option<String>,
    // NEW
    artist_names: Vec<String>,
}

// Group scoring
fn score_candidate(group: &Group, candidate: &TrackCandidate) -> i32 {
    let duration_score = score_duration(group.duration_sec, candidate.duration_ms);
    let artist_score = score_artist_match(&group.artist_norm, &candidate.artist_names);
    let quality_score = group.lrclib_quality;
    // ... rest of scoring
    duration_score + artist_score + quality_score
}
```

### Memory Consideration

For 2M+ candidate tracks, storing all artist names adds ~20-40 bytes per track average:
- Estimated additional memory: 40-80 MB
- Acceptable for current pipeline

## Acceptance Criteria

- [ ] `batch_fetch_track_details()` returns all artists per track
- [ ] Artist scoring uses max-over-artists comparison
- [ ] Collaborations with reversed artist order match correctly
- [ ] Match rate improves (target: +1-2%)
- [ ] No regression on single-artist tracks

## Dependencies

- Spec 01: Normalization Unification (for consistent artist normalization)

## Estimated Impact

- **+1-2% match rate** from correctly matching collaborations
- Reduction in false rejects for multi-artist tracks
- Better handling of "feat." and "&" collaborations
