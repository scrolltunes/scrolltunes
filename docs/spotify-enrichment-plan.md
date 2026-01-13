# Spotify Metadata Enrichment Plan

> **Status: ✅ IMPLEMENTED** — See `IMPLEMENTATION_PLAN.md` for detailed specs and implementation notes.

> Integrating Anna's Archive Spotify dumps with LRCLIB for enhanced search and BPM lookup

## Source of Truth

**LRCLIB is the source of truth.** ScrollTunes is a lyrics teleprompter — without timed lyrics, a track has no value to users.

| Data | Source | Role |
|------|--------|------|
| Track identity | LRCLIB ID | Primary key in our index |
| Lyrics availability | LRCLIB | Required — no lyrics = not in index |
| Title, artist, album, duration | LRCLIB | Canonical values for display |
| BPM, popularity, key, album art | Spotify dump | Enrichment (nullable) |

**Critical principle:** We match LRCLIB → Spotify, never the reverse. A Spotify track without LRCLIB lyrics is irrelevant and never enters our index. A LRCLIB track without a Spotify match still appears in search — it just lacks enrichment metadata.

---

## Executive Summary

With access to the Spotify metadata dumps (`spotify_clean.sqlite3` + `spotify_clean_audio_features.sqlite3`), we can:

1. **Eliminate BPM provider cascade** — Spotify's `tempo` field replaces ReccoBeats/GetSongBPM/Deezer/RapidAPI
2. **Add popularity ranking to Turso** — No more Spotify API dependency for search
3. **Get Spotify IDs offline** — For album art lookups and future features
4. **Include musical key/time signature** — Already available in audio_features

---

## 1. Source Data Schemas

### 1.1 spotify_clean.sqlite3 (Inferred from API docs)

```sql
-- Main tracks table (256M rows)
CREATE TABLE tracks (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,           -- Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
  name TEXT NOT NULL,                 -- Track title
  album_rowid INTEGER,                -- FK to albums
  duration_ms INTEGER NOT NULL,
  popularity INTEGER NOT NULL,        -- 0-100, higher = more popular
  explicit BOOLEAN,

  disc_number INTEGER,
  track_number INTEGER
);

-- Track-to-artist mapping (many-to-many)
CREATE TABLE track_artists (
  track_rowid INTEGER,
  artist_rowid INTEGER,
  position INTEGER                    -- 0 = primary artist
);

CREATE TABLE artists (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,            -- Spotify artist ID
  name TEXT NOT NULL,
  popularity INTEGER,
  followers INTEGER
);

CREATE TABLE albums (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,            -- Spotify album ID
  name TEXT NOT NULL,
  album_type TEXT,                    -- "album", "single", "compilation"
  release_date TEXT,
  total_tracks INTEGER
);

CREATE TABLE album_images (
  album_rowid INTEGER,
  url TEXT NOT NULL,
  height INTEGER,
  width INTEGER
);
```

### 1.2 spotify_clean_audio_features.sqlite3 (From API docs)

```sql
CREATE TABLE audio_features (
  track_rowid INTEGER PRIMARY KEY,    -- FK to tracks
  tempo REAL,                         -- BPM (e.g., 118.211)
  key INTEGER,                        -- Pitch class: 0=C, 1=C#, ..., 11=B, -1=unknown
  mode INTEGER,                       -- 0=minor, 1=major
  time_signature INTEGER,             -- 3-7 (beats per bar)
  danceability REAL,                  -- 0.0-1.0
  energy REAL,                        -- 0.0-1.0
  instrumentalness REAL,              -- 0.0-1.0 (>0.5 = likely instrumental)
  acousticness REAL,                  -- 0.0-1.0
  speechiness REAL,                   -- 0.0-1.0
  valence REAL,                       -- 0.0-1.0 (musical positiveness)
  liveness REAL,                      -- 0.0-1.0 (audience presence)
  loudness REAL                       -- dB, typically -60 to 0
);
```

### 1.3 Current LRCLIB Index (Turso)

```sql
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,             -- lrclib_id
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_sec INTEGER NOT NULL,
  title_norm TEXT NOT NULL,
  artist_norm TEXT NOT NULL,
  quality INTEGER NOT NULL            -- 80=studio, 50=live, etc.
);

CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist,
  content='tracks',
  content_rowid='id',
  tokenize='porter'
);
```

---

## 2. Matching Strategy

### 2.1 The Challenge

