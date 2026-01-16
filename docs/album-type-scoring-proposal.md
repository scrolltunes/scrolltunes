# Album Type Scoring Proposal

> Improving Spotify match quality by preferring studio album versions over compilations

**Created:** January 16, 2026
**Status:** Proposal

---

## Problem Statement

When matching LRCLIB tracks to Spotify, we currently rank candidates primarily by popularity. This causes compilation versions to sometimes rank higher than original studio album versions, resulting in suboptimal matches.

### Example: "1979" by The Smashing Pumpkins

| spotify_id | title | popularity | album | album_type |
|------------|-------|------------|-------|------------|
| 3h5zik31hTTat9jmpCZZNC | 1979 | 58 | (Rotten Apples) Greatest Hits | **compilation** |
| 5KRRcT67VNIZUygEbMoIC1 | 1979 | 0 | Mellon Collie And The Infinite Sadness | **album** |

**Current behavior:** We match to the compilation (popularity 58) instead of the original album (popularity 0).

**Desired behavior:** Prefer the original album version from "Mellon Collie And The Infinite Sadness".

---

## Data Source

The `album_type` field exists in `spotify_clean.sqlite3` (albums table):

```sql
SELECT album_type, COUNT(*) FROM albums GROUP BY album_type;
```

| album_type | count |
|------------|-------|
| album | 10,647,787 |
| single | 46,480,163 |
| compilation | 1,463,032 |

**Join path:** `tracks.album_rowid → albums.rowid → albums.album_type`

No additional database files needed - `spotify_clean.sqlite3` already contains this data.

**Note on `spotify_normalized.sqlite3`:** The normalized lookup table (`normalize-spotify.rs`) stores only `(title_norm, artist_norm, track_rowid, popularity, duration_ms)`. It does **not** include `album_type`. This is fine because `batch_fetch_track_details` fetches full track details from `spotify_clean.sqlite3` using the `track_rowid` - that's where we add the `albums` join.

---

## Case Studies

### Case 1: "1979" by The Smashing Pumpkins ❌

```sql
SELECT t.id, t.name, t.popularity, a.name, a.album_type
FROM tracks t
JOIN albums a ON t.album_rowid = a.rowid
JOIN track_artists ta ON ta.track_rowid = t.rowid
WHERE t.name = '1979' AND ta.artist_rowid = 3460019
ORDER BY t.popularity DESC;
```

| popularity | album | type |
|------------|-------|------|
| 58 | (Rotten Apples) Greatest Hits | compilation |
| 38 | 1979 (single) | single |
| 30 | Aeroplane Flies High (Deluxe) | compilation |
| 0 | Mellon Collie And The Infinite Sadness | **album** |

**Problem:** Album version has popularity=0, compilation has 58.

### Case 2: "22" by Taylor Swift ✅

| popularity | album | type |
|------------|-------|------|
| 66 | Red (Big Machine Radio Release Special) | album |
| 58 | Red (Deluxe Edition) | album |
| 53 | Red | album |
| 0 | Now That's What I Call Music! 85 | compilation |

**OK:** Album versions already rank higher than compilations.

### Case 3: "'74-'75" by The Connells ✅

| popularity | album | type |
|------------|-------|------|
| 66 | Ring | album |
| 35 | Stone Cold Yesterday: Best Of | compilation |

**OK:** Album version ranks higher.

---

## Proposed Solutions

### Option 1: Large Album Bonus (+100)

```
score = base_score + album_type_bonus

album_type_bonus:
  album       → +100
  single      → +50
  compilation → +0
```

**"1979" result:**
- Album: 0 + 100 = **100** ✓
- Compilation: 58 + 0 = 58

**Pros:** Simple, works for extreme cases
**Cons:** May over-prioritize low-quality album tracks

### Option 2: Compilation Penalty (-60)

```
album_type_modifier:
  album       → +0
  single      → +0
  compilation → -60
```

**"1979" result:**
- Album: 0 + 0 = 0
- Compilation: 58 - 60 = **-2** ✓

**Pros:** Only affects compilations
**Cons:** Negative scores feel awkward

### Option 3: Primary Sort Key (Recommended)

Sort by album_type first, then by existing score within each type:

```
ORDER BY
  CASE album_type
    WHEN 'album' THEN 1
    WHEN 'single' THEN 2
    WHEN 'compilation' THEN 3
  END,
  score DESC
```

**"1979" result:**
- All album versions considered first → Mellon Collie selected ✓

**Pros:** Clean separation, no magic numbers
**Cons:** Ignores popularity entirely when album version exists

### Option 4: Weighted Multiplier

```
adjusted_popularity = popularity * album_type_weight

album_type_weight:
  album       → 1.5
  single      → 1.0
  compilation → 0.5
```

**"1979" result:**
- Album: 0 × 1.5 = 0
- Compilation: 58 × 0.5 = 29

**Problem:** Still doesn't help when album popularity is 0.

---

## Current Implementation

### SpotifyTrack struct (`main.rs:283-294`)

