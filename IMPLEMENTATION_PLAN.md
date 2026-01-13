# Implementation Plan: Spotify Metadata Enrichment

## Overview

Enrich 4.2M LRCLIB tracks with Spotify metadata (BPM, popularity, album art) from Anna's Archive dumps. LRCLIB remains the source of truth - tracks only exist if they have synced lyrics. Spotify data is nullable enrichment.

## Validation Command

```bash
bun run check
```

This runs: `biome check . && bun run typecheck && bun run test`

## Gap Analysis (Verified)

| Component | Current State | Required Changes |
|-----------|---------------|------------------|
| Rust Args | 5 args (lines 12-29) | Add 3 new args: `--spotify`, `--audio-features`, `--min-popularity` |
| Rust Structs | `Track`, `ScoredTrack` only | Add `SpotifyTrack`, `AudioFeatures`, `EnrichedTrack` |
| Turso Interface | 6 fields (lines 6-13) | Add 8 nullable fields for Spotify enrichment |
| Search Route | Spotify-first flow | Convert to Turso-first, remove Spotify Search API |
| SearchResultTrack | 9 fields (lines 5-15) | Add `popularity`, `tempo` fields |
| BPMResult | 3 fields (lines 17-21) | Add `timeSignature`, `attribution` fields |
| Deezer Client | Search only (lines 75-131) | Add ISRC lookup capability |

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [001-rust-extraction-tool-enhancement](specs/001-rust-extraction-tool-enhancement.md) | Enhance Rust tool with Spotify matching | **Complete** |
| [002-turso-schema-migration](specs/002-turso-schema-migration.md) | Deploy enriched database to Turso | **Complete** |
| [003-search-api-turso-first](specs/003-search-api-turso-first.md) | Simplify search to Turso-first | **Complete** |
| [004-album-art-optimization](specs/004-album-art-optimization.md) | Three-tier album art resolution | **Complete** |
| [005-bpm-provider-refactor](specs/005-bpm-provider-refactor.md) | Use embedded tempo with fallback | Not Started |
| [006-documentation-cleanup](specs/006-documentation-cleanup.md) | Update docs, remove deprecated code | Not Started |

---

## Phase 1: Rust Extraction Tool Enhancement

**Dependencies**: None (foundational)
**Spec**: [001-rust-extraction-tool-enhancement.md](specs/001-rust-extraction-tool-enhancement.md)
**Primary File**: `scripts/lrclib-extract/src/main.rs`

### Task 1.1: Add CLI Arguments

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: Lines 12-29 (Args struct)

Add new arguments to the existing Args struct:

```rust
#[derive(Parser)]
#[command(name = "lrclib-extract")]
#[command(about = "Extract deduplicated LRCLIB search index with optional Spotify enrichment")]
struct Args {
    source: PathBuf,
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

    #[arg(long)]
    artists: Option<String>,
}
```

**Acceptance Criteria**:
- `--spotify`, `--audio-features`, `--min-popularity` args parse correctly
- Running without `--spotify` produces identical output to current tool
- Help text displays new options

---

### Task 1.2: Add New Structs

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: After existing structs (lines 42-48)

Add three new structs:

```rust
/// Spotify track info for matching
#[derive(Clone, Debug)]
struct SpotifyTrack {
    rowid: i64,
    id: String,
    name: String,
    artist: String,
    duration_ms: i64,
    popularity: i32,
    isrc: Option<String>,
    album_rowid: i64,
}

/// Audio features from Spotify
#[derive(Clone, Debug)]
struct AudioFeatures {
    tempo: Option<f64>,
    key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
}

/// Final enriched track for output
#[derive(Clone, Debug)]
struct EnrichedTrack {
    // LRCLIB (source of truth)
    lrclib_id: i64,
    title: String,
    artist: String,
    album: Option<String>,
    duration_sec: i64,
    title_norm: String,
    artist_norm: String,
    quality: i32,
    // Spotify enrichment (nullable)
    spotify_id: Option<String>,
    popularity: Option<i32>,
    tempo: Option<f64>,
    musical_key: Option<i32>,
    mode: Option<i32>,
    time_signature: Option<i32>,
    isrc: Option<String>,
    album_image_url: Option<String>,
}
```

**Acceptance Criteria**:
- Structs compile without errors
- All fields match spec requirements

---

### Task 1.3: Implement load_spotify_tracks()

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: New function