| Source | Records | Has Lyrics | Has BPM | Has Popularity | Has ISRC |
|--------|---------|------------|---------|----------------|----------|
| LRCLIB | ~20M (4.2M deduped) | ✓ | ✗ | ✗ | ✗ (proposed PR #56) |
| Spotify | 256M | ✗ | ✓ | ✓ | ✓ (186M unique) |

**Goal:** Match LRCLIB entries to Spotify tracks to get BPM + popularity, while keeping LRCLIB as the source of truth for lyrics availability.

### 2.1.1 ISRC Strategy

**Current state:** LRCLIB does not have ISRC support. There's an [open PR](https://github.com/tranxuanthang/lrclib/pull/56) to add it, but it's not merged yet.

**Our approach:**
1. Match LRCLIB → Spotify using **normalized title + artist + duration** (primary method)
2. Store **Spotify's ISRC** after matching for:
   - Deezer ISRC album art lookup (fast, no search needed)
   - Deduplication within Spotify candidates (same ISRC = same recording)
3. **Future:** When LRCLIB adds ISRC support, we can use it for higher-confidence matching

### 2.2 Matching Algorithm

```
For each canonical LRCLIB track:
  1. Normalize title + artist (same algorithm as current extraction)
  2. Search Spotify by normalized title + artist
  3. Filter candidates by duration proximity (±10s)
  4. Select highest popularity among matches
  5. If no match, leave Spotify fields NULL
  6. Store: lrclib_id → spotify_id + isrc + enrichment data
```

**Note:** LRCLIB tracks have synced lyrics by definition, so they're already vocal tracks. No instrumentalness filtering needed.

### 2.3 Why Match After Deduplication

**Current flow (LRCLIB extraction):**
```
20M LRCLIB tracks → Normalize → Group by (title_norm, artist_norm) → Select canonical → 4.2M tracks
```

**Proposed flow:**
```
4.2M canonical LRCLIB tracks → Match to Spotify → 4.2M enriched tracks (with NULLs where no match)
```

Matching 4.2M is much faster than 256M. We only need Spotify data for songs that have lyrics.

### 2.4 Handling Multiple Spotify Versions

Spotify has many versions of the same song:
- "Nothing Else Matters" (original)
- "Nothing Else Matters - Remastered 2021"
- "Nothing Else Matters (Live)"

**Strategy:** Select the version with **highest popularity** among duration-matched candidates. This naturally picks the canonical version users expect.

```rust
fn select_best_spotify_match(
    candidates: Vec<SpotifyTrack>,
    lrclib_duration_sec: i64
) -> Option<SpotifyTrack> {
    candidates
        .into_iter()
        .filter(|t| {
            let spotify_duration_sec = t.duration_ms / 1000;
            (spotify_duration_sec - lrclib_duration_sec).abs() <= 10
        })
        .max_by_key(|t| t.popularity)
}
```

---

## 3. Enhanced Schema

### 3.1 New Turso Schema

```sql
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,              -- lrclib_id (unchanged)
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_sec INTEGER NOT NULL,
  title_norm TEXT NOT NULL,
  artist_norm TEXT NOT NULL,
  quality INTEGER NOT NULL,
  
  -- NEW: Spotify enrichment
  spotify_id TEXT,                     -- Spotify track ID (nullable)
  popularity INTEGER,                  -- 0-100, NULL if no Spotify match
  tempo REAL,                          -- BPM from audio_features (nullable)
  musical_key INTEGER,                 -- Pitch class 0-11, -1=unknown (nullable)
  mode INTEGER,                        -- 0=minor, 1=major (nullable)
  time_signature INTEGER,              -- 3-7 (nullable)
  isrc TEXT,                           -- From Spotify match, for Deezer ISRC album art lookup
  album_image_url TEXT                 -- Medium (300px) from album_images, fallback to runtime if expired
);

-- Index for Spotify ID lookups
CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);

-- FTS unchanged
CREATE VIRTUAL TABLE tracks_fts USING fts5(
  title, artist,
  content='tracks',
  content_rowid='id',
  tokenize='porter'
);
```

### 3.2 Size Estimates

| Column | Type | Bytes/row | Notes |
|--------|------|-----------|-------|
| spotify_id | TEXT | ~24 | 22-char base62 ID |
| popularity | INTEGER | 1 | 0-100, NULL if no match |
| tempo | REAL | 8 | float |
| musical_key | INTEGER | 1 | 0-11 or -1 |
| mode | INTEGER | 1 | 0 or 1 |
| time_signature | INTEGER | 1 | 3-7 |
| isrc | TEXT | ~14 | 12-char code, from Spotify match |
| album_image_url | TEXT | ~70 | Medium (300px) Spotify CDN URL |

**Additional storage:** ~120 bytes/row × 4.2M = ~500MB

### 3.3 Total Database Size

| Component | Current | Additional | Notes |
|-----------|---------|------------|-------|
| Base tracks table | ~400MB | — | 4.2M rows × ~95 bytes |
| FTS5 index | ~200MB | — | Unchanged |
| New columns | — | ~400MB | ~80% match rate, includes album_image_url |
| New indexes | — | ~50MB | spotify_id |
| **Total** | ~600MB | ~450MB | **~1.05GB** |

### 3.4 Turso Free Tier

| Limit | Free Tier | Our Usage |
|-------|-----------|-----------|
| Total Storage | 5GB | ~1.05GB (**21%**) |
| Databases | 100 | 1 |
| Monthly Rows Read | 500 Million | Low (search queries) |
| Monthly Rows Written | 10 Million | ~0 (read-only index) |
| Point-in-Time Restore | 1 day | — |

**Conclusion:** Comfortably within limits with room for ~4x growth before needing paid tier ($4.99/mo for 9GB).

---

## 4. Extraction Tool Enhancement

### 4.1 New Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   LRCLIB Dump       │     │   Spotify Dumps     │
│   (72GB SQLite)     │     │   (200GB SQLite)    │
└─────────┬───────────┘     └──────────┬──────────┘
          │                            │
          ▼                            ▼
┌─────────────────────┐     ┌─────────────────────┐
│ Phase 1: Extract    │     │ Phase 1b: Build     │
│ & Deduplicate       │     │ Spotify Lookup      │
│ (existing code)     │     │ HashMap             │
└─────────┬───────────┘     └──────────┬──────────┘
          │                            │
          │    4.2M canonical tracks   │
          └───────────────┬────────────┘
                          ▼
               ┌──────────────────────┐
               │ Phase 2: Match       │
               │ LRCLIB → Spotify     │
               │ by (title, artist,   │
               │     duration)        │
               └──────────┬───────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │ Phase 3: Enrich      │
               │ with audio_features  │
               │ (tempo, key, etc.)   │
               └──────────┬───────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │ Phase 4: Add album   │
               │ image URLs from      │
               │ album_images table   │
               └──────────┬───────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │ Output: Enriched     │
               │ Turso Index (~1.05GB)│
               └──────────────────────┘
```

### 4.2 CLI Changes

The tool maintains LRCLIB as the source of truth:
- **Without `--spotify`:** Produces current output (LRCLIB-only, no enrichment)
- **With `--spotify`:** Adds Spotify enrichment columns (nullable, NULL if no match)

A track is included **only if** it has synced lyrics in LRCLIB. Spotify data is enrichment.

```rust
/// Extract deduplicated LRCLIB search index with optional Spotify enrichment.
///
/// LRCLIB is the source of truth. Tracks are only included if they have synced lyrics.
/// Spotify data (BPM, popularity, album art) is enrichment metadata — nullable and optional.
///
/// Flow:
/// 1. Read LRCLIB tracks with synced lyrics
/// 2. Deduplicate by normalized (title, artist)
/// 3. Select canonical version per group
/// 4. (Optional) Match to Spotify by (title_norm, artist_norm, duration)
/// 5. (Optional) Enrich with audio_features and album_images
/// 6. Write output with FTS5 index
#[derive(Parser)]
#[command(name = "lrclib-extract")]
#[command(about = "Extract deduplicated LRCLIB search index with optional Spotify enrichment")]
struct Args {
    /// Path to LRCLIB SQLite dump (source of truth)
    source: PathBuf,

    /// Path to output SQLite database
    output: PathBuf,

    /// Path to spotify_clean.sqlite3 (optional, for enrichment)
    #[arg(long)]
    spotify: Option<PathBuf>,

    /// Path to spotify_clean_audio_features.sqlite3 (optional, requires --spotify)
    #[arg(long)]
    audio_features: Option<PathBuf>,

    /// Minimum Spotify popularity to include in lookup index (0-100)
    #[arg(long, default_value = "1")]
    min_popularity: i32,

    #[arg(long, default_value = "0")]
    workers: usize,

    #[arg(long)]
    test: Option<String>,

    /// Filter by artist names (comma-separated, case-insensitive)
    #[arg(long)]
    artists: Option<String>,
}
```

**Usage:**

```bash
./lrclib-extract \
  /path/to/lrclib.sqlite3 \
  /path/to/output.sqlite3 \
  --spotify /path/to/spotify_clean.sqlite3 \
  --audio-features /path/to/spotify_clean_audio_features.sqlite3 \
  --min-popularity 1 \
  --test "everlong foo fighters"
```

### 4.3 New Structs

```rust
/// Spotify track info for matching
#[derive(Clone, Debug)]
struct SpotifyTrack {
    rowid: i64,                      // For joining with audio_features
    id: String,                      // Spotify track ID (e.g., "2takcwOaAZWiXQijPHIx7B")
    name: String,                    // Original title
    artist: String,                  // Primary artist (from join)
    duration_ms: i64,
    popularity: i32,                 // 0-100
    isrc: Option<String>,            // For Deezer album art lookup
}

/// Audio features from Spotify
#[derive(Clone, Debug)]
struct AudioFeatures {
    tempo: Option<f64>,              // BPM
    key: Option<i32>,                // -1 to 11 (pitch class)
    mode: Option<i32>,               // 0=minor, 1=major
    time_signature: Option<i32>,     // 3-7
}

/// Final enriched track for output.
/// LRCLIB fields are always present (source of truth).
/// Spotify fields are nullable (enrichment, NULL if no match).
#[derive(Clone, Debug)]
struct EnrichedTrack {
    // From LRCLIB (source of truth, always present)
    lrclib_id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,

    // From Spotify (enrichment, all nullable)
    spotify_id: Option<String>,
    popularity: Option<i32>,         // NULL if no match (not 0)
    tempo: Option<f64>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>, // Medium (300px) Spotify CDN URL
}
```

### 4.4 Spotify Loading

```rust
/// Load Spotify tracks into lookup HashMap
/// Key: (title_norm, artist_norm) → Vec of candidates
fn load_spotify_tracks(
    conn: &Connection,
    min_popularity: i32,
) -> Result<HashMap<(String, String), Vec<SpotifyTrack>>> {
    println!("[SPOTIFY] Loading tracks with popularity >= {}", min_popularity);

    // Join tracks + track_artists + artists to get primary artist
    let sql = r#"
        SELECT 
            t.rowid,
            t.id,
            t.name,
            a.name as artist_name,
            t.duration_ms,
            t.popularity,
            t.isrc
        FROM tracks t
        JOIN track_artists ta ON ta.track_rowid = t.rowid AND ta.position = 0
        JOIN artists a ON a.rowid = ta.artist_rowid
        WHERE t.popularity >= ?
    "#;

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([min_popularity])?;

    let mut lookup: HashMap<(String, String), Vec<SpotifyTrack>> = HashMap::new();
    let mut count = 0;

    while let Some(row) = rows.next()? {
        let track = SpotifyTrack {
            rowid: row.get(0)?,
            id: row.get(1)?,
            name: row.get(2)?,
            artist: row.get(3)?,
            duration_ms: row.get(4)?,
            popularity: row.get(5)?,
            isrc: row.get(6)?,
        };

        // Normalize using existing functions
        let title_norm = normalize_title(&track.name);
        let artist_norm = normalize_artist(&track.artist);
        let key = (title_norm, artist_norm);

        lookup.entry(key).or_default().push(track);
        count += 1;
    }

    println!("[SPOTIFY] Loaded {} tracks into {} groups", count, lookup.len());
    Ok(lookup)
}
```

### 4.5 Audio Features Loading

```rust
/// Load audio features into HashMap by track_rowid
fn load_audio_features(conn: &Connection) -> Result<HashMap<i64, AudioFeatures>> {
    println!("[AUDIO] Loading audio features...");

    let sql = "SELECT track_rowid, tempo, key, mode, time_signature FROM audio_features";
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    let mut lookup: HashMap<i64, AudioFeatures> = HashMap::new();

    while let Some(row) = rows.next()? {
        let rowid: i64 = row.get(0)?;
        let features = AudioFeatures {
            tempo: row.get(1)?,
            key: row.get(2)?,
            mode: row.get(3)?,
            time_signature: row.get(4)?,
        };
        lookup.insert(rowid, features);
    }

    println!("[AUDIO] Loaded {} audio feature records", lookup.len());
    Ok(lookup)
}
```

### 4.5.1 Album Images Loading

```rust
/// Load album image URLs into HashMap by album_rowid
/// We select medium size (~300px) for optimal mobile display
fn load_album_images(conn: &Connection) -> Result<HashMap<i64, String>> {
    println!("[IMAGES] Loading album images (medium size)...");

    // Select images closest to 300px (medium size)
    let sql = r#"
        SELECT album_rowid, url
        FROM album_images
        WHERE height BETWEEN 250 AND 350
        ORDER BY album_rowid, ABS(height - 300)
    "#;
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    let mut lookup: HashMap<i64, String> = HashMap::new();

    while let Some(row) = rows.next()? {
        let album_rowid: i64 = row.get(0)?;
        let url: String = row.get(1)?;
        // Only keep first (closest to 300px) per album
        lookup.entry(album_rowid).or_insert(url);
    }

    println!("[IMAGES] Loaded {} album image URLs", lookup.len());
    Ok(lookup)
}
```

### 4.6 Matching Logic

```rust
/// Match a canonical LRCLIB track to the best Spotify version.
/// LRCLIB tracks have lyrics, so they're already vocal (not instrumental).
fn match_to_spotify<'a>(
    lrclib: &ScoredTrack,
    spotify_lookup: &'a HashMap<(String, String), Vec<SpotifyTrack>>,
) -> Option<&'a SpotifyTrack> {
    let key = (lrclib.title_norm.clone(), lrclib.artist_norm.clone());
    let candidates = spotify_lookup.get(&key)?;

    // Filter by duration (±10s), select highest popularity
    candidates
        .iter()
        .filter(|s| {
            let spotify_duration_sec = s.duration_ms / 1000;
            (lrclib.track.duration_sec - spotify_duration_sec).abs() <= 10
        })
        .max_by_key(|s| s.popularity)
}