```rust
struct SpotifyTrack {
    id: String,              // Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
    name: String,            // Original title (kept for debugging)
    artist: String,          // Primary artist (kept for debugging)
    artists: Vec<String>,    // All credited artists (spec-03 multi-artist verification)
    duration_ms: i64,
    popularity: i32,         // 0-100
    isrc: Option<String>,    // For Deezer album art lookup
    album_rowid: i64,        // For album_images lookup
    // NOTE: No album_type field currently
}
```

### batch_fetch_track_details (`main.rs:2568-2624`)

```rust
fn batch_fetch_track_details(
    conn: &Connection,
    rowids: &[i64],
) -> Result<FxHashMap<i64, SpotifyTrack>> {
    // ...
    let sql = format!(
        r#"SELECT
            t.rowid,
            t.id,
            t.name,
            a.name as artist_name,
            t.duration_ms,
            t.popularity,
            t.external_id_isrc,
            t.album_rowid
        FROM tracks t
        JOIN artists a ON a.rowid = (
            SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
        )
        WHERE t.rowid IN ({})"#,
        placeholders
    );
    // NOTE: No JOIN to albums table, no album_type fetched
    // ...
}
```

### combined_score (`scoring.rs:315-412`)

```rust
pub fn combined_score(
    lrclib: &Track,
    lrclib_quality: i32,
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    // ... duration scoring, artist matching ...

    let mut score = dur_score;

    // Artist score
    let artist_score = if artist_exact { 50 } else { (artist_similarity * 30.0) as i32 };
    score += artist_score;

    // LRCLIB quality score
    score += lrclib_quality;

    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }

    // Popularity as tiebreaker only (bounded 0-10 points)
    score += spotify.popularity / 10;

    // NOTE: No album_type consideration in scoring

    score
}
```

### Existing album classification (LRCLIB-side only, `scoring.rs:97-144`)

The codebase already has album classification logic, but it's used for **LRCLIB quality scoring**, not Spotify candidate ranking:

```rust
pub enum AlbumType {
    Studio,
    Remaster,
    Deluxe,
    Compilation,
    Live,
    Soundtrack,
}

pub fn classify_album(album: &Option<String>) -> AlbumType {
    match album {
        None => AlbumType::Studio,
        Some(a) => {
            let lower = a.to_lowercase();
            if lower.contains("greatest hits") || lower.contains("best of") ... {
                AlbumType::Compilation
            } else if lower.contains("remaster") ... {
                AlbumType::Remaster
            } // ... etc
        }
    }
}
```

This classification is based on **album name heuristics**. The Spotify API provides an explicit `album_type` field which is more reliable.

---

## Implementation Requirements

### 1. Add album_type to SpotifyTrack struct

```rust
struct SpotifyTrack {
    id: String,
    name: String,
    artist: String,
    artists: Vec<String>,
    duration_ms: i64,
    popularity: i32,
    isrc: Option<String>,
    album_rowid: i64,
    album_type: String,  // ADD: "album", "single", or "compilation"
}
```

### 2. Fetch album_type in batch_fetch_track_details

```rust
let sql = format!(
    r#"SELECT
        t.rowid,
        t.id,
        t.name,
        a.name as artist_name,
        t.duration_ms,
        t.popularity,
        t.external_id_isrc,
        t.album_rowid,
        al.album_type  -- ADD THIS
    FROM tracks t
    JOIN artists a ON a.rowid = (
        SELECT MIN(artist_rowid) FROM track_artists WHERE track_rowid = t.rowid
    )
    JOIN albums al ON al.rowid = t.album_rowid  -- ADD THIS JOIN
    WHERE t.rowid IN ({})"#,
    placeholders
);
```

### 3. Update combined_score to include album_type bonus

```rust
pub fn combined_score(
    lrclib: &Track,
    lrclib_quality: i32,
    spotify: &SpotifyTrack,
    group_artist_norm: &str,
) -> i32 {
    // ... existing duration and artist scoring ...

    let mut score = dur_score;
    score += artist_score;
    score += lrclib_quality;

    // Album type bonus (NEW)
    score += match spotify.album_type.as_str() {
        "album" => 100,
        "single" => 50,
        "compilation" => 0,
        _ => 0,
    };

    // Title cleanliness bonus
    if !has_garbage_title_pattern(&lrclib.title) {
        score += 30;
    }

    // Popularity as tiebreaker (existing)
    score += spotify.popularity / 10;

    score
}
```

---

## Recommendation

**Option 1 (Large Album Bonus)** with +100 for albums is the simplest fix that solves the "1979" problem without major refactoring.

The bonus should be large enough to overcome typical popularity differences between album and compilation versions.

---

## Testing

After implementation, verify these cases:

```sql
-- Should match to album versions
('1979', 'Smashing Pumpkins') → 'Mellon Collie And The Infinite Sadness' (album)
('22', 'Taylor Swift') → 'Red' or 'Red (Deluxe)' (album)
("'74-'75", 'The Connells') → 'Ring' (album)
```