```rust
fn load_spotify_tracks(
    conn: &Connection,
    min_popularity: i32,
) -> Result<HashMap<(String, String), Vec<SpotifyTrack>>> {
    println!("[SPOTIFY] Loading tracks with popularity >= {}", min_popularity);

    let sql = r#"
        SELECT
            t.rowid,
            t.id,
            t.name,
            a.name as artist_name,
            t.duration_ms,
            t.popularity,
            t.isrc,
            t.album_rowid
        FROM tracks t
        JOIN track_artists ta ON ta.track_rowid = t.rowid AND ta.position = 0
        JOIN artists a ON a.rowid = ta.artist_rowid
        WHERE t.popularity >= ?
    "#;

    // Build HashMap keyed by (title_norm, artist_norm)
    // Use existing normalize_title() and normalize_artist() functions
}
```

**Acceptance Criteria**:
- Loads ~50M tracks with popularity >= 1
- HashMap grouped by normalized (title, artist)
- Memory usage under 4GB for track data
- Progress bar shows loading status

---

### Task 1.4: Implement load_audio_features()

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: New function

```rust
fn load_audio_features(conn: &Connection) -> Result<HashMap<i64, AudioFeatures>> {
    println!("[AUDIO] Loading audio features...");

    let sql = "SELECT track_rowid, tempo, key, mode, time_signature FROM audio_features";
    // Build HashMap keyed by track_rowid
}
```

**Acceptance Criteria**:
- Loads all audio feature records
- HashMap keyed by track_rowid for O(1) lookup
- Memory usage under 2GB

---

### Task 1.5: Implement load_album_images()

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: New function

```rust
fn load_album_images(conn: &Connection) -> Result<HashMap<i64, String>> {
    println!("[IMAGES] Loading album images (medium size)...");

    let sql = r#"
        SELECT album_rowid, url
        FROM album_images
        WHERE height BETWEEN 250 AND 350
        ORDER BY album_rowid, ABS(height - 300)
    "#;
    // Keep only first (closest to 300px) per album
}
```

**Acceptance Criteria**:
- Selects medium-size images (~300px)
- One URL per album_rowid
- Falls back gracefully if no images found

---

### Task 1.6: Implement match_to_spotify()

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: New function

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

**Acceptance Criteria**:
- Matches by normalized (title, artist)
- Filters by duration ±10 seconds
- Returns highest popularity match
- Returns None if no match found

---

### Task 1.7: Implement enrich_tracks()

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: New function

```rust
fn enrich_tracks(
    canonical: Vec<ScoredTrack>,
    spotify_lookup: &HashMap<(String, String), Vec<SpotifyTrack>>,
    audio_lookup: &HashMap<i64, AudioFeatures>,
    image_lookup: &HashMap<i64, String>,
) -> Vec<EnrichedTrack> {
    // Parallel iteration with rayon
    // Match each LRCLIB track to Spotify
    // Join with audio_features and album_images
    // Report match statistics
}
```

**Acceptance Criteria**:
- Uses rayon for parallel processing
- Reports match rate (target: ~80%)
- Progress bar shows enrichment status
- All LRCLIB tracks included (with NULL Spotify fields if no match)

---

### Task 1.8: Update write_output() Schema

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: Lines 467-522 (write_output function)