/// Enrich canonical LRCLIB tracks with Spotify data.
/// LRCLIB is the source of truth — Spotify data is nullable enrichment.
fn enrich_tracks(
    canonical: Vec<ScoredTrack>,
    spotify_lookup: &HashMap<(String, String), Vec<SpotifyTrack>>,
    audio_lookup: &HashMap<i64, AudioFeatures>,
    image_lookup: &HashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    let pb = create_progress_bar(canonical.len() as u64, "Enriching with Spotify");

    let enriched: Vec<EnrichedTrack> = canonical
        .into_par_iter()
        .map(|lrclib| {
            let spotify_match = match_to_spotify(&lrclib, spotify_lookup);

            let enrichment = match spotify_match {
                Some(s) => {
                    let features = audio_lookup.get(&s.rowid);
                    let album_image = image_lookup.get(&s.album_rowid).cloned();
                    
                    (
                        Some(s.id.clone()),
                        Some(s.popularity),
                        features.and_then(|f| f.tempo),
                        features.and_then(|f| f.key),
                        features.and_then(|f| f.mode),
                        features.and_then(|f| f.time_signature),
                        s.isrc.clone(),
                        album_image,
                    )
                }
                None => (None, None, None, None, None, None, None, None),
            };

            pb.inc(1);

            EnrichedTrack {
                // LRCLIB (source of truth, always present)
                lrclib_id: lrclib.track.id,
                title: lrclib.track.title,
                artist: lrclib.track.artist,
                album: lrclib.track.album,
                duration_sec: lrclib.track.duration_sec,
                title_norm: lrclib.title_norm,
                artist_norm: lrclib.artist_norm,
                quality: lrclib.quality,
                // Spotify (enrichment, nullable)
                spotify_id: enrichment.0,
                popularity: enrichment.1,
                tempo: enrichment.2,
                musical_key: enrichment.3,
                mode: enrichment.4,
                time_signature: enrichment.5,
                isrc: enrichment.6,
                is_instrumental: enrichment.7,
                album_image_url: enrichment.8,
            }
        })
        .collect();

    pb.finish_with_message(format!(
        "Enriched {} tracks ({} with Spotify match)",
        enriched.len(),
        enriched.iter().filter(|t| t.spotify_id.is_some()).count()
    ));

    enriched
}
```

### 4.7 Updated Output Schema

```rust
fn write_output(conn: &mut Connection, tracks: &[EnrichedTrack]) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE tracks (
            -- LRCLIB (source of truth, always present)
            id INTEGER PRIMARY KEY,              -- lrclib_id
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            duration_sec INTEGER NOT NULL,
            title_norm TEXT NOT NULL,
            artist_norm TEXT NOT NULL,
            quality INTEGER NOT NULL,

            -- Spotify enrichment (all nullable, NULL = no match)
            spotify_id TEXT,
            popularity INTEGER,                  -- 0-100, NULL if no match
            tempo REAL,
            musical_key INTEGER,
            mode INTEGER,
            time_signature INTEGER,
            isrc TEXT,
            album_image_url TEXT                 -- Medium (300px) Spotify CDN URL
        );

        CREATE INDEX idx_tracks_spotify_id ON tracks(spotify_id);

        CREATE VIRTUAL TABLE tracks_fts USING fts5(
            title, artist,
            content='tracks',
            content_rowid='id',
            tokenize='porter'
        );",
    )?;

    let pb = create_progress_bar(tracks.len() as u64, "Writing enriched tracks");

    for chunk in tracks.chunks(WRITE_BATCH_SIZE) {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO tracks (
                    id, title, artist, album, duration_sec,
                    title_norm, artist_norm, quality,
                    spotify_id, popularity, tempo, musical_key, mode, time_signature,
                    isrc, album_image_url
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            )?;

            for t in chunk {
                stmt.execute(params![
                    // LRCLIB (source of truth)
                    t.lrclib_id,
                    t.title,
                    t.artist,
                    t.album,
                    t.duration_sec,
                    t.title_norm,
                    t.artist_norm,
                    t.quality,
                    // Spotify (enrichment, nullable)
                    t.spotify_id,
                    t.popularity,
                    t.tempo,
                    t.musical_key,
                    t.mode,
                    t.time_signature,
                    t.isrc,
                    t.album_image_url,
                ])?;
                pb.inc(1);
            }
        }
        tx.commit()?;
    }

    pb.finish_with_message(format!("Wrote {} enriched tracks", tracks.len()));
    Ok(())
}
```

### 4.8 Updated Main Flow

```rust
fn main() -> Result<()> {
    let args = Args::parse();

    // ... existing setup ...

    // Phase 1: Read LRCLIB tracks (existing)
    let tracks = read_tracks(&source_conn, artist_filter.as_ref())?;
    drop(source_conn);

    // Phase 1b: Load Spotify lookup (NEW)
    let spotify_lookup = if let Some(ref spotify_path) = args.spotify {
        let spotify_conn = Connection::open(spotify_path)?;
        spotify_conn.execute_batch("PRAGMA mmap_size = 8589934592;")?;
        load_spotify_tracks(&spotify_conn, args.min_popularity)?
    } else {
        HashMap::new()
    };

    // Phase 1c: Load audio features (NEW)
    let audio_lookup = if let Some(ref af_path) = args.audio_features {
        let af_conn = Connection::open(af_path)?;
        af_conn.execute_batch("PRAGMA mmap_size = 4294967296;")?;
        load_audio_features(&af_conn)?
    } else {
        HashMap::new()
    };

    // Phase 1d: Load album images (NEW)
    let image_lookup = if let Some(ref spotify_path) = args.spotify {
        let spotify_conn = Connection::open(spotify_path)?;
        load_album_images(&spotify_conn)?
    } else {
        HashMap::new()
    };

    // Phase 2: Group & select canonical (existing)
    let groups = group_tracks(tracks);
    println!("Found {} unique (title, artist) groups", groups.len());
    let canonical_tracks = process_groups(groups);

    // Phase 2b: Enrich with Spotify (NEW)
    // LRCLIB is the source of truth — Spotify data is nullable enrichment
    let enriched_tracks = if !spotify_lookup.is_empty() {
        enrich_tracks(canonical_tracks, &spotify_lookup, &audio_lookup, &image_lookup)
    } else {
        // No Spotify data: convert to EnrichedTrack with NULL Spotify fields
        canonical_tracks.into_iter().map(|t| EnrichedTrack {
            // LRCLIB (source of truth)
            lrclib_id: t.track.id,
            title: t.track.title,
            artist: t.track.artist,
            album: t.track.album,
            duration_sec: t.track.duration_sec,
            title_norm: t.title_norm,
            artist_norm: t.artist_norm,
            quality: t.quality,
            // Spotify (all NULL when no enrichment)
            spotify_id: None,
            popularity: None,
            tempo: None,
            musical_key: None,
            mode: None,
            time_signature: None,
            isrc: None,
            album_image_url: None,
        }).collect()
    };

    // Phase 3: Write output (updated schema)
    write_output(&mut output_conn, &enriched_tracks)?;

    // Phase 4-5: FTS & optimize (existing)
    build_fts_index(&output_conn)?;
    optimize_database(&output_conn)?;

    // ... stats output ...
}
```

### 4.9 Execution Phases

| Phase | Description | Time Estimate |
|-------|-------------|---------------|
| 1 | Read LRCLIB tracks (source of truth) | ~2 min |
| 1b | Load Spotify lookup (50M tracks) | ~5 min |
| 1c | Load audio_features (50M rows) | ~3 min |
| 1d | Load album_images (~50M rows) | ~2 min |
| 2 | Group & select canonical | ~1 min |
| 2b | Match & enrich with Spotify | ~2 min |
| 3 | Write output | ~1 min |
| 4 | Build FTS index | ~2 min |
| 5 | Optimize (VACUUM) | ~1 min |
| **Total** | | **~17 min** |

### 4.10 Memory Requirements

| Data | Records | Estimated Memory |
|------|---------|------------------|
| Spotify tracks (pop ≥ 1) | ~50M | ~4GB |
| Audio features | ~50M | ~2GB |
| LRCLIB canonical | 4.2M | ~400MB |

**Total:** ~6-8GB RAM for extraction (acceptable on modern machines)

**Optimization:** Filter Spotify to popularity ≥ 1 during load (reduces from 256M to ~50-100M)

---

## 5. Search Architecture Changes

### 5.1 New Search Flow (Turso-First)

```
User types "never too late"
         │
         ▼
  ┌─────────────────────┐
  │   Turso FTS Search  │  → ~100-350ms
  │   ORDER BY:         │
  │     popularity DESC │
  │     quality DESC    │
  └──────────┬──────────┘
             │
             ▼ (results have spotify_id, tempo, etc.)
  ┌─────────────────────┐
  │   Return directly   │
  │   No Spotify API!   │
  └─────────────────────┘