Update the CREATE TABLE statement to include new columns:

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
```

Update INSERT statement to include all 16 columns.

**Acceptance Criteria**:
- Schema includes all 8 new columns
- Index created on spotify_id
- INSERT handles NULL values correctly
- Output file ~1.05GB with enrichment

---

### Task 1.9: Update Main Flow

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: main() function

Add new phases to main():

```rust
fn main() -> Result<()> {
    // ... existing setup ...

    // Phase 1: Read LRCLIB tracks (existing)
    let tracks = read_tracks(&source_conn, artist_filter.as_ref())?;

    // Phase 1b: Load Spotify lookup (NEW)
    let spotify_lookup = if let Some(ref spotify_path) = args.spotify {
        let conn = Connection::open(spotify_path)?;
        conn.execute_batch("PRAGMA mmap_size = 8589934592;")?;
        load_spotify_tracks(&conn, args.min_popularity)?
    } else {
        HashMap::new()
    };

    // Phase 1c: Load audio features (NEW)
    let audio_lookup = if let Some(ref af_path) = args.audio_features {
        let conn = Connection::open(af_path)?;
        load_audio_features(&conn)?
    } else {
        HashMap::new()
    };

    // Phase 1d: Load album images (NEW)
    let image_lookup = if let Some(ref spotify_path) = args.spotify {
        let conn = Connection::open(spotify_path)?;
        load_album_images(&conn)?
    } else {
        HashMap::new()
    };

    // Phase 2: Group & select canonical (existing)
    let groups = group_tracks(tracks);
    let canonical_tracks = process_groups(groups);

    // Phase 2b: Enrich with Spotify (NEW)
    let enriched_tracks = if !spotify_lookup.is_empty() {
        enrich_tracks(canonical_tracks, &spotify_lookup, &audio_lookup, &image_lookup)
    } else {
        // Convert to EnrichedTrack with NULL Spotify fields
    };

    // Phase 3-5: Write output, FTS, optimize (updated for new schema)
}
```

**Acceptance Criteria**:
- Phases execute in correct order
- Memory-mapped file access for large databases
- Progress bars for each phase
- Final stats show match rate

---

### Task 1.10: Update test_search() Output

**File**: `scripts/lrclib-extract/src/main.rs`
**Location**: test_search() function

Update output format to show enrichment data:

```
[12345] Metallica - Nothing Else Matters (Black Album) [386s] quality=80 tempo=142.5 key=E minor pop=85
```

**Acceptance Criteria**:
- Shows tempo, key, and popularity if available
- Shows "no match" for tracks without Spotify data
- Test query validates enrichment works

---

## Phase 2: Turso Schema Migration

**Dependencies**: Phase 1 complete
**Spec**: [002-turso-schema-migration.md](specs/002-turso-schema-migration.md)
**Primary File**: `src/services/turso.ts`

### Task 2.1: Run Full Extraction

**Command**:
```bash
cd scripts/lrclib-extract
cargo build --release
./target/release/lrclib-extract \
  /path/to/lrclib.sqlite3 \
  /path/to/output.sqlite3 \
  --spotify /path/to/spotify_clean.sqlite3 \
  --audio-features /path/to/spotify_clean_audio_features.sqlite3 \
  --min-popularity 1
```

**Acceptance Criteria**:
- Output database ~1.05GB
- ~4.2M tracks
- ~80% Spotify match rate
- FTS5 index builds successfully

---

### Task 2.2: Upload to Turso

**Command**:
```bash
turso db shell scrolltunes-search < output.sqlite3
```

**Acceptance Criteria**:
- Database uploads successfully
- Size within free tier limit (5GB)
- FTS5 queries work

---

### Task 2.3: Update TursoSearchResult Interface

**File**: `src/services/turso.ts`
**Location**: Lines 6-13

```typescript
export interface TursoSearchResult {
  readonly id: number
  readonly title: string
  readonly artist: string
  readonly album: string | null
  readonly durationSec: number
  readonly quality: number
  // NEW: Spotify enrichment
  readonly spotifyId: string | null
  readonly popularity: number | null
  readonly tempo: number | null
  readonly musicalKey: number | null
  readonly mode: number | null
  readonly timeSignature: number | null
  readonly isrc: string | null
  readonly albumImageUrl: string | null
}
```

**Acceptance Criteria**:
- All 8 new fields added
- All new fields are nullable (null, not undefined)
- TypeScript compiles without errors

---

### Task 2.4: Update search() Query

**File**: `src/services/turso.ts`
**Location**: Lines 55-89

Update SQL and result mapping:

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
                   t.time_signature, t.isrc, t.album_image_url
            FROM tracks_fts fts
            JOIN tracks t ON fts.rowid = t.id
            WHERE tracks_fts MATCH ?
            ORDER BY (t.popularity IS NOT NULL) DESC,
                     t.popularity DESC,
                     t.quality DESC,
                     -bm25(tracks_fts) ASC
            LIMIT ?
          `,
          args: [query, limit],
        })
        return rs.rows
      },
      catch: error => new TursoSearchError({ message: "Turso search failed", cause: error }),
    })
    // Map rows with new fields...
  })
```

**Acceptance Criteria**:
- Query includes all new columns
- ORDER BY prioritizes enriched tracks
- Result mapping handles NULL values

---

### Task 2.5: Update getById() Query

**File**: `src/services/turso.ts`
**Location**: Lines 91-121

Add new columns to SELECT and result mapping.

**Acceptance Criteria**:
- Query includes all new columns
- Result mapping handles NULL values
- Returns null if not found (existing behavior)

---

### Task 2.6: Update findByTitleArtist() Query

**File**: `src/services/turso.ts`
**Location**: Lines 123-182

Add new columns to SELECT and result mapping.

**Acceptance Criteria**:
- Query includes all new columns
- Result mapping handles NULL values
- Duration scoring still works correctly

---

## Phase 3: Search API Updates

**Dependencies**: Phase 2 complete
**Spec**: [003-search-api-turso-first.md](specs/003-search-api-turso-first.md)
**Primary File**: `src/app/api/search/route.ts`

### Task 3.1: Remove Spotify Search Dependencies

**File**: `src/app/api/search/route.ts`
**Location**: Lines 7-12 (imports - verified)

Remove these imports from `@/lib/spotify-client`:
```typescript
import {
  formatArtists,
  getAlbumImageUrl,
  searchTracksEffect,
  SpotifyError,
  SpotifyService,
  SpotifyTrack,
} from "@/lib/spotify-client"
```

**Acceptance Criteria**:
- Spotify client search imports removed
- Keep any imports needed for other features (e.g., lyrics)
- No TypeScript errors from missing imports

---

### Task 3.2: Remove searchSpotifyWithTurso()

**File**: `src/app/api/search/route.ts`
**Location**: Lines 72-114 (verified)

Delete the entire function. This function:
- Calls `searchTracksEffect` to get Spotify results
- Maps tracks through `findLrclibMatch` for Turso verification
- Constructs `SearchResultTrack[]` with Spotify metadata

**Acceptance Criteria**:
- Function removed
- No references to removed function in `search()` (lines 237-265)

---

### Task 3.3: Remove findLrclibMatch()

**File**: `src/app/api/search/route.ts`
**Location**: Lines 39-67 (verified)

Delete the entire function. Also remove:
- `SpotifyTrackWithLrclib` interface (lines 28-34)

**Acceptance Criteria**:
- Function removed
- Interface removed
- No orphan references

---

### Task 3.4: Create searchTurso() Function

**File**: `src/app/api/search/route.ts`
**Location**: New function (replace searchSpotifyWithTurso)

```typescript
const searchTurso = (query: string, limit: number) =>
  Effect.gen(function* () {
    const turso = yield* TursoService
    const config = yield* ServerConfig

    const results = yield* turso.search(query, limit).pipe(
      Effect.catchAll(() => Effect.succeed([] as TursoSearchResult[]))
    )

    // Enrich with album art (parallel, concurrency: 4)
    const enriched = yield* Effect.forEach(
      results,
      (result) => enrichWithAlbumArt(result),
      { concurrency: 4 }
    )

    return enriched
  })