```

**Key change:** Turso now has popularity, so we can rank results without Spotify API.

### 5.2 Updated Query

```sql
SELECT 
  t.id, t.title, t.artist, t.album, t.duration_sec,
  t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode
FROM tracks_fts fts
JOIN tracks t ON fts.rowid = t.id
WHERE tracks_fts MATCH ?
ORDER BY 
  t.popularity DESC,      -- Most popular first
  t.quality DESC,         -- Then by quality score
  -bm25(tracks_fts) ASC   -- Then by relevance
LIMIT 10
```

### 5.3 Album Art Strategy

Store medium (300px) album art URL from Spotify dump. Fall back to runtime lookup if expired or missing.

```typescript
async function getAlbumArtForTrack(track: TursoSearchResult): Promise<string | null> {
  // Priority 1: Stored URL from Spotify dump (0ms, pre-enriched)
  if (track.albumImageUrl) {
    // Could add validation here to check if URL is still valid
    return track.albumImageUrl
  }

  // Priority 2: Deezer ISRC lookup (no auth, direct, ~100ms)
  if (track.isrc) {
    const deezerTrack = await fetch(`https://api.deezer.com/track/isrc:${track.isrc}`)
    if (deezerTrack.ok) {
      const data = await deezerTrack.json()
      return data.album?.cover_medium ?? null
    }
  }

  // Priority 3: Deezer search fallback (current approach, ~200ms)
  return getAlbumArt(track.artist, track.title, "medium")
}
```

| Method | Auth | Latency | Reliability |
|--------|------|---------|-------------|
| Stored URL | None | 0ms | High (may expire eventually) |
| Deezer ISRC | None | ~100ms | Medium (undocumented endpoint) |
| Deezer search | None | ~200ms | Medium (search query) |

**Note:** Spotify CDN URLs are typically stable for years. If they expire, we fall back to Deezer.

For **large album art** (share editor), use runtime lookup via `spotify_id` or `isrc` — this is an infrequent operation.

### 5.4 TursoService Changes

**Updated interface (`src/services/turso.ts`):**

```typescript
export interface TursoSearchResult {
  readonly id: number              // lrclib_id
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
  readonly quality: number
  