```

**Acceptance Criteria**:
- Direct Turso search (no Spotify API)
- Handles Turso errors gracefully
- Returns SearchResultTrack[]

---

### Task 3.5: Create enrichWithAlbumArt() Helper

**File**: `src/app/api/search/route.ts`
**Location**: New function

```typescript
const enrichWithAlbumArt = (result: TursoSearchResult) =>
  Effect.gen(function* () {
    // Priority 1: Stored URL from Turso
    let albumArt = result.albumImageUrl

    // Priority 2: Deezer fallback if no stored URL
    if (!albumArt) {
      albumArt = yield* Effect.tryPromise({
        try: () => getAlbumArt(result.artist, result.title, "medium"),
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    }

    return {
      id: `lrclib-${result.id}`,
      name: result.title,
      artist: result.artist,
      album: result.album ?? "",
      albumArt: albumArt ?? undefined,
      duration: result.durationSec * 1000,
      hasLyrics: true,
      lrclibId: result.id,
      spotifyId: result.spotifyId ?? undefined,
      popularity: result.popularity ?? undefined,
      tempo: result.tempo ?? undefined,
    } satisfies SearchResultTrack
  })
```

**Acceptance Criteria**:
- Uses stored albumImageUrl first
- Falls back to Deezer if no stored URL
- Maps all fields correctly

---

### Task 3.6: Update SearchResultTrack Type

**File**: `src/lib/search-api-types.ts`
**Location**: Lines 5-15 (verified - currently has 9 fields)

Current interface:
```typescript
export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly duration: number
  readonly hasLyrics: boolean
  readonly spotifyId?: string | undefined
  readonly lrclibId?: number | undefined
}
```

Add two new fields:
```typescript
export interface SearchResultTrack {
  readonly id: string
  readonly name: string
  readonly artist: string
  readonly album: string
  readonly albumArt?: string | undefined
  readonly duration: number
  readonly hasLyrics: boolean
  readonly spotifyId?: string | undefined
  readonly lrclibId?: number | undefined
  // NEW: Enrichment fields from Turso
  readonly popularity?: number | undefined
  readonly tempo?: number | undefined
}
```

**Acceptance Criteria**:
- `popularity` field added (optional, 0-100)
- `tempo` field added (optional, BPM)
- Fields are optional (may be undefined)
- TypeScript compiles without errors

---

### Task 3.7: Update search() Function

**File**: `src/app/api/search/route.ts`
**Location**: Lines 237-265

```typescript
const search = (query: string, limit: number) =>
  Effect.gen(function* () {
    // Primary: Turso search
    const tursoResults = yield* searchTurso(query, limit)

    if (tursoResults.length > 0) {
      return tursoResults
    }

    // Fallback: LRCLIB API
    return yield* searchLRCLibFallback(query, limit)
  })
```

**Acceptance Criteria**:
- Turso is primary search path
- LRCLIB API is fallback only
- SpotifyService removed from dependencies

---

### Task 3.8: Update Effect Dependencies

**File**: `src/app/api/search/route.ts`
**Location**: GET handler (lines 267-306)

Remove SpotifyService from the Effect.provide() chain.

**Acceptance Criteria**:
- SpotifyService not in dependencies
- Effect runs successfully without Spotify

---

### Task 3.9: Review verify Route (Keep)

**File**: `src/app/api/search/verify/route.ts`
**Action**: Review - likely keep

This route verifies LRCLIB lyrics availability by title/artist. It does NOT depend on Spotify:
- Uses `searchLRCLibTracks()` from `@/lib/lyrics-client`
- Returns `found: true/false` with LRCLIB ID if found
- Still useful for external integrations checking lyrics availability

**Decision**: **Keep this route** - it's independent of the Spotify→Turso search flow.

**Acceptance Criteria**:
- Route remains functional after other changes
- No accidental dependency on removed code

---

## Phase 4: Album Art Optimization

**Dependencies**: Phase 3 complete
**Spec**: [004-album-art-optimization.md](specs/004-album-art-optimization.md)
**Primary File**: `src/lib/album-art.ts` (new)

### Task 4.1: Create album-art.ts Module

**File**: `src/lib/album-art.ts` (NEW FILE)

```typescript
import { Effect } from "effect"
import { getAlbumArt, type AlbumArtSize } from "@/lib/deezer-client"
import type { TursoSearchResult } from "@/services/turso"

/**
 * Get album art for a track using priority chain:
 * 1. Stored URL from Turso (instant)
 * 2. Deezer ISRC lookup (~100ms)
 * 3. Deezer search fallback (~200ms)
 */
export const getAlbumArtForTrack = (
  track: TursoSearchResult,
  size: AlbumArtSize = "medium"
): Effect.Effect<string | null, never, never> =>
  Effect.gen(function* () {
    // Priority 1: Stored URL
    if (track.albumImageUrl) {
      return track.albumImageUrl
    }

    // Priority 2: Deezer ISRC lookup
    if (track.isrc) {
      const isrcResult = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `https://api.deezer.com/track/isrc:${track.isrc}`
          )
          if (!response.ok) return null
          const data = await response.json()
          return data.album?.[`cover_${size}`] ?? null
        },
        catch: () => null,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (isrcResult) return isrcResult
    }

    // Priority 3: Deezer search fallback
    return yield* Effect.tryPromise({
      try: () => getAlbumArt(track.artist, track.title, size),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  })

/**
 * Get large album art for share editor
 */
export const getLargeAlbumArt = (
  track: TursoSearchResult
): Effect.Effect<string | null, never, never> =>
  getAlbumArtForTrack(track, "xl")
```

**Acceptance Criteria**:
- Three-tier priority chain
- ISRC lookup uses Deezer API
- All errors handled gracefully
- Returns null on all failures

---

### Task 4.2: Add ISRC Lookup to Deezer Client

**File**: `src/lib/deezer-client.ts`
**Location**: After existing functions

```typescript
/**
 * Look up track by ISRC (direct, no search)
 */
export const getTrackByIsrc = (
  isrc: string,
  size: AlbumArtSize = "medium"
): Effect.Effect<string | null, DeezerAPIError> =>
  Effect.gen(function* () {
    const url = `${DEEZER_BASE_URL}/track/isrc:${isrc}`

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { cache: "force-cache" }),
      catch: error =>
        new DeezerAPIError({
          message: error instanceof Error ? error.message : "Network error",
        }),
    })

    if (!response.ok) {
      return null
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<DeezerTrack>,
      catch: () => new DeezerAPIError({ message: "Failed to parse response" }),
    })

    const sizeKey = `cover_${size}` as keyof DeezerAlbum
    return data.album?.[sizeKey] ?? null
  })
```

**Acceptance Criteria**:
- Direct ISRC lookup (no search)
- Returns album art URL by size
- Returns null if not found

---

### Task 4.3: Update Search Route to Use Album Art Module

**File**: `src/app/api/search/route.ts`

Import and use the new album-art module in enrichWithAlbumArt().

**Acceptance Criteria**:
- Album art resolution uses priority chain
- Stored URLs used when available
- Deezer fallback works correctly

---

## Phase 5: BPM Provider Refactor

**Dependencies**: Phase 2 complete (can run parallel with Phase 3-4)
**Spec**: [005-bpm-provider-refactor.md](specs/005-bpm-provider-refactor.md)
**Primary Files**:
- `src/lib/musical-key.ts` (new)
- `src/lib/bpm/bpm-resolver.ts` (new)
- `src/services/song-loader.ts`

### Task 5.1: Create musical-key.ts

**File**: `src/lib/musical-key.ts` (NEW FILE)

```typescript
const PITCH_CLASSES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
] as const

/**
 * Format musical key from Spotify pitch class + mode
 * @param key Pitch class (0-11), -1 for unknown
 * @param mode 0=minor, 1=major, null=unknown
 * @returns Formatted key string or null
 */
export function formatMusicalKey(
  key: number | null,
  mode: number | null
): string | null {
  if (key === null || key === -1 || key < 0 || key > 11) {
    return null
  }

  const pitch = PITCH_CLASSES[key]
  if (pitch === undefined) return null

  const modeName = mode === 1 ? "major" : mode === 0 ? "minor" : ""

  return modeName ? `${pitch} ${modeName}` : pitch
}
```

**Acceptance Criteria**:
- formatMusicalKey(9, 0) returns "A minor"
- formatMusicalKey(0, 1) returns "C major"
- formatMusicalKey(-1, null) returns null
- formatMusicalKey(7, null) returns "G"

---

### Task 5.2: Create bpm-resolver.ts

**File**: `src/lib/bpm/bpm-resolver.ts` (NEW FILE)

```typescript
import { Effect } from "effect"
import type { BpmResult } from "./bpm-types"
import { formatMusicalKey } from "@/lib/musical-key"

export interface EmbeddedTempo {
  readonly tempo: number | null
  readonly musicalKey: number | null
  readonly mode: number | null
  readonly timeSignature: number | null
}

export interface BpmResultWithSource extends BpmResult {
  readonly source: "embedded" | "provider"
  readonly musicalKey?: string | null
  readonly timeSignature?: number | null
}

/**
 * Resolve BPM with embedded tempo priority
 */
export const resolveBpm = (
  embedded: EmbeddedTempo | null,
  fallback: Effect.Effect<BpmResult, Error, never>
): Effect.Effect<BpmResultWithSource, never, never> =>
  Effect.gen(function* () {
    // Priority 1: Embedded tempo from Turso
    if (embedded?.tempo) {
      return {
        bpm: Math.round(embedded.tempo),
        source: "embedded" as const,
        musicalKey: formatMusicalKey(embedded.musicalKey, embedded.mode),
        timeSignature: embedded.timeSignature,
        attribution: {
          provider: "Spotify",
          url: "https://spotify.com",
          requiresBacklink: false,
        },
      }
    }

    // Priority 2: Provider cascade
    const result = yield* fallback.pipe(
      Effect.map((r) => ({
        ...r,
        source: "provider" as const,
      })),
      Effect.catchAll(() =>
        Effect.succeed({
          bpm: null as unknown as number,
          source: "provider" as const,
          attribution: null,
        })
      )
    )

    return result
  })
```

**Acceptance Criteria**:
- Embedded tempo checked first
- Provider cascade as fallback
- Musical key formatted correctly
- Source tracked for attribution

---

### Task 5.3: Update BpmResult Type

**File**: `src/lib/bpm/bpm-types.ts`
**Location**: Lines 17-21 (verified)

Current interface:
```typescript
export interface BPMResult {
  readonly bpm: number
  readonly source: string      // Already exists - provider name
  readonly key: string | null  // Already exists - musical key
}
```

Add `timeSignature` field and `BpmAttribution` type:

```typescript
export interface BPMResult {
  readonly bpm: number
  readonly source: string
  readonly key: string | null
  // NEW: Time signature from Spotify
  readonly timeSignature?: number | null
}