  // NEW: Spotify enrichment
  readonly spotifyId: string | null
  readonly popularity: number | null  // 0-100, null if no Spotify match
  readonly tempo: number | null       // BPM
  readonly musicalKey: number | null  // 0-11, -1 = unknown
  readonly mode: number | null        // 0=minor, 1=major
  readonly timeSignature: number | null  // 3-7
  readonly isrc: string | null
  readonly albumImageUrl: string | null    // Medium (300px) Spotify CDN URL
}
```

**Updated search query:**

```typescript
const search = (query: string, limit = 10) =>
  Effect.gen(function* () {
    const client = yield* getClient
    const result = yield* Effect.tryPromise({
      try: async () => {
        const rs = await client.execute({
          sql: `
            SELECT t.id, t.title, t.artist, t.album, t.duration_sec, t.quality,
                   t.spotify_id, t.popularity, t.tempo, t.musical_key, t.mode,
                   t.time_signature, t.isrc, t.is_instrumental, t.album_image_url
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY (t.popularity IS NOT NULL) DESC, t.popularity DESC, t.quality DESC, -bm25(tracks_fts) ASC
            LIMIT ?
          `,
          args: [query, limit],
        })
        return rs.rows
      },
      catch: error => new TursoSearchError({ message: "Turso search failed", cause: error }),
    })
    // ... map rows to TursoSearchResult
  })