// NEW: Attribution metadata for BPM source
export interface BpmAttribution {
  readonly provider: string
  readonly url?: string
  readonly requiresBacklink: boolean
}
```

**Acceptance Criteria**:
- `timeSignature` field added (optional for backward compatibility)
- `BpmAttribution` type defined
- Existing `source` and `key` fields preserved

---

### Task 5.4: Update Song Loader for Embedded Tempo

**File**: `src/services/song-loader.ts`
**Location**: Lines 228-286 (verified - `fireAndForgetBpmFetch` function)

The BPM fetch logic is in `fireAndForgetBpmFetch()` starting at line 228. Add embedded tempo check before provider cascade:

```typescript
function fireAndForgetBpmFetch(
  songId: string,
  title: string,
  artist: string,
  spotifyId: string | undefined,
  embeddedTempo?: { tempo: number | null; musicalKey: number | null; mode: number | null } // NEW
) {
  // NEW: Check embedded tempo first
  if (embeddedTempo?.tempo) {
    const bpm = Math.round(embeddedTempo.tempo)
    const key = formatMusicalKey(embeddedTempo.musicalKey, embeddedTempo.mode)
    // Update DB and return early
    await db.update(songs).set({ bpm, musicalKey: key, bpmSource: "Spotify" })...
    return
  }

  // Existing provider cascade logic (lines 235-286)
  const bpmEffect = BpmProviders.pipe(...)
}
```

**Acceptance Criteria**:
- Embedded tempo checked before provider cascade
- Musical key formatted using `formatMusicalKey()`
- Attribution shows "Spotify" for embedded BPM
- Falls back to existing cascade when no embedded tempo

---

### Task 5.5: Add Turso Lookup to Song Loader

**File**: `src/services/song-loader.ts`

Add Turso service dependency and fetch track data for embedded tempo.

**Acceptance Criteria**:
- TursoService imported
- Track fetched by LRCLIB ID
- Embedded tempo extracted if available

---

### Task 5.6: Update Lyrics API Response

**File**: `src/lib/lyrics-api-types.ts`
**Location**: Lines 18-28

Consider adding timeSignature to response:

```typescript
export interface LyricsApiSuccessResponse {
  readonly lyrics: Lyrics
  readonly bpm: number | null
  readonly key: string | null
  readonly timeSignature?: number | null  // NEW
  readonly albumArt?: string | null
  readonly albumArtLarge?: string | null
  readonly spotifyId?: string | null
  readonly attribution: LyricsApiAttribution
  readonly hasEnhancement?: boolean
  readonly hasChordEnhancement?: boolean
}
```

**Acceptance Criteria**:
- timeSignature field added (optional)
- Response includes embedded metadata

---

## Phase 6: Documentation & Cleanup

**Dependencies**: All previous phases complete
**Spec**: [006-documentation-cleanup.md](specs/006-documentation-cleanup.md)

### Task 6.1: Update Technical Reference

**File**: `docs/technical-reference.md`

Add "Search Architecture" section:
- Turso-first search flow
- Popularity-based ranking
- Album art resolution chain
- BPM resolution priority

**Acceptance Criteria**:
- Architecture accurately documented
- Flow diagrams updated
- Field descriptions complete

---

### Task 6.2: Update Search Optimization Plan

**File**: `docs/search-optimization-plan.md`

Mark Turso-first as implemented:
- Update status to "Implemented"
- Document actual match rate (~80%)
- Note performance improvements

**Acceptance Criteria**:
- Status reflects current implementation
- Metrics documented

---

### Task 6.3: Update CLAUDE.md

**File**: `CLAUDE.md`
**Location**: Database section (lines 73-82)

Add note about Spotify enrichment:
```markdown
### Turso (LRCLIB Search Index)
- ~4.2M songs, FTS5 search
- **Always use MATCH queries**, never LIKE
- Turso-first search with popularity ranking
- Spotify enrichment: BPM, key, album art (nullable)
```

**Acceptance Criteria**:
- Enrichment documented
- Ranking strategy noted

---

### Task 6.4: Remove Deprecated Code

**Files to review**:
- `src/app/api/search/verify/route.ts` - Remove if unused
- `src/app/api/search/route.ts` - Remove dead code
- `src/lib/spotify-client.ts` - Remove search-only functions if unused

**Acceptance Criteria**:
- No orphan imports
- No unused functions
- TypeScript compiles cleanly

---

### Task 6.5: Create Metrics Module

**File**: `src/lib/metrics.ts` (NEW FILE)

```typescript
interface SearchMetric {
  readonly event: "search"
  readonly query: string
  readonly resultCount: number
  readonly source: "turso" | "lrclib-api"
  readonly latencyMs: number
  readonly timestamp: string
}