```

### 5.5 Fallback Chain (Simplified)

```
Turso Search → (results have everything)
     │
     └── No results? → LRCLIB API + Deezer (unchanged)
```

**Removed:**
- Spotify Search API calls
- Turso verification step (Turso is now primary, not verifier)
- `findByTitleArtist()` — no longer needed (was for Spotify → Turso verification)

---

## 6. BPM Provider Changes

### 6.1 Current Flow (Complex)

```
Song loads → Check DB cache → Race providers:
  ReccoBeats (needs Spotify ID)
  GetSongBPM (title/artist search)
  Deezer (title/artist search)
  RapidAPI Spotify (rate limited, last resort)
```

### 6.2 New Flow (Simple)

```
Song loads → tempo field already in search result
     │
     ├── tempo != NULL → Use directly (show "via Spotify")
     │
     └── tempo == NULL → Fall back to current provider cascade
```

### 6.3 Code Changes

```typescript
// src/app/api/lyrics/[id]/route.ts

// Before: Always fetch BPM from providers
const bpmResult = await getBpmWithFallback(...)

// After: Use embedded tempo if available
if (tursoTrack.tempo) {
  return {
    bpm: Math.round(tursoTrack.tempo),
    key: formatMusicalKey(tursoTrack.musical_key, tursoTrack.mode),
    bpmAttribution: {
      provider: "Spotify",
      url: "https://spotify.com",
      requiresBacklink: false,
    },
  }
}
// Fall back to providers only if tempo is NULL
const bpmResult = await getBpmWithFallback(...)
```

### 6.4 Attribution Handling

| Source | Attribution | Backlink Required |
|--------|-------------|-------------------|
| Embedded (Spotify dump) | "via Spotify" | No |
| ReccoBeats | "via ReccoBeats" | Yes |
| GetSongBPM | "via GetSongBPM" | Yes |
| Deezer | "via Deezer" | Yes |
| RapidAPI Spotify | "via Spotify (RapidAPI)" | No |

**Benefits of embedded tempo:**
- Instant (no API calls)
- Consistent attribution ("via Spotify")
- Includes musical key and time signature

**Fallback:** When tempo is NULL, use provider cascade with appropriate attribution.

---

## 7. Musical Key Display

### 7.1 Pitch Class Mapping

```typescript
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function formatMusicalKey(key: number | null, mode: number | null): string | null {
  if (key === null || key === -1) return null
  
  const pitch = PITCH_CLASSES[key]
  const modeName = mode === 1 ? 'major' : mode === 0 ? 'minor' : ''
  
  return modeName ? `${pitch} ${modeName}` : pitch
}