interface BpmMetric {
  readonly event: "bpm_lookup"
  readonly lrclibId: number
  readonly source: "embedded" | "reccobeats" | "getsongbpm" | "deezer" | "rapidapi" | "none"
  readonly latencyMs: number
  readonly timestamp: string
}

interface AlbumArtMetric {
  readonly event: "album_art"
  readonly source: "stored" | "isrc" | "search" | "none"
  readonly latencyMs: number
  readonly timestamp: string
}

export function logSearchMetrics(metric: SearchMetric): void {
  console.log(JSON.stringify(metric))
}

export function logBpmMetrics(metric: BpmMetric): void {
  console.log(JSON.stringify(metric))
}

export function logAlbumArtMetrics(metric: AlbumArtMetric): void {
  console.log(JSON.stringify(metric))
}
```

**Acceptance Criteria**:
- Structured JSON logging
- Source tracking for each metric type
- Latency captured

---

### Task 6.6: Final Validation

**Command**:
```bash
bun run check
```

**Acceptance Criteria**:
- `biome check .` passes
- `bun run typecheck` passes
- `bun run test` passes
- No console errors in `bun run dev`

---

## Critical Paths

```
Phase 1 (Rust) ──────► Phase 2 (Turso) ──────► Phase 3 (Search API)
                                        │
                                        ├────► Phase 4 (Album Art)
                                        │
                                        └────► Phase 5 (BPM)
                                                      │
                                                      ▼
                                              Phase 6 (Docs)
```

**Parallelization Opportunities**:
- Phase 3, 4, 5 can be worked in parallel after Phase 2
- Tasks within each phase are mostly sequential
- Documentation (Phase 6) depends on all code changes

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Search latency (p50) | ~500ms | ~100ms |
| Album art latency | ~200ms | ~0ms (stored) |
| BPM availability | ~70% | ~85% |
| Spotify API calls/search | 1 | 0 |
| External dependencies | 5 | 1 (Deezer fallback) |
| Turso storage | ~600MB | ~1.05GB |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Low match rate | Accept ~80%; fallback to providers for BPM |
| Spotify URLs expire | Fall back to Deezer ISRC → search |
| Memory usage | Filter by `min_popularity > 0` |
| Extraction time | Use `--artists` for testing |

---

## File Reference (Verified Line Numbers)

### Files to Modify

| File | Phase | Key Lines | Changes |
|------|-------|-----------|---------|
| `scripts/lrclib-extract/src/main.rs` | 1 | 12-29 (Args), 33-48 (structs), 467-522 (write) | Add Spotify enrichment |
| `src/services/turso.ts` | 2 | 6-13 (interface), 55-89 (search), 91-121 (getById), 123-182 (findByTitleArtist) | Update interface and queries |
| `src/app/api/search/route.ts` | 3 | 7-12 (imports), 39-67 (findLrclibMatch), 72-114 (searchSpotifyWithTurso), 237-265 (search) | Remove Spotify, simplify flow |
| `src/lib/search-api-types.ts` | 3 | 5-15 | Add popularity/tempo fields |
| `src/lib/deezer-client.ts` | 4 | 75-131 | Add ISRC lookup function |
| `src/lib/bpm/bpm-types.ts` | 5 | 17-21 | Add timeSignature field |
| `src/services/song-loader.ts` | 5 | 228-286 | Integrate embedded tempo check |
| `src/lib/lyrics-api-types.ts` | 5 | 18-28 (LyricsApiSuccessResponse) | Add timeSignature field |
| `docs/technical-reference.md` | 6 | N/A | Update architecture |
| `docs/search-optimization-plan.md` | 6 | N/A | Mark implemented |
| `CLAUDE.md` | 6 | 73-82 | Add enrichment note |

### New Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/album-art.ts` | 4 | Three-tier album art resolution |
| `src/lib/musical-key.ts` | 5 | Format pitch class + mode to key string |
| `src/lib/bpm/bpm-resolver.ts` | 5 | Unified BPM resolution with embedded priority |
| `src/lib/metrics.ts` | 6 | Structured JSON logging for observability |

### Files to Keep (Previously Considered for Removal)

| File | Reason to Keep |
|------|----------------|
| `src/app/api/search/verify/route.ts` | Uses LRCLIB API directly, independent of Spotify search flow |

### Functions to Remove (in search/route.ts)

| Function | Lines | Reason |
|----------|-------|--------|
| `findLrclibMatch()` | 39-67 | Replaced by Turso-first search |
| `searchSpotifyWithTurso()` | 72-114 | Replaced by Turso-first search |
| `SpotifyTrackWithLrclib` interface | 28-34 | No longer needed |