// Examples:
// formatMusicalKey(9, 0) → "A minor"
// formatMusicalKey(0, 1) → "C major"
// formatMusicalKey(-1, null) → null
```

### 7.2 UI Integration

```tsx
// Song metadata display
{bpm && <span>{bpm} BPM</span>}
{musicalKey && <span>Key: {musicalKey}</span>}
{timeSignature && <span>{timeSignature}/4</span>}
```

---

## 8. Implementation Plan

### Summary

**Goal:** Enrich our 4.2M LRCLIB tracks with Spotify metadata for better search ranking, embedded BPM, and instant album art.

**Source of Truth:** LRCLIB — tracks only exist if they have synced lyrics. Spotify data is nullable enrichment.

**Data Sources:**
| File | Contents | Used For |
|------|----------|----------|
| `spotify_clean.sqlite3` | tracks, artists, albums, album_images | Matching, album art URLs |
| `spotify_clean_audio_features.sqlite3` | tempo, key, mode, time_signature | BPM and musical metadata |

**New Turso Fields:**
- `spotify_id`, `popularity`, `tempo`, `musical_key`, `mode`, `time_signature`, `isrc`, `album_image_url`

**Estimated Total Effort:** 6-8 days

---

### Phase 1: Extraction Tool Enhancement (Rust)

Enhance `scripts/lrclib-extract` to optionally enrich with Spotify data.

| Task | Description |
|------|-------------|
| 1.1 | Add CLI args: `--spotify`, `--audio-features`, `--min-popularity` |
| 1.2 | Load Spotify tracks into HashMap by `(title_norm, artist_norm)` |
| 1.3 | Load audio_features into HashMap by `track_rowid` |
| 1.4 | Load album_images (medium ~300px) into HashMap by `album_rowid` |
| 1.5 | Add matching phase: LRCLIB → Spotify by normalized title/artist + duration (±10s) |
| 1.6 | Select highest popularity among duration-matched candidates |
| 1.7 | Update output schema with Spotify enrichment columns |
| 1.8 | Test with `--artists "metallica,foo fighters"` for quick iteration |

**Estimated effort:** 2-3 days

---

### Phase 2: Turso Schema Migration

Deploy enriched database to Turso.

| Task | Description |
|------|-------------|
| 2.1 | Run full extraction with Spotify enrichment |
| 2.2 | Verify output size (~1.05GB) and match rate |
| 2.3 | Upload to Turso using existing deploy script |
| 2.4 | Update `TursoService` interface with new fields |
| 2.5 | Update search query to include new columns |
| 2.6 | Handle NULL values gracefully (no Spotify match) |

**Estimated effort:** 1 day

---

### Phase 3: Search API Updates

Simplify search to be Turso-first.

| Task | Description |
|------|-------------|
| 3.1 | Update ranking: `popularity DESC, quality DESC, bm25()` |
| 3.2 | Return `albumImageUrl` from Turso (no Deezer call needed) |
| 3.3 | Remove Spotify Search API integration |
| 3.4 | Remove `findByTitleArtist()` verification step |
| 3.5 | Keep LRCLIB API + Deezer as fallback for missing tracks |
| 3.6 | Test search results — popular songs should rank first |

**Estimated effort:** 1 day

---

### Phase 4: Album Art Optimization

Use stored album art URLs with fallback chain.

| Task | Description |
|------|-------------|
| 4.1 | Primary: Return `album_image_url` from Turso result |
| 4.2 | Fallback 1: Deezer ISRC lookup (`/track/isrc:{isrc}`) |
| 4.3 | Fallback 2: Deezer search (existing behavior) |
| 4.4 | Large album art (share editor): Runtime lookup via `spotify_id` or `isrc` |

**Estimated effort:** 0.5 days

---

### Phase 5: BPM Provider Refactor

Use embedded tempo, fall back to provider cascade.

| Task | Description |
|------|-------------|
| 5.1 | Check `tempo` field first before provider cascade |
| 5.2 | Skip attribution for embedded BPM (no external provider) |
| 5.3 | Display musical key and time signature in UI |
| 5.4 | Keep provider cascade as fallback for NULL tempo |

**Estimated effort:** 1 day

---

### Phase 6: Documentation & Cleanup

| Task | Description |
|------|-------------|
| 6.1 | Update `docs/technical-reference.md` with new architecture |
| 6.2 | Update `docs/search-optimization-plan.md` — Turso-first flow |
| 6.3 | Remove deprecated Spotify search code |
| 6.4 | Add metrics logging for match rate and fallback usage |

**Estimated effort:** 0.5 days

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low match rate | Missing BPM/popularity for some songs | Accept ~80% match rate; fallback to provider cascade for BPM |
| Spotify CDN URLs expire | Album art 404s | Fall back to Deezer ISRC → Deezer search |
| Spotify data quality | Incorrect tempo/key | Spotify's ML models are generally accurate; users can override |
| Index size growth | Turso storage limits | ~1.05GB is 21% of 5GB free tier — plenty of headroom |
| Extraction time | Slow rebuild cycle | Use `--artists` filter for testing; rayon parallelism for full run |
| Memory usage | HashMap too large for 256M tracks | Filter by `min_popularity > 0` (~50M tracks); or use SQLite index |

---

## 10. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Search latency (p50) | ~500ms | ~100ms (no external API calls) |
| Album art latency | ~200ms (Deezer search) | ~0ms (stored URL) |
| BPM availability | ~70% (provider cascade) | ~85% (embedded + fallback) |
| BPM API calls/search | 1-4 | 0 (embedded) or 1 (fallback) |
| Spotify API calls/search | 1 | 0 |
| External dependencies | 5 (Spotify, ReccoBeats, GetSongBPM, Deezer, RapidAPI) | 1 (Deezer fallback only) |
| Turso storage | ~600MB | ~1.05GB (21% of free tier) |

---

## 11. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Time signature display? | Include in UI — useful for musicians |
| Popularity decay? | Accept snapshot; monthly rebuild acceptable |
| Incremental updates? | Monthly rebuild; future: delta sync |
| LRCLIB ISRC support? | Not yet merged ([PR #56](https://github.com/tranxuanthang/lrclib/pull/56)); store Spotify ISRC for now |
| Instrumentalness filtering? | Not needed — LRCLIB tracks have lyrics by definition |
| Store album art URLs? | Yes — medium (300px) from Spotify dump; fallback to Deezer |

---

## Appendix A: Key Formatting Examples

| key | mode | Output |
|-----|------|--------|
| 0 | 1 | C major |
| 0 | 0 | C minor |
| 9 | 0 | A minor |
| 4 | 1 | E major |
| -1 | * | (null) |
| 7 | null | G |

## Appendix B: Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          EXTRACTION (One-time)                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────────────────┐ │
│  │   LRCLIB    │      │   Spotify   │      │   Audio Features        │ │
│  │   72GB      │      │   Clean     │      │   SQLite                │ │
│  │   20M rows  │      │   256M rows │      │   ~100M rows            │ │
│  └──────┬──────┘      └──────┬──────┘      └────────────┬────────────┘ │
│         │                    │                          │              │
│         ▼                    ▼                          │              │
│  ┌──────────────┐     ┌──────────────┐                  │              │
│  │ Normalize &  │     │ Filter pop>0 │                  │              │
│  │ Deduplicate  │     │ Build lookup │                  │              │
│  │ 4.2M tracks  │     │ ~50M tracks  │                  │              │
│  └──────┬───────┘     └──────┬───────┘                  │              │
│         │                    │                          │              │
│         └────────┬───────────┘                          │              │
│                  ▼                                      │              │
│         ┌────────────────┐                              │              │
│         │ Match LRCLIB   │                              │              │
│         │ → Spotify      │                              │              │
│         │ (title+artist+ │                              │              │
│         │  duration)     │                              │              │
│         └───────┬────────┘                              │              │
│                 │                                       │              │
│                 ▼                                       │              │
│         ┌────────────────┐                              │              │
│         │ Join with      │◄─────────────────────────────┘              │
│         │ audio_features │                                             │
│         └───────┬────────┘                                             │
│                 │                                                      │
│                 ▼                                                      │
│         ┌────────────────┐                                             │
│         │ Output Index   │                                             │
│         │ ~800MB         │                                             │
│         │ 4.2M tracks    │                                             │
│         │ + spotify_id   │                                             │
│         │ + popularity   │                                             │
│         │ + tempo        │                                             │
│         │ + key/mode     │                                             │
│         └────────────────┘                                             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          RUNTIME (Every search)                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  User: "nothing else matters"                                          │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Turso FTS Query                                                   │  │
│  │ ORDER BY popularity DESC, quality DESC                            │  │
│  └──────────────────────────────────────┬───────────────────────────┘  │
│                                         │                              │
│                                         ▼                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Result: {                                                         │  │
│  │   lrclib_id: 12345,                                               │  │
│  │   title: "Nothing Else Matters",                                  │  │
│  │   artist: "Metallica",                                            │  │
│  │   spotify_id: "2takcwOaAZWiXQijPHIx7B",                           │  │
│  │   popularity: 85,                                                 │  │
│  │   tempo: 142.5,                                                   │  │
│  │   musical_key: 4,  // E                                           │  │
│  │   mode: 0,         // minor                                       │  │
│  │ }                                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                         │                              │
│                                         ▼                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ No BPM API calls needed!                                          │  │
│  │ No Spotify API calls needed!                                      │  │
│  │ Album art: Deezer or cached                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```
